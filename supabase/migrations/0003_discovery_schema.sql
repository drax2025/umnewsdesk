-- ═══════════════════════════════════════════════════════════
-- Union Media Newsroom — Discovery subsystem (F-RR / Ranger Recon)
-- Read-only vertical slice: 4 core tables + 1 lookup table
-- Tables: discovery_streams, discovery_sources, sweep_runs,
--         sweep_site_results, candidates, ops_rr_alerts
-- ═══════════════════════════════════════════════════════════

-- ─── Enums ───────────────────────────────────────────────────
create type source_layer as enum ('l1', 'l2', 'l3', 'l4');

create type source_status as enum ('active', 'warning', 'critical', 'paused');

create type sweep_slot as enum ('am', 'pm');

create type sweep_status as enum ('running', 'complete', 'partial', 'failed');

create type site_outcome as enum (
  'reached_items',
  'reached_empty',
  'parse_failure',
  'not_reached'
);

create type candidate_dedup_state as enum (
  'clear',
  'duplicate',
  'held',
  'needs_review',
  'pointer'
);

create type candidate_verification_state as enum (
  'verified',
  'pending',
  'unverified'
);

create type candidate_triage_state as enum (
  'ready',
  'held_dedup',
  'held_source',
  'needs_review',
  'pointer',
  'sent_to_f1',
  'escalated'
);

create type candidate_risk as enum ('low', 'med', 'high');

create type ops_rr_severity as enum ('p1', 'p2', 'p3');

create type ops_rr_issue_type as enum (
  'parse_failure',
  'unreachable',
  'rate_limit',
  'schema_drift',
  'volume_anomaly',
  'wordpress_check',
  'config',
  'timeout'
);

create type ops_rr_status as enum (
  'open',
  'investigating',
  'deferred',
  'resolved',
  'escalated'
);

-- ─── discovery_streams (editorial subject lookups) ───────────
create table public.discovery_streams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- ─── discovery_sources (monitored feeds) ─────────────────────
create table public.discovery_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- e.g. SRC-0047
  name text not null,
  feed_url text not null,
  crawl_method text,                   -- 'rss', 'sitemap', 'html_scrape', 'api'
  layer source_layer not null default 'l2',
  stream_id uuid references public.discovery_streams(id),
  status source_status not null default 'active',
  exclusivity_window_hours int not null default 48,
  signal_only_eligible boolean not null default false,
  monitored_since timestamptz not null default now(),
  paused_until timestamptz,
  pause_reason text,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index discovery_sources_status_idx on public.discovery_sources(status);
create index discovery_sources_stream_idx on public.discovery_sources(stream_id);

-- ─── sweep_runs (one AM or PM sweep) ─────────────────────────
create table public.sweep_runs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- e.g. RR-2841
  slot sweep_slot not null,
  status sweep_status not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds int,
  sites_total int not null default 0,
  reached_with_items int not null default 0,
  reached_no_items int not null default 0,
  parse_failures int not null default 0,
  not_reached int not null default 0,
  candidates_total int not null default 0,
  dedup_holds int not null default 0
);

create index sweep_runs_started_idx on public.sweep_runs(started_at desc);

-- ─── sweep_site_results (per-source outcome of a run) ────────
create table public.sweep_site_results (
  id uuid primary key default gen_random_uuid(),
  sweep_run_id uuid not null references public.sweep_runs(id) on delete cascade,
  source_id uuid not null references public.discovery_sources(id) on delete cascade,
  outcome site_outcome not null,
  http_status int,
  candidate_count int not null default 0,
  parse_issue_count int not null default 0,
  failure_streak int not null default 0,
  resolved_primary_url text,
  created_at timestamptz not null default now(),
  unique (sweep_run_id, source_id)
);

create index sweep_site_results_run_idx on public.sweep_site_results(sweep_run_id);
create index sweep_site_results_source_idx on public.sweep_site_results(source_id);

-- ─── candidates (discovered leads awaiting triage) ───────────
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- e.g. REC-0891
  sweep_run_id uuid references public.sweep_runs(id) on delete set null,
  source_id uuid references public.discovery_sources(id) on delete set null,
  stream_id uuid references public.discovery_streams(id),
  layer source_layer not null default 'l2',
  working_headline text not null,
  primary_url text,
  dedup_state candidate_dedup_state not null default 'clear',
  verification_state candidate_verification_state not null default 'pending',
  triage_state candidate_triage_state not null default 'ready',
  risk candidate_risk not null default 'low',
  score numeric(4,2),                  -- 0.00–1.00 (or 0–99 if you prefer)
  recommended_option smallint,         -- 1, 2, or 3
  assigned_to uuid references public.profiles(id),
  surfaced_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidates_triage_idx on public.candidates(triage_state);
create index candidates_sweep_idx on public.candidates(sweep_run_id);
create index candidates_source_idx on public.candidates(source_id);
create index candidates_surfaced_idx on public.candidates(surfaced_at desc);

-- ─── ops_rr_alerts (operational issues) ──────────────────────
create table public.ops_rr_alerts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- e.g. OPS-RR-0142
  source_id uuid references public.discovery_sources(id) on delete set null,
  sweep_run_id uuid references public.sweep_runs(id) on delete set null,
  severity ops_rr_severity not null,
  issue_type ops_rr_issue_type not null,
  status ops_rr_status not null default 'open',
  description text not null,
  owner_id uuid references public.profiles(id),
  sla_deadline_at timestamptz,
  auto_raised boolean not null default true,
  escalation_code text,                -- e.g. REC-ESC-0042 if escalated
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create index ops_rr_alerts_status_idx on public.ops_rr_alerts(status);
create index ops_rr_alerts_severity_idx on public.ops_rr_alerts(severity);
create index ops_rr_alerts_source_idx on public.ops_rr_alerts(source_id);
create index ops_rr_alerts_created_idx on public.ops_rr_alerts(created_at desc);

-- ─── Triggers ────────────────────────────────────────────────
create trigger discovery_sources_updated_at
  before update on public.discovery_sources
  for each row execute function public.set_updated_at();

create trigger candidates_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

create trigger ops_rr_alerts_updated_at
  before update on public.ops_rr_alerts
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- Row Level Security
-- All discovery tables: read for any authenticated user, write
-- restricted to editor+. Mirrors articles policy pattern.
-- ═══════════════════════════════════════════════════════════
alter table public.discovery_streams      enable row level security;
alter table public.discovery_sources      enable row level security;
alter table public.sweep_runs             enable row level security;
alter table public.sweep_site_results     enable row level security;
alter table public.candidates             enable row level security;
alter table public.ops_rr_alerts          enable row level security;

-- Helper: just inline `exists ... role in (...)` per policy to keep
-- this migration self-contained.

create policy "discovery_streams_select"
  on public.discovery_streams for select
  to authenticated using (true);

create policy "discovery_sources_select"
  on public.discovery_sources for select
  to authenticated using (true);
create policy "discovery_sources_write_editor"
  on public.discovery_sources for all
  to authenticated
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  );

create policy "sweep_runs_select"
  on public.sweep_runs for select
  to authenticated using (true);

create policy "sweep_site_results_select"
  on public.sweep_site_results for select
  to authenticated using (true);

create policy "candidates_select"
  on public.candidates for select
  to authenticated using (true);
create policy "candidates_write_editor"
  on public.candidates for all
  to authenticated
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  );

create policy "ops_rr_alerts_select"
  on public.ops_rr_alerts for select
  to authenticated using (true);
create policy "ops_rr_alerts_write_editor"
  on public.ops_rr_alerts for all
  to authenticated
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('senior_editor', 'editor'))
  );
