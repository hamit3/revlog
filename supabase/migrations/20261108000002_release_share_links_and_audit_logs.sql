-- ============================================================================
-- Migration: 20261108000002_release_share_links_and_audit_logs.sql
-- Roadmap: SPEC.md Phase 1, Item 4: Expiring share link & audit logging
-- ============================================================================

-- 1. Audit Logs Table (Append-only)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create index if not exists idx_audit_logs_project_created
  on public.audit_logs (project_id, created_at desc);

create index if not exists idx_audit_logs_target
  on public.audit_logs (target_type, target_id);

-- Enforce append-only on audit_logs
create or replace function public.enforce_audit_logs_immutability()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit logs are strictly append-only and cannot be modified or deleted.';
end;
$$;

create trigger audit_logs_prevent_modifications
  before update or delete on public.audit_logs
  for each row execute function public.enforce_audit_logs_immutability();

-- RLS: Project members can view audit logs for their projects
create policy audit_logs_select_policy
  on public.audit_logs
  for select
  to authenticated
  using (public.is_project_member(project_id));


-- 2. Release Share Links Table
create table if not exists public.release_share_links (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint release_share_links_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint release_share_links_expiry_check check (expires_at > created_at)
);

alter table public.release_share_links enable row level security;

create index if not exists idx_release_share_links_lookup
  on public.release_share_links (token_hash)
  where revoked_at is null;

create index if not exists idx_release_share_links_release
  on public.release_share_links (release_id, created_at desc);

-- RLS: Project members can view share links for their project
create policy release_share_links_select_policy
  on public.release_share_links
  for select
  to authenticated
  using (public.is_project_member(project_id));


-- 3. Storage Bucket Policy: Allow download of release files when referenced by an active share link
create policy project_files_shared_select_policy
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1
      from public.release_items ri
      join public.release_share_links rsl on rsl.release_id = ri.release_id
      where ri.storage_path = storage.objects.name
        and rsl.revoked_at is null
        and rsl.expires_at > now()
    )
  );


-- 4. RPC: create_release_share_link
create or replace function public.create_release_share_link(
  p_release_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns public.release_share_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rel record;
  v_link public.release_share_links;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to create a share link.';
  end if;

  select id, project_id, product_id, status, version_label
    into v_rel
    from public.releases
   where id = p_release_id;

  if not found then
    raise exception 'Release not found.';
  end if;

  if v_rel.status <> 'published' then
    raise exception 'Share links can only be created for published releases.';
  end if;

  if coalesce(public.project_role(v_rel.project_id), '') not in ('owner', 'member') then
    raise exception 'Only project owners and members can create share links.';
  end if;

  if public.is_project_archived(v_rel.project_id) then
    raise exception 'Cannot create share links for archived projects.';
  end if;

  if p_expires_at <= now() then
    raise exception 'Expiration time must be in the future.';
  end if;

  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid token hash format. Expected 64-character lowercase hex string.';
  end if;

  insert into public.release_share_links (
    release_id,
    project_id,
    product_id,
    token_hash,
    expires_at,
    created_by
  )
  values (
    v_rel.id,
    v_rel.project_id,
    v_rel.product_id,
    lower(p_token_hash),
    p_expires_at,
    auth.uid()
  )
  returning * into v_link;

  -- Record audit log
  insert into public.audit_logs (
    project_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    v_rel.project_id,
    auth.uid(),
    'share_link.created',
    'release_share_link',
    v_link.id,
    jsonb_build_object(
      'release_id', v_rel.id,
      'product_id', v_rel.product_id,
      'version_label', v_rel.version_label,
      'expires_at', p_expires_at
    )
  );

  return v_link;
end;
$$;


-- 5. RPC: revoke_release_share_link
create or replace function public.revoke_release_share_link(
  p_link_id uuid
)
returns public.release_share_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.release_share_links;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to revoke a share link.';
  end if;

  select * into v_link
    from public.release_share_links
   where id = p_link_id;

  if not found then
    raise exception 'Share link not found.';
  end if;

  if coalesce(public.project_role(v_link.project_id), '') not in ('owner', 'member') then
    raise exception 'Only project owners and members can revoke share links.';
  end if;

  if v_link.revoked_at is not null then
    return v_link; -- Already revoked, idempotent
  end if;

  update public.release_share_links
     set revoked_at = now()
   where id = p_link_id
  returning * into v_link;

  -- Record audit log
  insert into public.audit_logs (
    project_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    v_link.project_id,
    auth.uid(),
    'share_link.revoked',
    'release_share_link',
    v_link.id,
    jsonb_build_object(
      'release_id', v_link.release_id,
      'product_id', v_link.product_id,
      'revoked_at', v_link.revoked_at
    )
  );

  return v_link;
end;
$$;


-- 6. RPC: get_public_shared_release (Public, accessible to anon & authenticated)
create or replace function public.get_public_shared_release(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_proj record;
  v_prod record;
  v_rel record;
  v_publisher_name text;
  v_items jsonb;
begin
  -- Validate token hash
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  -- Lookup active, non-expired, non-revoked link
  select *
    into v_link
    from public.release_share_links
   where token_hash = lower(p_token_hash)
     and revoked_at is null
     and expires_at > now();

  if not found then
    return null;
  end if;

  -- Get release details
  select r.id, r.version_label, r.notes, r.created_at, r.published_at, r.manifest_hash,
         p.full_name, p.email
    into v_rel
    from public.releases r
    left join public.profiles p on p.id = r.published_by
   where r.id = v_link.release_id
     and r.status = 'published';

  if not found then
    return null;
  end if;

  -- Get project details
  select id, name, description
    into v_proj
    from public.projects
   where id = v_link.project_id;

  -- Get product details
  select id, name, code, product_type, description
    into v_prod
    from public.products
   where id = v_link.product_id;

  v_publisher_name := coalesce(v_rel.full_name, v_rel.email, 'Unknown');

  -- Get release items snapshot
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ri.id,
        'title', ri.title,
        'kind', ri.kind,
        'version_label', ri.version_label,
        'file_name', ri.file_name,
        'file_size', ri.file_size,
        'sha256', ri.sha256,
        'url', ri.url,
        'storage_path', ri.storage_path,
        'category_name', ri.category_name,
        'category_position', ri.category_position
      )
      order by ri.category_position asc, ri.title asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.release_items ri
  where ri.release_id = v_rel.id;

  return jsonb_build_object(
    'link', jsonb_build_object(
      'id', v_link.id,
      'expires_at', v_link.expires_at,
      'created_at', v_link.created_at
    ),
    'project', jsonb_build_object(
      'id', v_proj.id,
      'name', v_proj.name,
      'description', v_proj.description
    ),
    'product', jsonb_build_object(
      'id', v_prod.id,
      'name', v_prod.name,
      'code', v_prod.code,
      'product_type', v_prod.product_type
    ),
    'release', jsonb_build_object(
      'id', v_rel.id,
      'version_label', v_rel.version_label,
      'notes', v_rel.notes,
      'release_date', v_rel.published_at,
      'created_at', v_rel.created_at,
      'published_at', v_rel.published_at,
      'manifest_hash', v_rel.manifest_hash,
      'publisher', v_publisher_name
    ),
    'items', v_items
  );
end;
$$;

-- Explicit Function and Table Permissions
revoke all on public.audit_logs from public, anon;
grant select on public.audit_logs to authenticated;

revoke all on public.release_share_links from public, anon;
grant select on public.release_share_links to authenticated;

grant execute on function public.create_release_share_link(uuid, text, timestamptz) to authenticated;
grant execute on function public.revoke_release_share_link(uuid) to authenticated;
grant execute on function public.get_public_shared_release(text) to anon, authenticated;
