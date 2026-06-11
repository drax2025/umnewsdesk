-- F4 Interlinker audit + link inventory (spec sections F4, B4, C7, E4).
--
-- Two tables:
--
--   article_interlinks  — candidate-and-decision ledger; one row per
--                         candidate link (internal OR outbound). Holds the
--                         B4 three-question test (internal only), URL
--                         resolution status, recency, anchor, paragraph
--                         placement, banned-domain flag (C7).
--   article_interlinker — 1:1 record per article; F4 verdict stamp.
--
-- B4 standing rule (locked 18 May 2026, Senior Editor): internal links
-- are reader-first, max three per article, zero is valid. All three
-- B4 questions must be YES to place an internal link.
--
-- C7 standing rule: no link may point to digit.fyi, futurescot.com or
-- scottishfinancialnews.com. Outbound links must resolve to official
-- institutional URLs (not press-release republishers). Range 3-5.
--
-- E4 mitigation: prefer interlinks from the last 90 days where present.

-- ─── enums ──────────────────────────────────────────────────────

create type link_kind as enum (
  'internal',   -- Master content inventory pointer to another Union Media article
  'outbound'    -- Named institution, funder, regulator, primary source
);

create type link_resolution as enum (
  'unchecked',  -- Initial state — F4 has not run URL check yet
  'ok',         -- 2xx
  'redirect',   -- 3xx — landed somewhere; reviewer should inspect target
  'failed'      -- 4xx / 5xx / DNS / timeout — reject per F4 step 2
);

create type link_decision as enum (
  'candidate',  -- Surfaced from master inventory; not yet evaluated
  'placed',     -- Survived B4 + C7 + resolution; placed inline in body
  'rejected'    -- B4 question failed, resolution failed, or banned domain
);

create type f4_verdict as enum (
  'hand_to_f5',       -- Internal count 0-3, all placed links resolve, outbound 3-5
  'hand_back_to_f3',  -- Body needs rework — e.g. no candidate fits, anchor non-natural
  'escalate'          -- F4 cannot resolve; bump to Senior Editor [ESC]
);

-- ─── article_interlinks ─────────────────────────────────────────

create table public.article_interlinks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  kind link_kind not null,

  -- Target
  target_url text not null,
  target_article_id uuid references public.articles(id) on delete set null,
                                          -- For internal links: pointer into master inventory
  target_title text,                      -- Target article headline / page title (cached)
  target_published_at date,               -- For internal recency check (E4 — prefer ≤ 90 days)

  -- Placement
  anchor_text text,
  placement_paragraph smallint,           -- 1-based paragraph index in article body
  order_idx smallint not null default 0,

  -- URL resolution check (F4 step 2)
  resolution_status link_resolution not null default 'unchecked',
  http_status smallint,
  resolution_checked_at timestamptz,

  -- C7 banned-domain flag (digit.fyi / futurescot.com / scottishfinancialnews.com)
  is_banned_domain boolean not null default false,

  -- B4 internal-link placement test (internal kind only — null for outbound)
  -- Q1: Does this link give the reader genuinely useful additional context?
  -- Q2: Is the linked article topically and substantively related?
  -- Q3: Does the anchor text describe what the reader will find, in natural prose?
  -- All three must be YES to place.
  b4_q1_useful_context boolean,
  b4_q2_topically_related boolean,
  b4_q3_anchor_descriptive boolean,

  -- Decision
  decision link_decision not null default 'candidate',
  decision_reason text,
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index article_interlinks_article_idx
  on public.article_interlinks(article_id);
create index article_interlinks_article_kind_idx
  on public.article_interlinks(article_id, kind);
create index article_interlinks_article_decision_idx
  on public.article_interlinks(article_id, decision);

comment on table public.article_interlinks is
  'F4 Interlinker candidate-and-decision ledger. One row per candidate link (internal or outbound). B4 test on internal links, C7 banned-domain flag, E4 recency check.';
comment on column public.article_interlinks.target_published_at is
  'Target article publication date — used for E4 recency check (prefer ≤ 90 days).';
comment on column public.article_interlinks.is_banned_domain is
  'C7: true if target points to digit.fyi, futurescot.com, or scottishfinancialnews.com. Auto-fails resolution check.';

-- ─── article_interlinker (verdict record) ───────────────────────

create table public.article_interlinker (
  article_id uuid primary key references public.articles(id) on delete cascade,
  verdict f4_verdict,
  verdict_at timestamptz,
  verdict_by uuid references public.profiles(id),
  verdict_rationale text,
  updated_at timestamptz not null default now()
);

create trigger trg_article_interlinker_updated
  before update on public.article_interlinker
  for each row execute function public.set_updated_at();

comment on table public.article_interlinker is
  'F4 Interlinker verdict stamp. One row per article. Verdict written by Interlinker; counts derived from article_interlinks.';
