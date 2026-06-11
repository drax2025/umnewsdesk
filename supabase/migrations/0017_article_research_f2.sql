-- F2 Researcher source pack + verbatim ledger (spec sections F2, B1, B7, C1, C3, C9).
--
-- Four new tables — all keyed on articles.id, all cascade on article delete:
--
--   article_sources                  — the source pack (primary + confirmations + context + Tier 2 reply)
--   article_quotes                   — verbatim quote ledger (paragraph structure preserved as text \n\n)
--   article_research                 — 1:1 record of feasibility verdict, dependency status, NFP draft
--   article_pipeline_opportunities   — B7 follow-up ledger (4-5 per article surfaced during research)
--
-- The verbatim ledger is the substrate for the F6 H1 / F9 A4 verbatim audit.
-- Paragraph structure preservation is required by C3; quote_text stores
-- \n\n between paragraphs so the downstream audit can string-compare without
-- a separate paragraph table.

-- ─── enums ──────────────────────────────────────────────────────

create type article_source_kind as enum (
  'primary',             -- Press release, official statement, peer-reviewed paper, regulatory filing, etc.
  'independent',         -- Independent confirmation from a different outlet
  'subject_response',    -- Tier 2 right-of-reply material (statement, social, regulatory filing)
  'context'              -- Framing-brief context (≤ 4 per F2 step 5)
);

create type framing_feasibility as enum (
  'supported',           -- Public-record material supports the assigned frame
  'weak',                -- Marginal — F1 reframes or DISQUALIFIES
  'unsupported'          -- F1 reframes or DISQUALIFIES
);

create type dependency_status as enum (
  'clean',
  'digit_exposed',
  'futurescot_exposed',
  'sfn_exposed'          -- B2 signal-only outlets
);

create type f2_verdict as enum (
  'hand_to_f3',
  'hand_back_to_f1',     -- Framing weak/unsupported
  'route_to_reject'      -- Paywalled primary, or other blocker
);

-- ─── article_sources ────────────────────────────────────────────

create table public.article_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  kind article_source_kind not null,
  url text not null,
  title text,
  publisher text,
  published_at timestamptz,
  author text,
  content text,                                  -- Full content, original Unicode codepoints preserved
  is_signal_only boolean not null default false, -- DIGIT/Futurescot/SFN — flagged at insert by URL/publisher
  is_paywalled boolean not null default false,
  notes text,
  order_idx smallint not null default 0,
  fetched_at timestamptz not null default now(),
  fetched_by uuid references public.profiles(id)
);

create index article_sources_article_idx on public.article_sources(article_id);
create index article_sources_kind_idx on public.article_sources(article_id, kind);

comment on column public.article_sources.content is
  'Full source content with original Unicode codepoints (incl U+2010/U+2011 hyphen variants). Substrate for B1 verbatim audit.';
comment on column public.article_sources.is_signal_only is
  'B2 signal-only outlets (DIGIT, Futurescot, SFN). Set by signal-only check at insert. Never drafting basis — pointer only.';

-- ─── article_quotes ─────────────────────────────────────────────

create table public.article_quotes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  source_id uuid references public.article_sources(id) on delete set null,
  quote_text text not null,        -- Paragraph breaks preserved as \n\n
  speaker text,
  role text,
  institution text,
  order_idx smallint not null default 0,
  created_at timestamptz not null default now()
);

create index article_quotes_article_idx on public.article_quotes(article_id);

comment on column public.article_quotes.quote_text is
  'Verbatim, paragraph breaks preserved as \n\n. Substrate for C1 verbatim audit + C3 paragraph-break preservation.';

-- ─── article_research ───────────────────────────────────────────

create table public.article_research (
  article_id uuid primary key references public.articles(id) on delete cascade,
  framing_feasibility framing_feasibility,
  feasibility_evidence text,
  dependency_status dependency_status,
  primary_paywalled boolean not null default false,
  nfp_footer_draft text,                         -- B8 / C9 — Researcher drafts, Writer completes
  verdict f2_verdict,
  verdict_at timestamptz,
  verdict_by uuid references public.profiles(id),
  verdict_rationale text,
  updated_at timestamptz not null default now()
);

create trigger trg_article_research_updated
  before update on public.article_research
  for each row execute function public.set_updated_at();

-- ─── article_pipeline_opportunities (B7) ────────────────────────

create table public.article_pipeline_opportunities (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  title text not null,
  category text,
  priority smallint check (priority is null or priority in (1, 2, 3)),  -- 1=high, 2=med, 3=low
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index article_pipeline_opportunities_article_idx
  on public.article_pipeline_opportunities(article_id);
