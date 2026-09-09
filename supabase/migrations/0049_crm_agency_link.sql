-- ═══════════════════════════════════════════════════════════
-- The desk reads PR agency records from the Azzurro CRM, which is a
-- separate self-hosted Supabase. There is no join to make: every lookup
-- crosses as HTTP, over the public internet, to a box that can be down.
--
-- So three tables here.
--
--   crm_agency_cache  what the CRM last told us about a sender domain
--   crm_sync_log      every write we asked the CRM to make, and its answer
--   crm_match_queue   the senders the CRM would not decide on its own
--
-- The cache is what stops ingest depending on the CRM being up. It caches
-- misses as well as hits: 109 of the 126 sender domains we have seen are
-- not in the CRM at all, and without a negative entry every one of them
-- would cost a round trip on every poll.
--
-- press_agencies is not replaced. It holds source_id and trust_tier, which
-- the CRM has no concept of, and it remains the fallback when the CRM
-- cannot be reached.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.crm_agency_cache (
  domain       text primary key,          -- bare host, lowercase, no www
  crm_org_id   uuid,                      -- null means "the CRM has no such organisation"
  name         text,
  lifecycle    text,                      -- lead | prospect | client | churned
  is_pr_agency boolean not null default false,
  matched_by   text,                      -- domain | name | created
  synced_at    timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists crm_agency_cache_synced_idx on public.crm_agency_cache(synced_at);
create index if not exists crm_agency_cache_org_idx    on public.crm_agency_cache(crm_org_id);

comment on table public.crm_agency_cache is
  'Last known CRM answer per sender domain. crm_org_id null is a cached miss, not an error.';

-- ── the audit trail ────────────────────────────────────────
-- Writes go into someone else's database. Anything we cannot see in the
-- CRM UI afterwards has to be answerable from here, including the runs
-- made with CRM_WRITE_ENABLED off.

create table if not exists public.crm_sync_log (
  id           bigint generated always as identity primary key,
  happened_at  timestamptz not null default now(),
  domain       text,
  sender_name  text,
  candidate_id uuid references public.candidates(id) on delete set null,
  action       text not null,             -- created | promoted | none | needs_review | ignored | would_* | error
  reason       text,
  changes      text[],
  crm_org_id   uuid,
  dry_run      boolean not null default false
);

create index if not exists crm_sync_log_happened_idx on public.crm_sync_log(happened_at desc);
create index if not exists crm_sync_log_action_idx   on public.crm_sync_log(action);
create index if not exists crm_sync_log_domain_idx   on public.crm_sync_log(domain);

comment on table public.crm_sync_log is
  'One row per ensure call against the CRM, including dry runs. The reversal record if a write turns out wrong.';

-- ── the review queue ───────────────────────────────────────
-- Only 38 of the 309 organisations tagged 'PR Agency' carry a domain, so
-- most matching is done on the name and some of it will be uncertain.
-- Uncertain never writes. It lands here instead.

create table if not exists public.crm_match_queue (
  id           bigint generated always as identity primary key,
  domain       text not null,
  sender_name  text,
  candidate_id uuid references public.candidates(id) on delete set null,
  reason       text not null,             -- why it could not be decided
  candidates   jsonb not null default '[]'::jsonb,  -- the CRM organisations it could be
  status       text not null default 'open',        -- open | resolved | dismissed
  resolved_by  uuid references auth.users(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- One open question per domain. The same agency mailing twice before anyone
-- looks should not produce two identical rows to work through.
create unique index if not exists crm_match_queue_open_domain_idx
  on public.crm_match_queue(domain) where status = 'open';
create index if not exists crm_match_queue_status_idx on public.crm_match_queue(status, created_at desc);

comment on table public.crm_match_queue is
  'Senders the CRM would not match on its own. Nothing was written for these.';

-- ── access ─────────────────────────────────────────────────
-- Staff read; only the service role writes, which is what the cron uses.

alter table public.crm_agency_cache enable row level security;
alter table public.crm_sync_log     enable row level security;
alter table public.crm_match_queue  enable row level security;

drop policy if exists "crm_agency_cache_select_auth" on public.crm_agency_cache;
create policy "crm_agency_cache_select_auth"
  on public.crm_agency_cache for select to authenticated using (true);

drop policy if exists "crm_sync_log_select_auth" on public.crm_sync_log;
create policy "crm_sync_log_select_auth"
  on public.crm_sync_log for select to authenticated using (true);

drop policy if exists "crm_match_queue_select_auth" on public.crm_match_queue;
create policy "crm_match_queue_select_auth"
  on public.crm_match_queue for select to authenticated using (true);
