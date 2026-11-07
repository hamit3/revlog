-- SPEC Item 1: BOM/PnP parsing and consistency check runs per product release
-- Stored check runs are append-only on draft releases and permanently frozen once published.

-- ============================================================================
-- 1. Table & Indexes: public.bom_pnp_check_runs
-- ============================================================================

create table public.bom_pnp_check_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  product_id uuid not null,
  release_id uuid not null references public.releases(id) on delete cascade,
  bom_item_id uuid null references public.items(id) on delete set null,
  pnp_item_id uuid null references public.items(id) on delete set null,
  bom_file_name text null,
  bom_sha256 text null,
  pnp_file_name text null,
  pnp_sha256 text null,
  column_mapping jsonb not null default '{}'::jsonb,
  parsed_bom jsonb not null default '[]'::jsonb,
  parsed_pnp jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint bom_pnp_check_runs_product_project_fk
    foreign key (product_id, project_id)
    references public.products(id, project_id)
    on delete cascade,
  constraint bom_pnp_check_runs_source_present_check
    check (bom_file_name is not null or pnp_file_name is not null),
  constraint bom_pnp_check_runs_json_shapes_check
    check (
      jsonb_typeof(column_mapping) = 'object'
      and jsonb_typeof(parsed_bom) = 'array'
      and jsonb_typeof(parsed_pnp) = 'array'
      and jsonb_typeof(findings) = 'array'
      and jsonb_typeof(summary) = 'object'
    )
);

create index bom_pnp_check_runs_release_created_idx
  on public.bom_pnp_check_runs (release_id, created_at desc);

create index bom_pnp_check_runs_product_created_idx
  on public.bom_pnp_check_runs (product_id, created_at desc);

create index bom_pnp_check_runs_project_idx
  on public.bom_pnp_check_runs (project_id);

create index bom_pnp_check_runs_created_by_idx
  on public.bom_pnp_check_runs (created_by);

create index bom_pnp_check_runs_bom_item_idx
  on public.bom_pnp_check_runs (bom_item_id);

create index bom_pnp_check_runs_pnp_item_idx
  on public.bom_pnp_check_runs (pnp_item_id);

-- ============================================================================
-- 2. Immutability, Cross-Tenant Integrity & Activity Triggers
-- ============================================================================

create or replace function public.enforce_bom_pnp_check_runs_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release_status text;
  v_release_project_id uuid;
  v_release_product_id uuid;
  v_item_project_id uuid;
  v_item_product_id uuid;
begin
  if tg_op = 'INSERT' then
    select r.status, r.project_id, r.product_id
      into v_release_status, v_release_project_id, v_release_product_id
      from public.releases r
     where r.id = new.release_id;

    if v_release_project_id is null then
      raise exception 'Target release does not exist.';
    end if;

    if v_release_project_id is distinct from new.project_id
       or v_release_product_id is distinct from new.product_id then
      raise exception 'Check run project and product must match the target release.';
    end if;

    if v_release_status <> 'draft' then
      raise exception 'Cannot record a check run on a published release; stored results are read-only once published.';
    end if;

    if new.bom_item_id is not null then
      select i.project_id, i.product_id
        into v_item_project_id, v_item_product_id
        from public.items i
       where i.id = new.bom_item_id;

      if v_item_project_id is distinct from new.project_id
         or v_item_product_id is distinct from new.product_id then
        raise exception 'BOM item does not belong to the release product.';
      end if;
    end if;

    if new.pnp_item_id is not null then
      select i.project_id, i.product_id
        into v_item_project_id, v_item_product_id
        from public.items i
       where i.id = new.pnp_item_id;

      if v_item_project_id is distinct from new.project_id
         or v_item_product_id is distinct from new.product_id then
        raise exception 'PnP item does not belong to the release product.';
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Stored BOM/PnP check runs are immutable; run a new check on the release draft instead.';
  end if;

  if tg_op = 'DELETE' then
    select r.status
      into v_release_status
      from public.releases r
     where r.id = old.release_id;

    if v_release_status = 'published' then
      raise exception 'Cannot delete check runs belonging to a published release.';
    end if;

    return old;
  end if;

  return null;
end;
$$;

revoke execute on function public.enforce_bom_pnp_check_runs_immutability() from public, anon, authenticated;

create trigger prevent_bom_pnp_check_runs_changes
  before insert or update or delete on public.bom_pnp_check_runs
  for each row execute function public.enforce_bom_pnp_check_runs_immutability();

create trigger bom_pnp_check_runs_touch_project
  after insert or delete on public.bom_pnp_check_runs
  for each row execute function public.touch_parent_project();

create trigger bom_pnp_check_runs_touch_product
  after insert or delete on public.bom_pnp_check_runs
  for each row execute function public.touch_parent_product();

-- ============================================================================
-- 3. Profile Visibility Helper Update (preserving all existing branches)
-- ============================================================================

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
      join public.products pr
        on pr.project_id = my_pm.project_id
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
        and r.published_by = p_profile_id
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

revoke execute on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- ============================================================================
-- 4. Row Level Security Policies & Explicit Grants
-- ============================================================================

alter table public.bom_pnp_check_runs enable row level security;

create policy bom_pnp_check_runs_select_policy
  on public.bom_pnp_check_runs
  for select
  to authenticated
  using (public.is_project_member(project_id));

create policy bom_pnp_check_runs_insert_policy
  on public.bom_pnp_check_runs
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
    and exists (
      select 1
      from public.releases r
      where r.id = release_id
        and r.project_id = bom_pnp_check_runs.project_id
        and r.product_id = bom_pnp_check_runs.product_id
        and r.status = 'draft'
    )
  );

create policy bom_pnp_check_runs_delete_policy
  on public.bom_pnp_check_runs
  for delete
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
    and exists (
      select 1
      from public.releases r
      where r.id = release_id
        and r.status = 'draft'
    )
  );

revoke all on public.bom_pnp_check_runs from public, anon;
grant select, insert, delete on public.bom_pnp_check_runs to authenticated;
