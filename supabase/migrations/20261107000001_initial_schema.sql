-- RevLog initial database schema, constraints, triggers, functions, RLS and storage policies.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table public.profiles (
  id uuid primary key default gen_random_uuid() references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  created_at timestamptz not null default now()
);

create index profiles_email_lower_idx on public.profiles (lower(email));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  constraint project_members_project_user_unique unique (project_id, user_id)
);

create index project_members_user_idx on public.project_members (user_id);
create index project_members_project_idx on public.project_members (project_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint categories_project_name_unique unique (project_id, name),
  constraint categories_id_project_unique unique (id, project_id)
);

create index categories_project_position_idx on public.categories (project_id, position, created_at);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id uuid not null,
  title text not null check (char_length(btrim(title)) > 0),
  kind text not null check (kind in ('file', 'link')),
  version_label text not null default '',
  note text,
  url text,
  storage_path text unique,
  file_name text,
  file_size bigint check (file_size is null or file_size >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint items_category_project_fk
    foreign key (category_id, project_id)
    references public.categories(id, project_id)
    on delete restrict,
  constraint items_kind_fields_check check (
    (
      kind = 'file'
      and storage_path is not null and char_length(btrim(storage_path)) > 0
      and file_name is not null and char_length(btrim(file_name)) > 0
      and sha256 is not null
      and url is null
    )
    or
    (
      kind = 'link'
      and url is not null and char_length(btrim(url)) > 0
      and storage_path is null
      and file_name is null
      and file_size is null
      and sha256 is null
    )
  )
);

create index items_project_category_idx on public.items (project_id, category_id, archived, created_at desc);

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_label text not null check (char_length(btrim(version_label)) > 0),
  notes text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  manifest_hash text,
  created_at timestamptz not null default now(),
  constraint releases_project_version_unique unique (project_id, version_label),
  constraint releases_published_fields_check check (
    (
      status = 'draft'
      and published_at is null
      and published_by is null
      and manifest_hash is null
    )
    or
    (
      status = 'published'
      and published_at is not null
      and published_by is not null
      and manifest_hash is not null
      and manifest_hash ~ '^[0-9a-f]{64}$'
    )
  )
);

create index releases_project_status_idx on public.releases (project_id, status, published_at desc, created_at desc);

create table public.release_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  category_name text,
  category_position integer,
  title text,
  kind text check (kind is null or kind in ('file', 'link')),
  version_label text,
  url text,
  storage_path text,
  file_name text,
  file_size bigint,
  sha256 text,
  created_at timestamptz not null default now(),
  constraint release_items_release_item_unique unique (release_id, item_id)
);

create index release_items_release_idx on public.release_items (release_id);
create index release_items_storage_path_idx on public.release_items (storage_path) where storage_path is not null;

-- ============================================================================
-- 2. Authorization & Utility Functions
-- ============================================================================

create or replace function public.project_role(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_archived(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.archived from public.projects p where p.id = p_project_id),
    false
  );
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profile_id = auth.uid()
    or exists (
      select 1
      from public.project_members my_pm
      join public.project_members other_pm
        on other_pm.project_id = my_pm.project_id
      where my_pm.user_id = auth.uid()
        and other_pm.user_id = p_profile_id
    )
    or exists (
      select 1
      from public.project_members my_pm
      join public.items i
        on i.project_id = my_pm.project_id
      where my_pm.user_id = auth.uid()
        and i.created_by = p_profile_id
    )
    or exists (
      select 1
      from public.project_members my_pm
      join public.releases r
        on r.project_id = my_pm.project_id
      where my_pm.user_id = auth.uid()
        and r.published_by = p_profile_id
    );
$$;

create or replace function public.storage_project_id(p_object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_first_segment text;
begin
  if p_object_name is null then
    return null;
  end if;
  v_first_segment := split_part(p_object_name, '/', 1);
  if v_first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first_segment::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.is_storage_path_referenced(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.release_items ri
    left join public.items i on i.id = ri.item_id
    where ri.storage_path = p_storage_path
       or i.storage_path = p_storage_path
  );
$$;

-- ============================================================================
-- 3. Triggers (Auth Profile Sync, Project Owner, Activity Timestamps, Immutability)
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_new_project_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_project_created_add_owner
  after insert on public.projects
  for each row execute function public.handle_new_project_owner();

create or replace function public.prevent_orphaned_project_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_exists boolean;
  v_remaining_owners integer;
begin
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' and new.project_id = old.project_id then
    return new;
  end if;

  select exists (select 1 from public.projects where id = old.project_id)
    into v_project_exists;

  if not v_project_exists then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select count(*)::integer
    into v_remaining_owners
    from public.project_members
   where project_id = old.project_id
     and role = 'owner'
     and id <> old.id;

  if v_remaining_owners < 1 then
    raise exception 'Project must retain at least one owner.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger check_project_owner_before_change
  before update or delete on public.project_members
  for each row execute function public.prevent_orphaned_project_owner();

create or replace function public.enforce_release_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'published' then
    raise exception 'Published releases cannot be modified or deleted.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_published_release_changes
  before update or delete on public.releases
  for each row execute function public.enforce_release_immutability();

create or replace function public.enforce_release_items_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_release_status text;
  v_release_project_id uuid;
  v_item_project_id uuid;
begin
  if tg_op = 'INSERT' then
    select status, project_id
      into v_release_status, v_release_project_id
      from public.releases
     where id = new.release_id;

    if v_release_status = 'published' then
      raise exception 'Cannot add items to a published release.';
    end if;

    select project_id
      into v_item_project_id
      from public.items
     where id = new.item_id;

    if v_item_project_id is distinct from v_release_project_id then
      raise exception 'Item does not belong to the release project.';
    end if;

    return new;
  end if;

  select status
    into v_release_status
    from public.releases
   where id = old.release_id;

  if v_release_status = 'published' then
    raise exception 'Cannot modify or delete items of a published release.';
  end if;

  if tg_op = 'UPDATE' and new.release_id <> old.release_id then
    raise exception 'Cannot move release items between releases.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_published_release_item_changes
  before insert or update or delete on public.release_items
  for each row execute function public.enforce_release_items_immutability();

create or replace function public.enforce_item_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Items cannot be hard-deleted; set archived = true instead.';
  end if;

  if old.project_id <> new.project_id then
    raise exception 'Cannot move an item to another project.';
  end if;

  if old.kind = 'file' and new.kind = 'file' and new.storage_path = old.storage_path then
    if new.sha256 is distinct from old.sha256
       or new.file_name is distinct from old.file_name
       or new.file_size is distinct from old.file_size then
      raise exception 'Replacing a file requires uploading to a new unique storage_path.';
    end if;
  end if;

  return new;
end;
$$;

create trigger prevent_item_hard_delete_and_overwrite
  before update or delete on public.items
  for each row execute function public.enforce_item_immutability();

create or replace function public.set_project_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_project_updated_at();

create or replace function public.touch_parent_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  if tg_op = 'DELETE' then
    v_project_id := old.project_id;
  else
    v_project_id := new.project_id;
  end if;

  update public.projects
     set updated_at = now()
   where id = v_project_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger categories_touch_project
  after insert or update or delete on public.categories
  for each row execute function public.touch_parent_project();

create trigger items_touch_project
  after insert or update on public.items
  for each row execute function public.touch_parent_project();

create trigger releases_touch_project
  after insert or update or delete on public.releases
  for each row execute function public.touch_parent_project();

-- ============================================================================
-- 4. RPC Functions (Project Creation, Member Management, Release Publishing)
-- ============================================================================

create or replace function public.create_project_with_template(
  p_name text,
  p_description text default null,
  p_template text default 'empty'
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_project public.projects;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'Project name is required.';
  end if;

  if p_template not in ('hardware_product', 'empty') then
    raise exception 'Invalid project template.';
  end if;

  insert into public.projects (name, description, created_by)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_user_id
  )
  returning * into v_project;

  if p_template = 'hardware_product' then
    insert into public.categories (project_id, name, description, position)
    values
      (v_project.id, 'Hardware', 'Schematics, PCB layout, BOM and fabrication files', 0),
      (v_project.id, 'Firmware', 'Embedded firmware binaries and release artifacts', 1),
      (v_project.id, 'Enclosure', 'Mechanical CAD, STEP files and drawings', 2),
      (v_project.id, 'Test', 'Verification procedures and test reports', 3),
      (v_project.id, 'Production', 'Pick-and-place, assembly notes and manufacturing packs', 4);
  end if;

  return v_project;
end;
$$;

create or replace function public.add_project_member_by_email(
  p_project_id uuid,
  p_email text,
  p_role text
)
returns public.project_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_user_id uuid;
  v_member public.project_members;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if public.project_role(p_project_id) <> 'owner' then
    raise exception 'Only project owners can add members.';
  end if;

  if p_role not in ('owner', 'member', 'viewer') then
    raise exception 'Invalid member role.';
  end if;

  select id
    into v_target_user_id
    from public.profiles
   where lower(email) = lower(btrim(coalesce(p_email, '')))
   limit 1;

  if v_target_user_id is null then
    raise exception 'No registered user found with that email.';
  end if;

  if exists (
    select 1
      from public.project_members
     where project_id = p_project_id
       and user_id = v_target_user_id
  ) then
    raise exception 'User is already a member of this project.';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_target_user_id, p_role)
  returning * into v_member;

  return v_member;
end;
$$;

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
begin
  v_caller_id := auth.uid();
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

  if v_release.status <> 'draft' then
    raise exception 'Only draft releases can be published.';
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
       and i.project_id <> v_release.project_id
  ) then
    raise exception 'Selected items must belong to the release project.';
  end if;

  -- Snapshot selected items while the release is still in draft status.
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

  -- Build deterministic compact JSON array sorted canonically by:
  -- (category_position, title, kind, version_label, sha256 or url)
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

  return v_release;
end;
$$;

-- ============================================================================
-- 5. Row Level Security Policies
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.releases enable row level security;
alter table public.release_items enable row level security;

-- profiles
create policy profiles_select_policy
  on public.profiles
  for select
  to authenticated
  using (public.can_view_profile(id));

create policy profiles_update_self_policy
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- projects
create policy projects_select_member_policy
  on public.projects
  for select
  to authenticated
  using (public.is_project_member(id));

create policy projects_insert_authenticated_policy
  on public.projects
  for insert
  to authenticated
  with check (auth.uid() is not null and created_by = auth.uid());

create policy projects_update_owner_policy
  on public.projects
  for update
  to authenticated
  using (public.project_role(id) = 'owner')
  with check (public.project_role(id) = 'owner');

-- project_members
create policy project_members_select_policy
  on public.project_members
  for select
  to authenticated
  using (public.is_project_member(project_id));

create policy project_members_insert_owner_policy
  on public.project_members
  for insert
  to authenticated
  with check (public.project_role(project_id) = 'owner');

create policy project_members_update_owner_policy
  on public.project_members
  for update
  to authenticated
  using (public.project_role(project_id) = 'owner')
  with check (public.project_role(project_id) = 'owner');

create policy project_members_delete_owner_policy
  on public.project_members
  for delete
  to authenticated
  using (public.project_role(project_id) = 'owner');

-- categories
create policy categories_select_member_policy
  on public.categories
  for select
  to authenticated
  using (public.is_project_member(project_id));

create policy categories_insert_owner_policy
  on public.categories
  for insert
  to authenticated
  with check (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
  );

create policy categories_update_owner_policy
  on public.categories
  for update
  to authenticated
  using (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
  )
  with check (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
  );

create policy categories_delete_owner_policy
  on public.categories
  for delete
  to authenticated
  using (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
  );

-- items
create policy items_select_member_policy
  on public.items
  for select
  to authenticated
  using (public.is_project_member(project_id));

create policy items_insert_editor_policy
  on public.items
  for insert
  to authenticated
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and created_by = auth.uid()
  );

create policy items_update_editor_policy
  on public.items
  for update
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
  )
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
  );

-- releases
create policy releases_select_member_policy
  on public.releases
  for select
  to authenticated
  using (public.is_project_member(project_id));

create policy releases_insert_draft_policy
  on public.releases
  for insert
  to authenticated
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and status = 'draft'
  );

create policy releases_update_draft_policy
  on public.releases
  for update
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and status = 'draft'
  )
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and status = 'draft'
  );

create policy releases_delete_draft_policy
  on public.releases
  for delete
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and status = 'draft'
  );

-- release_items
create policy release_items_select_member_policy
  on public.release_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.releases r
      where r.id = release_id
        and public.is_project_member(r.project_id)
    )
  );

create policy release_items_insert_draft_policy
  on public.release_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.releases r
      where r.id = release_id
        and r.status = 'draft'
        and public.project_role(r.project_id) in ('owner', 'member')
        and not public.is_project_archived(r.project_id)
    )
  );

create policy release_items_update_draft_policy
  on public.release_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.releases r
      where r.id = release_id
        and r.status = 'draft'
        and public.project_role(r.project_id) in ('owner', 'member')
        and not public.is_project_archived(r.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.releases r
      where r.id = release_id
        and r.status = 'draft'
        and public.project_role(r.project_id) in ('owner', 'member')
        and not public.is_project_archived(r.project_id)
    )
  );

create policy release_items_delete_draft_policy
  on public.release_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.releases r
      where r.id = release_id
        and r.status = 'draft'
        and public.project_role(r.project_id) in ('owner', 'member')
        and not public.is_project_archived(r.project_id)
    )
  );

-- ============================================================================
-- 6. Storage Bucket & Storage Object RLS Policies
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do update
  set public = false;

create policy project_files_select_policy
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project-files'
    and public.is_project_member(public.storage_project_id(name))
  );

create policy project_files_insert_policy
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project-files'
    and public.project_role(public.storage_project_id(name)) in ('owner', 'member')
    and not public.is_project_archived(public.storage_project_id(name))
    and split_part(name, '/', 2) <> ''
    and split_part(name, '/', 3) <> ''
  );

create policy project_files_delete_policy
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-files'
    and public.project_role(public.storage_project_id(name)) in ('owner', 'member')
    and not public.is_storage_path_referenced(name)
  );

-- ============================================================================
-- 7. Explicit Schema, Table and Function Grants (for Self-Hosting Compatibility)
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update on public.items to authenticated;
grant select, insert, update, delete on public.releases to authenticated;
grant select, insert, update, delete on public.release_items to authenticated;

grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_archived(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.storage_project_id(text) to authenticated;
grant execute on function public.is_storage_path_referenced(text) to authenticated;
grant execute on function public.create_project_with_template(text, text, text) to authenticated;
grant execute on function public.add_project_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.publish_release(uuid) to authenticated;

