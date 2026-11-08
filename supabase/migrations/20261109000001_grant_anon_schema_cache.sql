-- Migration: 20261109000001_grant_anon_schema_cache.sql
-- Grant select to anon on public tables protected by RLS so PostgREST builds its schema cache
-- and handles pre-auth / anon requests gracefully without PGRST205 schema cache errors.
-- Row Level Security (RLS) on all these tables strictly enforces row-level privacy.

grant usage on schema public to anon, authenticated;

grant select on public.bom_pnp_check_runs to anon;
grant select on public.release_share_links to anon;
grant select on public.release_checklist_rules to anon;
grant select on public.audit_logs to anon;

notify pgrst, 'reload schema';

