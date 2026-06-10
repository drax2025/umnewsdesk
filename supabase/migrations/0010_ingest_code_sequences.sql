-- ═══════════════════════════════════════════════════════════
-- Race-safe code allocation for the ingest pipeline.
--
-- The JS bump() pattern (read last code → increment in app → write)
-- races under concurrent inserts. n8n batches 5 Post-item requests
-- in parallel and they all derive the same next code, blowing up
-- against the candidates_code_key unique index.
--
-- Postgres sequences are inherently race-safe (nextval is atomic).
-- Wrap each code family in an SQL function that formats the final
-- code, so the JS side just calls supabase.rpc('next_*_code').
--
-- Idempotent: every statement is "if not exists" or "or replace".
-- ═══════════════════════════════════════════════════════════

-- ─── Sequences ──────────────────────────────────────────────
create sequence if not exists public.candidate_code_seq;
create sequence if not exists public.sweep_code_seq;
create sequence if not exists public.alert_code_seq;
create sequence if not exists public.source_code_seq;

-- ─── Initialise from existing data ──────────────────────────
-- Don't collide with any rows seeded or written before this migration.
-- setval(name, n, is_called=true) → next nextval() returns n+1.
-- setval(name, 1, is_called=false) → next nextval() returns 1.
do $$
declare
  m int;
begin
  select coalesce(max(substring(code from '\d+$')::int), 0) into m
    from public.candidates;
  perform setval('public.candidate_code_seq', greatest(m, 1), m > 0);

  select coalesce(max(substring(code from '\d+$')::int), 0) into m
    from public.sweep_runs;
  perform setval('public.sweep_code_seq', greatest(m, 1), m > 0);

  select coalesce(max(substring(code from '\d+$')::int), 0) into m
    from public.ops_rr_alerts;
  perform setval('public.alert_code_seq', greatest(m, 1), m > 0);

  select coalesce(max(substring(code from '\d+$')::int), 0) into m
    from public.discovery_sources;
  perform setval('public.source_code_seq', greatest(m, 1), m > 0);
end $$;

-- ─── Allocator functions ────────────────────────────────────
-- REC-YYYY-NNNN, RR-YYYY-NNNN, OPS-YYYY-NNNN carry the year so the
-- 4-digit window resets implicitly. SRC-NNNN is yearless because
-- sources are persistent — they outlive any given year's sweeps.

create or replace function public.next_candidate_code() returns text
language sql volatile as $$
  select 'REC-' || extract(year from now())::int::text || '-' ||
         lpad(nextval('public.candidate_code_seq')::text, 4, '0')
$$;

create or replace function public.next_sweep_code() returns text
language sql volatile as $$
  select 'RR-' || extract(year from now())::int::text || '-' ||
         lpad(nextval('public.sweep_code_seq')::text, 4, '0')
$$;

create or replace function public.next_alert_code() returns text
language sql volatile as $$
  select 'OPS-' || extract(year from now())::int::text || '-' ||
         lpad(nextval('public.alert_code_seq')::text, 4, '0')
$$;

create or replace function public.next_source_code() returns text
language sql volatile as $$
  select 'SRC-' || lpad(nextval('public.source_code_seq')::text, 4, '0')
$$;

-- ─── Grants ─────────────────────────────────────────────────
-- Ingest routes use the service role which bypasses RLS, but these
-- explicit grants future-proof against any switch to anon/auth roles.
grant execute on function public.next_candidate_code() to service_role;
grant execute on function public.next_sweep_code()      to service_role;
grant execute on function public.next_alert_code()      to service_role;
grant execute on function public.next_source_code()     to service_role;
