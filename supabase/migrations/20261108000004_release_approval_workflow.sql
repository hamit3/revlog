-- ============================================================================
-- Migration: 20261108000004_release_approval_workflow.sql
-- Roadmap: SPEC.md Phase 1, Item 6: Approval step before publishing
-- ============================================================================

-- 1. Project level approval setting
alter table public.projects
  add column if not exists require_release_approval boolean not null default false;

-- 2. Release review and approval columns
alter table public.releases
  add column if not exists created_by uuid references public.profiles(id) default (auth.uid()),
  add column if not exists submitted_for_review_at timestamptz,
  add column if not exists submitted_for_review_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approval_notes text;

-- Backfill created_by for any existing legacy releases
update public.releases
   set created_by = coalesce(
     published_by,
     (
       select pm.user_id
       from public.project_members pm
       where pm.project_id = releases.project_id
         and pm.role = 'owner'
       order by pm.created_at asc
       limit 1
     )
   )
 where created_by is null;

-- Indexes for review/approval lookups
create index if not exists releases_created_by_idx
  on public.releases (created_by)
  where created_by is not null;

create index if not exists releases_submitted_for_review_by_idx
  on public.releases (submitted_for_review_by)
  where submitted_for_review_by is not null;

create index if not exists releases_approved_by_idx
  on public.releases (approved_by)
  where approved_by is not null;

-- 3. Check constraints on public.releases
alter table public.releases drop constraint if exists releases_status_check;
alter table public.releases
  add constraint releases_status_check
  check (status in ('draft', 'in_review', 'approved', 'published'));

alter table public.releases drop constraint if exists releases_published_fields_check;
alter table public.releases
  add constraint releases_published_fields_check check (
    (
      status = 'draft'
      and published_at is null
      and published_by is null
      and manifest_hash is null
    )
    or
    (
      status = 'in_review'
      and published_at is null
      and published_by is null
      and manifest_hash is null
      and submitted_for_review_at is not null
      and submitted_for_review_by is not null
    )
    or
    (
      status = 'approved'
      and published_at is null
      and published_by is null
      and manifest_hash is null
      and approved_at is not null
      and approved_by is not null
      and approved_by <> coalesce(submitted_for_review_by, created_by)
      and (created_by is null or approved_by <> created_by)
    )
    or
    (
      status = 'published'
      and published_at is not null
      and published_by is not null
      and manifest_hash is not null
      and manifest_hash ~ '^[0-9a-f]{64}$'
    )
  );

-- 4. Update can_view_profile to include release submitter, approver, and author
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.project_members my_pm
      join public.project_members other_pm
        on other_pm.project_id = my_pm.project_id
      where my_pm.user_id = (select auth.uid())
        and other_pm.user_id = p_profile_id
    )
    or exists (
      select 1
      from public.project_members my_pm
      join public.projects pr
        on pr.id = my_pm.project_id
      where my_pm.user_id = (select auth.uid())
        and pr.created_by = p_profile_id
    )
    or exists (
      select 1
      from public.project_members my_pm
      join public.items i
        on i.project_id = my_pm.project_id
      where my_pm.user_id = (select auth.uid())
        and i.created_by = p_profile_id
    )
    or exists (
      select 1
      from public.project_members my_pm
      join public.releases r
        on r.project_id = my_pm.project_id
      where my_pm.user_id = (select auth.uid())
        and (
          r.published_by = p_profile_id
          or r.created_by = p_profile_id
          or r.submitted_for_review_by = p_profile_id
          or r.approved_by = p_profile_id
        )
    )
    or exists (
      select 1
      from public.project_members my_pm
      join public.project_releases pr_rel
        on pr_rel.project_id = my_pm.project_id
      where my_pm.user_id = (select auth.uid())
        and pr_rel.published_by = p_profile_id
    )
    or exists (
      select 1
      from public.project_members my_pm
      join public.bom_pnp_check_runs cr
        on cr.project_id = my_pm.project_id
      where my_pm.user_id = (select auth.uid())
        and cr.created_by = p_profile_id
    );
$$;

-- 5. RPC: submit_release_for_review
create or replace function public.submit_release_for_review(p_release_id uuid)
returns public.releases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_release public.releases;
  v_role text;
  v_item_count integer;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_release
    from public.releases
   where id = p_release_id
   for update;

  if v_release.id is null then
    raise exception 'Release not found.';
  end if;

  v_role := public.project_role(v_release.project_id);
  if v_role is null or v_role not in ('owner', 'member') then
    raise exception 'Only project owners or members can submit releases for review.';
  end if;

  if public.is_project_archived(v_release.project_id) then
    raise exception 'Cannot submit releases for review in an archived project.';
  end if;

  if public.is_product_archived(v_release.product_id) then
    raise exception 'Cannot submit releases for review in an archived product.';
  end if;

  if v_release.status <> 'draft' then
    raise exception 'Only draft releases can be submitted for review.';
  end if;

  select count(*)::integer
    into v_item_count
    from public.release_items
   where release_id = p_release_id;

  if v_item_count < 1 then
    raise exception 'Release must contain at least one item before submitting for review.';
  end if;

  update public.releases
     set status = 'in_review',
         submitted_for_review_at = now(),
         submitted_for_review_by = v_caller_id
   where id = p_release_id
   returning * into v_release;

  insert into public.audit_logs (
    project_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_release.project_id,
    v_caller_id,
    'release.submitted_for_review',
    'release',
    v_release.id,
    jsonb_build_object(
      'version_label', v_release.version_label,
      'product_id', v_release.product_id
    )
  );

  return v_release;
end;
$$;

-- 6. RPC: approve_release
create or replace function public.approve_release(
  p_release_id uuid,
  p_notes text default null
)
returns public.releases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_release public.releases;
  v_role text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_release
    from public.releases
   where id = p_release_id
   for update;

  if v_release.id is null then
    raise exception 'Release not found.';
  end if;

  v_role := public.project_role(v_release.project_id);
  if v_role is null or v_role not in ('owner', 'member') then
    raise exception 'Only project owners or members can approve releases.';
  end if;

  if public.is_project_archived(v_release.project_id) then
    raise exception 'Cannot approve releases in an archived project.';
  end if;

  if public.is_product_archived(v_release.product_id) then
    raise exception 'Cannot approve releases in an archived product.';
  end if;

  if v_release.status <> 'in_review' then
    raise exception 'Only releases currently in review can be approved.';
  end if;

  if v_caller_id = v_release.submitted_for_review_by
     or (v_release.created_by is not null and v_caller_id = v_release.created_by) then
    raise exception 'Releases cannot be approved by the author or submitter; approval requires a second person.';
  end if;

  update public.releases
     set status = 'approved',
         approved_at = now(),
         approved_by = v_caller_id,
         approval_notes = nullif(btrim(p_notes), '')
   where id = p_release_id
   returning * into v_release;

  insert into public.audit_logs (
    project_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_release.project_id,
    v_caller_id,
    'release.approved',
    'release',
    v_release.id,
    jsonb_build_object(
      'version_label', v_release.version_label,
      'product_id', v_release.product_id,
      'notes', nullif(btrim(p_notes), '')
    )
  );

  return v_release;
end;
$$;

-- 7. RPC: reject_release
create or replace function public.reject_release(
  p_release_id uuid,
  p_notes text default null
)
returns public.releases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_release public.releases;
  v_role text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_release
    from public.releases
   where id = p_release_id
   for update;

  if v_release.id is null then
    raise exception 'Release not found.';
  end if;

  v_role := public.project_role(v_release.project_id);
  if v_role is null or v_role not in ('owner', 'member') then
    raise exception 'Only project owners or members can reject releases.';
  end if;

  if public.is_project_archived(v_release.project_id) then
    raise exception 'Cannot reject releases in an archived project.';
  end if;

  if public.is_product_archived(v_release.product_id) then
    raise exception 'Cannot reject releases in an archived product.';
  end if;

  if v_release.status not in ('in_review', 'approved') then
    raise exception 'Only releases currently in review or approved can be rejected.';
  end if;

  update public.releases
     set status = 'draft',
         submitted_for_review_at = null,
         submitted_for_review_by = null,
         approved_at = null,
         approved_by = null,
         approval_notes = nullif(btrim(p_notes), '')
   where id = p_release_id
   returning * into v_release;

  insert into public.audit_logs (
    project_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_release.project_id,
    v_caller_id,
    'release.rejected',
    'release',
    v_release.id,
    jsonb_build_object(
      'version_label', v_release.version_label,
      'product_id', v_release.product_id,
      'notes', nullif(btrim(p_notes), '')
    )
  );

  return v_release;
end;
$$;

-- 8. RPC: cancel_release_review
create or replace function public.cancel_release_review(p_release_id uuid)
returns public.releases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_release public.releases;
  v_role text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_release
    from public.releases
   where id = p_release_id
   for update;

  if v_release.id is null then
    raise exception 'Release not found.';
  end if;

  v_role := public.project_role(v_release.project_id);
  if v_role is null or v_role not in ('owner', 'member') then
    raise exception 'Only project owners or members can cancel a release review.';
  end if;

  if public.is_project_archived(v_release.project_id) then
    raise exception 'Cannot cancel release review in an archived project.';
  end if;

  if public.is_product_archived(v_release.product_id) then
    raise exception 'Cannot cancel release review in an archived product.';
  end if;

  if v_release.status <> 'in_review' then
    raise exception 'Only releases currently in review can have review cancelled.';
  end if;

  update public.releases
     set status = 'draft',
         submitted_for_review_at = null,
         submitted_for_review_by = null,
         approved_at = null,
         approved_by = null
   where id = p_release_id
   returning * into v_release;

  insert into public.audit_logs (
    project_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_release.project_id,
    v_caller_id,
    'release.review_cancelled',
    'release',
    v_release.id,
    jsonb_build_object(
      'version_label', v_release.version_label,
      'product_id', v_release.product_id
    )
  );

  return v_release;
end;
$$;

-- 9. Update RPC: publish_release with optional project approval enforcement
create or replace function public.publish_release(p_release_id uuid)
returns public.releases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_release public.releases;
  v_role text;
  v_item_count integer;
  v_manifest_json text;
  v_manifest_hash text;
  v_require_approval boolean;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_release
    from public.releases
   where id = p_release_id
   for update;

  if v_release.id is null then
    raise exception 'Release not found.';
  end if;

  v_role := public.project_role(v_release.project_id);
  if v_role is null or v_role not in ('owner', 'member') then
    raise exception 'Only project owners or members can publish releases.';
  end if;

  if public.is_project_archived(v_release.project_id) then
    raise exception 'Cannot publish releases in an archived project.';
  end if;

  if public.is_product_archived(v_release.product_id) then
    raise exception 'Cannot publish releases in an archived product.';
  end if;

  select require_release_approval
    into v_require_approval
    from public.projects
   where id = v_release.project_id;

  if coalesce(v_require_approval, false) then
    if v_release.status <> 'approved' then
      raise exception 'This project requires release approval by a second person before publishing.';
    end if;
  else
    if v_release.status not in ('draft', 'approved') then
      raise exception 'Only draft or approved releases can be published.';
    end if;
  end if;

  select count(*)::integer
    into v_item_count
    from public.release_items
   where release_id = p_release_id;

  if v_item_count < 1 then
    raise exception 'Release must contain at least one item before publishing.';
  end if;

  if exists (
    select 1
      from public.release_items ri
      join public.items i on i.id = ri.item_id
     where ri.release_id = p_release_id
       and (i.project_id <> v_release.project_id or i.product_id <> v_release.product_id)
  ) then
    raise exception 'Selected items must belong to the release product.';
  end if;

  update public.release_items ri
     set category_name = c.name,
         category_position = c.position,
         title = i.title,
         kind = i.kind,
         version_label = coalesce(i.version_label, ''),
         url = i.url,
         storage_path = i.storage_path,
         file_name = i.file_name,
         file_size = i.file_size,
         sha256 = i.sha256
    from public.items i
    join public.categories c on c.id = i.category_id
   where ri.release_id = p_release_id
     and ri.item_id = i.id;

  select
    '[' || coalesce(
      string_agg(
        '{'
        || '"category_name":' || to_json(ri.category_name)::text
        || ',"category_position":' || to_json(ri.category_position)::text
        || ',"file_name":' || coalesce(to_json(ri.file_name)::text, 'null')
        || ',"file_size":' || coalesce(to_json(ri.file_size)::text, 'null')
        || ',"kind":' || to_json(ri.kind)::text
        || ',"sha256":' || coalesce(to_json(ri.sha256)::text, 'null')
        || ',"title":' || to_json(ri.title)::text
        || ',"url":' || coalesce(to_json(ri.url)::text, 'null')
        || ',"version_label":' || to_json(coalesce(ri.version_label, ''))::text
        || '}',
        ','
        order by
          ri.category_position asc,
          ri.title collate "C" asc,
          ri.kind collate "C" asc,
          coalesce(ri.version_label, '') collate "C" asc,
          (
            case
              when ri.kind = 'file' then coalesce(ri.sha256, '')
              else coalesce(ri.url, '')
            end
          ) collate "C" asc
      ),
      ''
    ) || ']'
    into v_manifest_json
    from public.release_items ri
   where ri.release_id = p_release_id;

  v_manifest_hash := encode(
    digest(convert_to(v_manifest_json, 'UTF8'), 'sha256'),
    'hex'
  );

  update public.releases
     set status = 'published',
         published_at = now(),
         published_by = v_caller_id,
         manifest_hash = v_manifest_hash
   where id = p_release_id
   returning * into v_release;

  insert into public.audit_logs (
    project_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_release.project_id,
    v_caller_id,
    'release.published',
    'release',
    v_release.id,
    jsonb_build_object(
      'version_label', v_release.version_label,
      'product_id', v_release.product_id,
      'manifest_hash', v_manifest_hash
    )
  );

  return v_release;
end;
$$;

-- 10. RLS policies on public.releases
drop policy if exists releases_update_draft_policy on public.releases;
create policy releases_update_draft_policy
  on public.releases
  for update
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
    and status = 'draft'
  )
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
    and status = 'draft'
  );

-- 11. Explicit function grants
revoke execute on function public.submit_release_for_review(uuid) from public, anon;
grant execute on function public.submit_release_for_review(uuid) to authenticated;

revoke execute on function public.approve_release(uuid, text) from public, anon;
grant execute on function public.approve_release(uuid, text) to authenticated;

revoke execute on function public.reject_release(uuid, text) from public, anon;
grant execute on function public.reject_release(uuid, text) to authenticated;

revoke execute on function public.cancel_release_review(uuid) from public, anon;
grant execute on function public.cancel_release_review(uuid) to authenticated;

revoke execute on function public.publish_release(uuid) from public, anon;
grant execute on function public.publish_release(uuid) to authenticated;
