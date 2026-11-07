-- RevLog v2 hierarchy migration:
-- Project -> Products (Hardware / Software / Mixed) -> Categories (Modules) -> Items
-- Dual-level immutable releases:
--   1. Product Releases (public.releases + public.release_items)
--   2. Project Releases bundling published Product Releases (public.project_releases + public.project_release_products)

-- ============================================================================
-- 1. New Tables: products, project_releases, project_release_products
-- ============================================================================

create table public.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  code text check (code is null or char_length(btrim(code)) > 0),
  product_type text not null default 'mixed' check (product_type in ('hardware', 'software', 'mixed')),
  description text,
  archived boolean not null default false,
  position integer not null default 0,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_project_name_unique unique (project_id, name),
  constraint products_id_project_unique unique (id, project_id)
);

create index products_project_position_idx
  on public.products (project_id, archived, position, created_at);
create index products_created_by_idx
  on public.products (created_by);

create table public.project_releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_label text not null check (char_length(btrim(version_label)) > 0),
  notes text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  manifest_hash text,
  created_at timestamptz not null default now(),
  constraint project_releases_project_version_unique unique (project_id, version_label),
  constraint project_releases_published_fields_check check (
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

create index project_releases_project_status_idx
  on public.project_releases (project_id, status, published_at desc, created_at desc);
create index project_releases_published_by_idx
  on public.project_releases (published_by)
  where published_by is not null;

create table public.project_release_products (
  id uuid primary key default gen_random_uuid(),
  project_release_id uuid not null references public.project_releases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  release_id uuid not null references public.releases(id) on delete restrict,
  product_name text,
  product_code text,
  product_type text check (product_type is null or product_type in ('hardware', 'software', 'mixed')),
  product_position integer,
  release_version_label text,
  release_manifest_hash text,
  release_published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_release_products_unique_product unique (project_release_id, product_id),
  constraint project_release_products_unique_release unique (project_release_id, release_id)
);

create index project_release_products_rel_idx
  on public.project_release_products (project_release_id);
create index project_release_products_product_idx
  on public.project_release_products (product_id);
create index project_release_products_prod_rel_idx
  on public.project_release_products (release_id);

-- ============================================================================
-- 2. Add product_id to categories, items, releases & Backfill Existing Data
-- ============================================================================

alter table public.categories add column product_id uuid;
alter table public.items add column product_id uuid;
alter table public.releases add column product_id uuid;

alter table public.releases disable trigger prevent_published_release_changes;
alter table public.items disable trigger prevent_item_hard_delete_and_overwrite;

do $$
declare
  v_proj record;
  v_new_product_id uuid;
begin
  for v_proj in
    select p.*
      from public.projects p
     where exists (select 1 from public.categories c where c.project_id = p.id and c.product_id is null)
        or exists (select 1 from public.items i where i.project_id = p.id and i.product_id is null)
        or exists (select 1 from public.releases r where r.project_id = p.id and r.product_id is null)
  loop
    insert into public.products (
      project_id,
      name,
      product_type,
      description,
      archived,
      position,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_proj.id,
      v_proj.name,
      'mixed',
      v_proj.description,
      v_proj.archived,
      0,
      v_proj.created_by,
      v_proj.created_at,
      v_proj.updated_at
    )
    returning id into v_new_product_id;

    update public.categories
       set product_id = v_new_product_id
     where project_id = v_proj.id
       and product_id is null;

    update public.items
       set product_id = v_new_product_id
     where project_id = v_proj.id
       and product_id is null;

    update public.releases
       set product_id = v_new_product_id
     where project_id = v_proj.id
       and product_id is null;
  end loop;
end;
$$;

alter table public.releases enable trigger prevent_published_release_changes;
alter table public.items enable trigger prevent_item_hard_delete_and_overwrite;

alter table public.categories alter column product_id set not null;
alter table public.items alter column product_id set not null;
alter table public.releases alter column product_id set not null;

-- Replace legacy project-level constraints with product-scoped composite constraints
alter table public.items drop constraint if exists items_category_project_fk;
alter table public.categories drop constraint if exists categories_project_name_unique;
alter table public.releases drop constraint if exists releases_project_version_unique;

alter table public.categories
  add constraint categories_product_project_fk
    foreign key (product_id, project_id)
    references public.products(id, project_id)
    on delete cascade,
  add constraint categories_product_name_unique
    unique (product_id, name),
  add constraint categories_id_product_project_unique
    unique (id, product_id, project_id);

alter table public.items
  add constraint items_product_project_fk
    foreign key (product_id, project_id)
    references public.products(id, project_id)
    on delete cascade,
  add constraint items_category_product_project_fk
    foreign key (category_id, product_id, project_id)
    references public.categories(id, product_id, project_id)
    on delete restrict;

alter table public.releases
  add constraint releases_product_project_fk
    foreign key (product_id, project_id)
    references public.products(id, project_id)
    on delete cascade,
  add constraint releases_product_version_unique
    unique (product_id, version_label);

-- Foreign-key and query performance indexes
create index if not exists projects_created_by_idx
  on public.projects (created_by);
create index if not exists categories_product_position_idx
  on public.categories (product_id, position, created_at);
create index if not exists items_product_category_idx
  on public.items (product_id, category_id, archived, created_at desc);
create index if not exists items_category_id_idx
  on public.items (category_id);
create index if not exists items_created_by_idx
  on public.items (created_by);
create index if not exists releases_product_status_idx
  on public.releases (product_id, status, published_at desc, created_at desc);
create index if not exists releases_published_by_idx
  on public.releases (published_by)
  where published_by is not null;
create index if not exists release_items_item_id_idx
  on public.release_items (item_id);

-- ============================================================================
-- 3. Authorization & Helper Functions
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
    and pm.user_id = (select auth.uid())
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
      and pm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_product_archived(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pr.archived from public.products pr where pr.id = p_product_id),
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
    );
$$;

-- ============================================================================
-- 4. Updated & New Triggers (Immutability + Activity Timestamps)
-- ============================================================================

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

  if old.product_id <> new.product_id then
    raise exception 'Cannot move an item to another product.';
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

create or replace function public.enforce_release_items_immutability()
returns trigger
language plpgsql
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
    select status, project_id, product_id
      into v_release_status, v_release_project_id, v_release_product_id
      from public.releases
     where id = new.release_id;

    if v_release_status = 'published' then
      raise exception 'Cannot add items to a published release.';
    end if;

    select project_id, product_id
      into v_item_project_id, v_item_product_id
      from public.items
     where id = new.item_id;

    if v_item_project_id is distinct from v_release_project_id
       or v_item_product_id is distinct from v_release_product_id then
      raise exception 'Item does not belong to the release product.';
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

create or replace function public.enforce_project_release_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'published' then
    raise exception 'Published project releases cannot be modified or deleted.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_published_project_release_changes
  before update or delete on public.project_releases
  for each row execute function public.enforce_project_release_immutability();

create or replace function public.enforce_project_release_products_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_proj_rel_status text;
  v_proj_rel_project_id uuid;
  v_prod_rel_status text;
  v_prod_rel_project_id uuid;
  v_prod_rel_product_id uuid;
begin
  if tg_op = 'INSERT' then
    select status, project_id
      into v_proj_rel_status, v_proj_rel_project_id
      from public.project_releases
     where id = new.project_release_id;

    if v_proj_rel_status = 'published' then
      raise exception 'Cannot add products to a published project release.';
    end if;

    select status, project_id, product_id
      into v_prod_rel_status, v_prod_rel_project_id, v_prod_rel_product_id
      from public.releases
     where id = new.release_id;

    if v_prod_rel_status is distinct from 'published' then
      raise exception 'Only published product releases can be bundled into a project release.';
    end if;

    if v_prod_rel_project_id is distinct from v_proj_rel_project_id
       or v_prod_rel_product_id is distinct from new.product_id then
      raise exception 'Selected product release does not match the specified product and project.';
    end if;

    return new;
  end if;

  select status
    into v_proj_rel_status
    from public.project_releases
   where id = old.project_release_id;

  if v_proj_rel_status = 'published' then
    raise exception 'Cannot modify or delete products of a published project release.';
  end if;

  if tg_op = 'UPDATE' and new.project_release_id <> old.project_release_id then
    raise exception 'Cannot move bundled product releases between project releases.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_published_project_release_product_changes
  before insert or update or delete on public.project_release_products
  for each row execute function public.enforce_project_release_products_immutability();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_project_updated_at();

create trigger products_touch_project
  after insert or update or delete on public.products
  for each row execute function public.touch_parent_project();

create trigger project_releases_touch_project
  after insert or update or delete on public.project_releases
  for each row execute function public.touch_parent_project();

create or replace function public.touch_parent_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if tg_op = 'DELETE' then
    v_product_id := old.product_id;
  else
    v_product_id := new.product_id;
  end if;

  update public.products
     set updated_at = now()
   where id = v_product_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger categories_touch_product
  after insert or update or delete on public.categories
  for each row execute function public.touch_parent_product();

create trigger items_touch_product
  after insert or update on public.items
  for each row execute function public.touch_parent_product();

create trigger releases_touch_product
  after insert or update or delete on public.releases
  for each row execute function public.touch_parent_product();

-- ============================================================================
-- 5. RPC Functions (Project, Product, Product Release & Project Release)
-- ============================================================================

create or replace function public.create_project(
  p_name text,
  p_description text default null
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
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'Project name is required.';
  end if;

  insert into public.projects (name, description, created_by)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_user_id
  )
  returning * into v_project;

  return v_project;
end;
$$;

create or replace function public.create_product_with_template(
  p_project_id uuid,
  p_name text,
  p_code text default null,
  p_product_type text default 'mixed',
  p_description text default null,
  p_template text default 'hardware_software'
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_next_pos integer;
  v_product public.products;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if public.project_role(p_project_id) <> 'owner' then
    raise exception 'Only project owners can create products.';
  end if;

  if public.is_project_archived(p_project_id) then
    raise exception 'Cannot create products in an archived project.';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'Product name is required.';
  end if;

  if p_product_type not in ('hardware', 'software', 'mixed') then
    raise exception 'Invalid product type.';
  end if;

  if p_template not in ('hardware_software', 'hardware_only', 'software_only', 'empty') then
    raise exception 'Invalid product template.';
  end if;

  select coalesce(max(position) + 1, 0)
    into v_next_pos
    from public.products
   where project_id = p_project_id;

  insert into public.products (
    project_id,
    name,
    code,
    product_type,
    description,
    position,
    created_by
  )
  values (
    p_project_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_code, '')), ''),
    p_product_type,
    nullif(btrim(coalesce(p_description, '')), ''),
    v_next_pos,
    v_user_id
  )
  returning * into v_product;

  if p_template = 'hardware_software' then
    insert into public.categories (project_id, product_id, name, description, position)
    values
      (p_project_id, v_product.id, 'Hardware', 'Schematics, PCB layout, BOM and fabrication files', 0),
      (p_project_id, v_product.id, 'Firmware', 'Embedded firmware binaries and software packages', 1),
      (p_project_id, v_product.id, 'Enclosure', 'Mechanical CAD, STEP files and drawings', 2),
      (p_project_id, v_product.id, 'Test', 'Verification procedures and test reports', 3),
      (p_project_id, v_product.id, 'Production', 'Pick-and-place, assembly notes and manufacturing packs', 4);
  elsif p_template = 'hardware_only' then
    insert into public.categories (project_id, product_id, name, description, position)
    values
      (p_project_id, v_product.id, 'Schematics & PCB', 'Circuit schematics, stackup and PCB layout files', 0),
      (p_project_id, v_product.id, 'BOM & Fabrication', 'Bill of materials, Gerbers, drill and ODB++ outputs', 1),
      (p_project_id, v_product.id, 'Assembly & Test', 'Pick-and-place, drawings and board verification logs', 2);
  elsif p_template = 'software_only' then
    insert into public.categories (project_id, product_id, name, description, position)
    values
      (p_project_id, v_product.id, 'Binaries & Builds', 'Compiled firmware images, packages and release artifacts', 0),
      (p_project_id, v_product.id, 'Configuration', 'Device parameters, protocol definitions and scripts', 1),
      (p_project_id, v_product.id, 'Test & Verification', 'Validation reports and integration notes', 2);
  end if;

  return v_product;
end;
$$;

-- Keep create_project_with_template compatible by delegating to create_project + optional initial product
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
  v_project public.projects;
begin
  if p_template not in ('hardware_product', 'empty') then
    raise exception 'Invalid project template.';
  end if;

  v_project := public.create_project(p_name, p_description);

  if p_template = 'hardware_product' then
    perform public.create_product_with_template(
      v_project.id,
      v_project.name,
      null,
      'mixed',
      v_project.description,
      'hardware_software'
    );
  end if;

  return v_project;
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

  return v_release;
end;
$$;

create or replace function public.publish_project_release(p_project_release_id uuid)
returns public.project_releases
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_proj_release public.project_releases;
  v_role text;
  v_product_count integer;
  v_manifest_json text;
  v_manifest_hash text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_proj_release
    from public.project_releases
   where id = p_project_release_id
   for update;

  if v_proj_release.id is null then
    raise exception 'Project release not found.';
  end if;

  v_role := public.project_role(v_proj_release.project_id);
  if v_role is null or v_role not in ('owner', 'member') then
    raise exception 'Only project owners or members can publish project releases.';
  end if;

  if public.is_project_archived(v_proj_release.project_id) then
    raise exception 'Cannot publish releases in an archived project.';
  end if;

  if v_proj_release.status <> 'draft' then
    raise exception 'Only draft project releases can be published.';
  end if;

  select count(*)::integer
    into v_product_count
    from public.project_release_products
   where project_release_id = p_project_release_id;

  if v_product_count < 1 then
    raise exception 'Project release must include at least one published product release.';
  end if;

  if exists (
    select 1
      from public.project_release_products prp
      join public.releases r on r.id = prp.release_id
      join public.products p on p.id = prp.product_id
     where prp.project_release_id = p_project_release_id
       and (
         r.status <> 'published'
         or r.project_id <> v_proj_release.project_id
         or p.project_id <> v_proj_release.project_id
         or r.product_id <> p.id
       )
  ) then
    raise exception 'All bundled releases must be published releases belonging to this project.';
  end if;

  update public.project_release_products prp
     set product_name = p.name,
         product_code = p.code,
         product_type = p.product_type,
         product_position = p.position,
         release_version_label = r.version_label,
         release_manifest_hash = r.manifest_hash,
         release_published_at = r.published_at
    from public.products p,
         public.releases r
   where prp.project_release_id = p_project_release_id
     and p.id = prp.product_id
     and r.id = prp.release_id;

  select
    '[' || coalesce(
      string_agg(
        '{'
        || '"product_code":' || coalesce(to_json(prp.product_code)::text, 'null')
        || ',"product_id":' || to_json(prp.product_id::text)::text
        || ',"product_name":' || to_json(prp.product_name)::text
        || ',"product_position":' || to_json(prp.product_position)::text
        || ',"release_id":' || to_json(prp.release_id::text)::text
        || ',"release_manifest_hash":' || to_json(prp.release_manifest_hash)::text
        || ',"release_version_label":' || to_json(prp.release_version_label)::text
        || '}',
        ','
        order by
          prp.product_position asc,
          prp.product_name collate "C" asc,
          (prp.product_id::text) collate "C" asc
      ),
      ''
    ) || ']'
    into v_manifest_json
    from public.project_release_products prp
   where prp.project_release_id = p_project_release_id;

  v_manifest_hash := encode(
    digest(convert_to(v_manifest_json, 'UTF8'), 'sha256'),
    'hex'
  );

  update public.project_releases
     set status = 'published',
         published_at = now(),
         published_by = v_caller_id,
         manifest_hash = v_manifest_hash
   where id = p_project_release_id
   returning * into v_proj_release;

  return v_proj_release;
end;
$$;

-- ============================================================================
-- 6. Row Level Security Policies (Products, Product Scope, Project Releases)
-- ============================================================================

alter table public.products enable row level security;
alter table public.project_releases enable row level security;
alter table public.project_release_products enable row level security;

-- Optimize existing auth.uid() policies with (select auth.uid())
drop policy if exists profiles_update_self_policy on public.profiles;
create policy profiles_update_self_policy
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists projects_insert_authenticated_policy on public.projects;
create policy projects_insert_authenticated_policy
  on public.projects
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

-- products (Owner writes, all project members read)
create policy products_select_member_policy
  on public.products
  for select
  to authenticated
  using (public.is_project_member(project_id));

create policy products_insert_owner_policy
  on public.products
  for insert
  to authenticated
  with check (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
    and created_by = (select auth.uid())
  );

create policy products_update_owner_policy
  on public.products
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

create policy products_delete_owner_policy
  on public.products
  for delete
  to authenticated
  using (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
  );

-- Update categories, items, releases, release_items policies to also check product archived state
drop policy if exists categories_insert_owner_policy on public.categories;
create policy categories_insert_owner_policy
  on public.categories
  for insert
  to authenticated
  with check (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
  );

drop policy if exists categories_update_owner_policy on public.categories;
create policy categories_update_owner_policy
  on public.categories
  for update
  to authenticated
  using (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
  )
  with check (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
  );

drop policy if exists categories_delete_owner_policy on public.categories;
create policy categories_delete_owner_policy
  on public.categories
  for delete
  to authenticated
  using (
    public.project_role(project_id) = 'owner'
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
  );

drop policy if exists items_insert_editor_policy on public.items;
create policy items_insert_editor_policy
  on public.items
  for insert
  to authenticated
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
    and created_by = (select auth.uid())
  );

drop policy if exists items_update_editor_policy on public.items;
create policy items_update_editor_policy
  on public.items
  for update
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
  )
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
  );

drop policy if exists releases_insert_draft_policy on public.releases;
create policy releases_insert_draft_policy
  on public.releases
  for insert
  to authenticated
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
    and status = 'draft'
  );

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

drop policy if exists releases_delete_draft_policy on public.releases;
create policy releases_delete_draft_policy
  on public.releases
  for delete
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and not public.is_product_archived(product_id)
    and status = 'draft'
  );

drop policy if exists release_items_insert_draft_policy on public.release_items;
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
        and not public.is_product_archived(r.product_id)
    )
  );

drop policy if exists release_items_update_draft_policy on public.release_items;
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
        and not public.is_product_archived(r.product_id)
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
        and not public.is_product_archived(r.product_id)
    )
  );

drop policy if exists release_items_delete_draft_policy on public.release_items;
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
        and not public.is_product_archived(r.product_id)
    )
  );

-- project_releases
create policy project_releases_select_member_policy
  on public.project_releases
  for select
  to authenticated
  using (public.is_project_member(project_id));

create policy project_releases_insert_draft_policy
  on public.project_releases
  for insert
  to authenticated
  with check (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and status = 'draft'
  );

create policy project_releases_update_draft_policy
  on public.project_releases
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

create policy project_releases_delete_draft_policy
  on public.project_releases
  for delete
  to authenticated
  using (
    public.project_role(project_id) in ('owner', 'member')
    and not public.is_project_archived(project_id)
    and status = 'draft'
  );

-- project_release_products
create policy project_release_products_select_member_policy
  on public.project_release_products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.project_releases pr
      where pr.id = project_release_id
        and public.is_project_member(pr.project_id)
    )
  );

create policy project_release_products_insert_draft_policy
  on public.project_release_products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.project_releases pr
      where pr.id = project_release_id
        and pr.status = 'draft'
        and public.project_role(pr.project_id) in ('owner', 'member')
        and not public.is_project_archived(pr.project_id)
    )
  );

create policy project_release_products_update_draft_policy
  on public.project_release_products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.project_releases pr
      where pr.id = project_release_id
        and pr.status = 'draft'
        and public.project_role(pr.project_id) in ('owner', 'member')
        and not public.is_project_archived(pr.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.project_releases pr
      where pr.id = project_release_id
        and pr.status = 'draft'
        and public.project_role(pr.project_id) in ('owner', 'member')
        and not public.is_project_archived(pr.project_id)
    )
  );

create policy project_release_products_delete_draft_policy
  on public.project_release_products
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.project_releases pr
      where pr.id = project_release_id
        and pr.status = 'draft'
        and public.project_role(pr.project_id) in ('owner', 'member')
        and not public.is_project_archived(pr.project_id)
    )
  );

-- ============================================================================
-- 7. Explicit Table and Function Grants & Privilege Hardening
-- ============================================================================

grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.project_releases to authenticated;
grant select, insert, update, delete on public.project_release_products to authenticated;

revoke execute on function public.project_role(uuid) from public, anon;
revoke execute on function public.is_project_member(uuid) from public, anon;
revoke execute on function public.is_project_archived(uuid) from public, anon;
revoke execute on function public.is_product_archived(uuid) from public, anon;
revoke execute on function public.can_view_profile(uuid) from public, anon;
revoke execute on function public.storage_project_id(text) from public, anon;
revoke execute on function public.is_storage_path_referenced(text) from public, anon;
revoke execute on function public.create_project(text, text) from public, anon;
revoke execute on function public.create_product_with_template(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.create_project_with_template(text, text, text) from public, anon;
revoke execute on function public.add_project_member_by_email(uuid, text, text) from public, anon;
revoke execute on function public.publish_release(uuid) from public, anon;
revoke execute on function public.publish_project_release(uuid) from public, anon;

grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_archived(uuid) to authenticated;
grant execute on function public.is_product_archived(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.storage_project_id(text) to authenticated;
grant execute on function public.is_storage_path_referenced(text) to authenticated;
grant execute on function public.create_project(text, text) to authenticated;
grant execute on function public.create_product_with_template(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.create_project_with_template(text, text, text) to authenticated;
grant execute on function public.add_project_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.publish_release(uuid) to authenticated;
grant execute on function public.publish_project_release(uuid) to authenticated;

