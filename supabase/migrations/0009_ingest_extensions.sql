-- ═══════════════════════════════════════════════════════════
-- Vertical slice F: Discovery ingestion contract
--
-- Extends candidates + sweep_runs to carry data n8n (or any
-- ingestion runner) needs to push through /api/ingest/*.
--
-- No new tables — just additive columns + indices for dedup.
-- Every statement is idempotent so partial runs heal on retry.
-- ═══════════════════════════════════════════════════════════

-- ─── candidates ─────────────────────────────────────────────
alter table public.candidates
  add column if not exists external_id  text,            -- source's own ID (RSS guid, email message-id, etc.)
  add column if not exists kind         text,            -- 'rss' | 'email' | 'pdf' | 'web' | 'generic'
  add column if not exists summary      text,
  add column if not exists body_text    text,
  add column if not exists author       text,
  add column if not exists tags         text[]  not null default '{}',
  add column if not exists raw          jsonb,           -- the original normalized envelope, for audit / re-processing
  add column if not exists fetched_at   timestamptz,     -- when the ingestion runner pulled it
  add column if not exists published_at timestamptz;     -- when the source claims it was published

-- Dedup helpers
create unique index if not exists candidates_source_external_idx
  on public.candidates(source_id, external_id)
  where external_id is not null;

create index if not exists candidates_primary_url_idx
  on public.candidates(primary_url)
  where primary_url is not null;

-- Fuzzy headline dedup uses pg_trgm
create extension if not exists pg_trgm;
create index if not exists candidates_headline_trgm_idx
  on public.candidates using gin (working_headline gin_trgm_ops);

-- ─── sweep_runs ─────────────────────────────────────────────
alter table public.sweep_runs
  add column if not exists trigger text not null default 'scheduled';   -- 'scheduled' | 'manual' | 'webhook'

-- ─── ops_rr_alerts: dedup helper ────────────────────────────
-- Avoid hammering when a source repeatedly fails — n8n can post the
-- same (source, issue_type) and we update instead of duplicating.
create index if not exists ops_rr_alerts_open_dedup_idx
  on public.ops_rr_alerts(source_id, issue_type)
  where status in ('open', 'investigating');
