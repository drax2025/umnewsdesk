-- F9 Pre-Publish Pack assembly (spec sections F9, A1-A10, D-Steps).
--
-- F9 sits between F6 and F8. It runs ten independent active checks
-- (A1-A10), assembles the Senior Editor Pre-Publish Review Pack, and
-- hands to [PUB] for APPROVE / MODIFY / REJECT.
--
-- Three tables:
--
--   article_pre_publish   — denormalised 1:1 record per article;
--                           A1-A10 statuses + per-check detail + pack ref +
--                           verdict (HAND_TO_SENIOR / RETURN_TO_<agent>).
--   pre_publish_failures  — Failure Log rows; one row per A-check fail or
--                           soft-fail with root-cause agent + rationale.
--   pre_publish_packs     — pack-level record (ref, articles 1-3, archive
--                           path, sweep ID breadcrumb, senior-editor verdict).
--
-- Per spec the pack carries hard cap of 3 articles. The pack table holds
-- the cap; article_pre_publish lives one-per-article and joins back via
-- pack_ref.

-- ─── enums ──────────────────────────────────────────────────────

create type a_check_status as enum (
  'pending',     -- A-check not yet run
  'pass',        -- ✅
  'soft_fail',   -- ⚠️ — flagged in pack, not blocking
  'fail',        -- ❌ — hard-returns to upstream agent
  'na'           -- N/A — does not apply (e.g. Tier 1 A1 reasonable steps)
);

create type f9_verdict as enum (
  'hand_to_senior_editor',  -- All checks PASS/SOFT-FAIL/NA — pack ready for [PUB]
  'return_to_f1',           -- A8 framing fail
  'return_to_f2',           -- A2/A3/A4 source-side fail
  'return_to_f3',           -- A4/A5/A6/A9 writer-side fail
  'return_to_f4',           -- A7 interlink fail
  'return_to_f5',           -- A6/A8/A10 editor-side fail
  'return_to_f6'            -- F6 gate audit incomplete; re-review
);

create type pub_verdict as enum (
  'pending',
  'approve',
  'modify',
  'reject'
);

-- ─── article_pre_publish ────────────────────────────────────────

create table public.article_pre_publish (
  article_id uuid primary key references public.articles(id) on delete cascade,

  -- A1 — Reasonable steps log (D-Steps doctrine)
  a1_status a_check_status not null default 'pending',
  a1_detail text,

  -- A2 — Primary source reverify
  a2_status a_check_status not null default 'pending',
  a2_detail text,

  -- A3 — Public domain reverify (PDT 3+ independent sources)
  a3_status a_check_status not null default 'pending',
  a3_detail text,
  a3_independent_count smallint,                    -- Number of independent confirmations on file

  -- A4 — Verbatim quote sampling
  a4_status a_check_status not null default 'pending',
  a4_detail text,
  a4_quotes_sampled smallint,                       -- Number of quotes spot-checked vs ledger

  -- A5 — Paragraph structure preservation
  a5_status a_check_status not null default 'pending',
  a5_detail text,

  -- A6 — Date/backdate consistency
  a6_status a_check_status not null default 'pending',
  a6_detail text,
  a6_backdate date,                                  -- The selected backdate F5 chose (mirrored here)

  -- A7 — Interlink resolution
  a7_status a_check_status not null default 'pending',
  a7_detail text,
  a7_internal_count smallint,                        -- Mirrored from article_interlinks
  a7_outbound_count smallint,

  -- A8 — Headline + framing alignment
  a8_status a_check_status not null default 'pending',
  a8_detail text,
  a8_headline_chars smallint,

  -- A9 — NFP footer completeness
  a9_status a_check_status not null default 'pending',
  a9_detail text,

  -- A10 — Standing-rule sweep (B2 row record + numeric-claim positive trace)
  a10_status a_check_status not null default 'pending',
  a10_detail text,

  -- Pack assembly metadata
  pack_ref text,                                     -- e.g. PPP-2026-06-11-001
  origin_sweep_id text,                              -- One-line F-RR breadcrumb
  pack_archive_path text,                            -- workspace/pre_publish_packs/<REF>.md

  -- F9 verdict (the agent's, not the senior editor's)
  verdict f9_verdict,
  verdict_at timestamptz,
  verdict_by uuid references public.profiles(id),
  verdict_rationale text,

  -- Senior Editor verdict ([PUB] channel)
  pub_verdict pub_verdict not null default 'pending',
  pub_verdict_at timestamptz,
  pub_verdict_by uuid references public.profiles(id),
  pub_verdict_notes text,

  updated_at timestamptz not null default now()
);

create index article_pre_publish_pack_ref_idx
  on public.article_pre_publish(pack_ref) where pack_ref is not null;

create trigger trg_article_pre_publish_updated
  before update on public.article_pre_publish
  for each row execute function public.set_updated_at();

comment on table public.article_pre_publish is
  'F9 Pre-Publish Pack assembly. One row per article. A1-A10 active checks independent of F6 gates. Verdict hands to Senior Editor via [PUB], or returns to upstream agent on FAIL.';

comment on column public.article_pre_publish.pack_ref is
  'Hard cap of 3 articles per pack — packs are grouped by this ref.';

-- ─── pre_publish_failures (Failure Log) ─────────────────────────

create table public.pre_publish_failures (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  check_code text not null check (check_code in (
    'A1','A2','A3','A4','A5','A6','A7','A8','A9','A10'
  )),
  status a_check_status not null check (status in ('soft_fail', 'fail')),
  root_cause_agent text check (root_cause_agent in (
    'F1','F2','F3','F4','F5','F6','F9'
  )),
  description text not null,
  remediation text,
  override_applied boolean not null default false,
  override_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index pre_publish_failures_article_idx
  on public.pre_publish_failures(article_id);
create index pre_publish_failures_check_idx
  on public.pre_publish_failures(article_id, check_code);

comment on table public.pre_publish_failures is
  'F9 Failure Log per article. One row per A-check soft_fail / fail. Sourced via SK-RECORD.append-failure-log-row.';

-- ─── pre_publish_packs (pack-level record) ──────────────────────

create table public.pre_publish_packs (
  pack_ref text primary key,                         -- PPP-2026-06-11-001
  article_1_id uuid references public.articles(id) on delete set null,
  article_2_id uuid references public.articles(id) on delete set null,
  article_3_id uuid references public.articles(id) on delete set null,
  origin_sweep_id text,
  archive_path text,                                 -- workspace/pre_publish_packs/<REF>.md
  rendered_at timestamptz,
  rendered_by uuid references public.profiles(id),
  pub_channel_posted_at timestamptz,
  pub_verdict pub_verdict not null default 'pending',
  pub_verdict_at timestamptz,
  pub_verdict_by uuid references public.profiles(id),
  pub_verdict_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_pre_publish_packs_updated
  before update on public.pre_publish_packs
  for each row execute function public.set_updated_at();

comment on table public.pre_publish_packs is
  'F9 Pre-Publish Pack record. Hard cap of 3 articles per pack (see article_1/2/3 columns). Stamped with Senior Editor verdict via [PUB].';
