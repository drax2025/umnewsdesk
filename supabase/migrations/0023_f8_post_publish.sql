-- ════════════════════════════════════════════════════════════════════════
-- F8 Post-Publish: 17-artefact sweep + WordPress publish log
--
-- Stage 1 — article_artefact_sweep stores per-artefact result for the final
--           B2 sweep before push. Status per artefact: swept_clean,
--           contamination_found, na (with justification).
-- Stage 2 — article_publish_log records every publish attempt (success,
--           failure, retract). Target = wordpress | manual | draft_only.
-- ════════════════════════════════════════════════════════════════════════


-- ─── 1. ARTEFACT SWEEP (final B2 confirmation) ─────────────────────────

create type artefact_sweep_status as enum (
  'pending',              -- Not yet swept
  'swept_clean',          -- F8 swept and found nothing
  'contamination_found',  -- F8 swept and found prohibited use
  'na'                    -- Justifiably not applicable (e.g. no DIGIT exposure at all)
);

-- One row per article. The 17 artefacts are flattened into a JSONB blob so
-- the spec list can evolve without schema churn. Keys are artefact codes
-- (see src/lib/spec/f8-post-publish.ts ARTEFACTS).
create table public.article_artefact_sweep (
  article_id uuid primary key references public.articles(id) on delete cascade,

  -- JSONB shape: { "digit_headline_lift": { status, note }, ... } x17
  results jsonb not null default '{}'::jsonb,

  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create trigger trg_article_artefact_sweep_updated
  before update on public.article_artefact_sweep
  for each row execute function public.set_updated_at();

comment on table public.article_artefact_sweep is
  'F8 Stage 1 — final B2 17-artefact sweep before WordPress push. Publish blocked while any artefact is pending or contamination_found.';


-- ─── 2. PUBLISH LOG (every push attempt + outcome) ──────────────────────

create type publish_target as enum (
  'wordpress',     -- WP REST API push
  'manual',        -- Editor published outside the system (URL recorded)
  'draft_only'     -- Pushed to WP as draft for further offline edit
);

create type publish_status as enum (
  'queued',        -- F8 created the log row; push not yet attempted
  'publishing',    -- HTTP call in-flight (best-effort marker)
  'published',     -- WP responded 2xx with a post URL
  'failed',        -- WP responded non-2xx or threw — error captured
  'retracted'      -- Article unpublished after the fact
);

create table public.article_publish_log (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,

  target publish_target not null,
  status publish_status not null default 'queued',

  external_id text,            -- WP post ID
  external_url text,           -- WP permalink (or manual URL)
  error text,                  -- Last error message (failed status only)

  payload jsonb,               -- Snapshot of what we pushed (headline, body excerpt, backdate, slug, status)

  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles(id)
);

create index article_publish_log_article_idx
  on public.article_publish_log (article_id, attempted_at desc);

create index article_publish_log_status_idx
  on public.article_publish_log (status, attempted_at desc);

comment on table public.article_publish_log is
  'F8 Stage 2 — chronological publish-attempt log. Successful publish flips articles.state to live and sets published_at on the article.';
