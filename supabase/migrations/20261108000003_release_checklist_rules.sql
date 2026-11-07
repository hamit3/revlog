-- ============================================================================
-- Migration: 20261108000003_release_checklist_rules.sql
-- Roadmap: SPEC.md Phase 1, Item 5: Completeness checklist
-- ============================================================================

-- 1. Table: release_checklist_rules
create table if not exists public.release_checklist_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category_name text not null,
  item_name_pattern text not null,
  severity text not null default 'warning' check (severity in ('warning', 'blocking')),
  description text,
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_checklist_rules_category_name_not_empty check (trim(category_name) <> ''),
  constraint release_checklist_rules_pattern_not_empty check (trim(item_name_pattern) <> '')
);

alter table public.release_checklist_rules enable row level security;

create index if not exists idx_release_checklist_rules_project
  on public.release_checklist_rules (project_id, position asc, created_at asc);

-- Touch parent project updated_at on rule changes
create trigger release_checklist_rules_touch_project
  after insert or update or delete on public.release_checklist_rules
  for each row execute function public.touch_parent_project();

-- 2. Row Level Security Policies
-- Members can view rules for their project
create policy release_checklist_rules_select_policy
  on public.release_checklist_rules
  for select
  to authenticated
  using (public.is_project_member(project_id));

-- Owners and members can insert rules; only owners can create blocking rules
create policy release_checklist_rules_insert_policy
  on public.release_checklist_rules
  for insert
  to authenticated
  with check (
    not public.is_project_archived(project_id)
    and (
      (severity = 'blocking' and public.project_role(project_id) = 'owner')
      or
      (severity = 'warning' and public.project_role(project_id) in ('owner', 'member'))
    )
  );

-- Owners can update any rule; members can update warning rules but cannot escalate to blocking
create policy release_checklist_rules_update_policy
  on public.release_checklist_rules
  for update
  to authenticated
  using (
    not public.is_project_archived(project_id)
    and public.project_role(project_id) in ('owner', 'member')
  )
  with check (
    not public.is_project_archived(project_id)
    and (
      (severity = 'blocking' and public.project_role(project_id) = 'owner')
      or
      (severity = 'warning' and public.project_role(project_id) in ('owner', 'member'))
    )
  );

-- Owners and members can delete rules
create policy release_checklist_rules_delete_policy
  on public.release_checklist_rules
  for delete
  to authenticated
  using (
    not public.is_project_archived(project_id)
    and public.project_role(project_id) in ('owner', 'member')
  );

-- 3. Explicit Grants
revoke all on public.release_checklist_rules from public, anon;
grant select, insert, update, delete on public.release_checklist_rules to authenticated;

