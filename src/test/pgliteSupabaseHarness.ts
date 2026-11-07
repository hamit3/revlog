import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const SUPABASE_PLATFORM_BOOTSTRAP_SQL = `
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
  end;
  $$;

  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;

  create extension if not exists pgcrypto with schema extensions;

  grant usage on schema auth to anon, authenticated;
  grant usage on schema storage to anon, authenticated;
  grant usage on schema extensions to anon, authenticated;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    instance_id uuid,
    aud varchar(255),
    role varchar(255),
    email varchar(255) unique,
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb default '{}'::jsonb,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    confirmation_token varchar(255),
    email_change varchar(255),
    email_change_token_new varchar(255),
    recovery_token varchar(255)
  );

  create table if not exists auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider_id text not null,
    identity_data jsonb not null default '{}'::jsonb,
    provider text not null,
    last_sign_in_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(
      coalesce(
        current_setting('request.jwt.claim.sub', true),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      ),
      ''
    )::uuid;
  $$;

  create or replace function auth.role()
  returns text
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    );
  $$;

  create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner uuid default auth.uid(),
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (bucket_id, name)
  );

  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
`;

export interface TestDbContext {
  db: PGlite;
  asUser: <T = Record<string, unknown>>(
    userId: string,
    sql: string,
    params?: unknown[],
  ) => Promise<T[]>;
  asSuperuser: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
}

export async function createTestDatabase(options?: { runSeed?: boolean }): Promise<TestDbContext> {
  const db = new PGlite({
    extensions: { pgcrypto },
  });

  await db.exec(SUPABASE_PLATFORM_BOOTSTRAP_SQL);

  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await db.exec(sql);
  }

  if (options?.runSeed ?? true) {
    const seedPath = path.resolve(process.cwd(), 'supabase', 'seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf-8');
    await db.exec(seedSql);
  }

  const asUser = async <T = Record<string, unknown>>(
    userId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    return db.transaction(async (tx) => {
      const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await tx.exec(`set local role authenticated`);
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  };

  const asSuperuser = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    return db.transaction(async (tx) => {
      await tx.exec(`reset role`);
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  };

  return {
    db,
    asUser,
    asSuperuser,
    close: async () => {
      await db.close();
    },
  };
}
