-- ════════════════════════════════════════════════════════════════════════
-- Editorial path completion (items 1-5 of the spec-gap report)
--
--   1. Backdate selection on articles (B5 / F5 step 2 / D3 / D4 / Tier 3 rule)
--   2. Standing-Rule Compliance sweep (pack section 10 + section 5 backdate)
--   3. Reasonable-Steps Log (pack section 8, Tier 2 only)
--   4. Structured NOT-FOR-PUBLICATION footer (B7 / B8 / C9 / H9 / A9)
--   5. Article Failure Log (pack section 0, cross-agent record)
--
-- All five drop in additively. The Failure Log replaces the F9-only
-- pre_publish_failures table for cross-agent use; pre_publish_failures stays
-- in place for compatibility — the new table is the canonical audit trail.
-- ════════════════════════════════════════════════════════════════════════


-- ─── 1. BACKDATE on articles ────────────────────────────────────────────

create type backdate_kind as enum (
  'friday_of_week',   -- D3 default A — Friday of publication week
  'friday_after',     -- D3 default B — Friday after a weekend event
  'source_date',      -- Source's own published date (the event Friday)
  'custom'            -- Editor override; rationale required
);

alter table public.articles
  add column if not exists backdate date,
  add column if not exists backdate_kind backdate_kind,
  add column if not exists backdate_rationale text,
  add column if not exists backdate_set_at timestamptz,
  add column if not exists backdate_set_by uuid references public.profiles(id);

create index if not exists articles_backdate_idx
  on public.articles (backdate)
  where backdate is not null;

comment on column public.articles.backdate is
  'B5 backdate the article will appear to be published. Tier 3 articles must have backdate NULL (D rule). D3/D4 guidance applies.';
comment on column public.articles.backdate_kind is
  'B5 / D3 — which backdating rule the editor invoked. friday_after is the default for weekend events; custom requires a rationale.';
comment on column public.articles.backdate_rationale is
  'Required free-text rationale when backdate_kind = custom, or when D3 / D4 edge cases triggered.';


-- ─── 2. STANDING-RULE COMPLIANCE SWEEP (pack section 10) ─────────────────

create type standing_rule_status as enum (
  'pending',          -- Not yet checked
  'checked_pass',     -- Reviewer swept and the rule passes
  'checked_fail',     -- Reviewer swept and the rule fails
  'na'                -- Justifiably not applicable (justification required)
);

create table public.article_standing_rule_sweep (
  article_id uuid primary key references public.articles(id) on delete cascade,

  -- B1 Verbatim audit (extended scope)
  b1_status standing_rule_status not null default 'pending',
  b1_justification text,

  -- B2 Source independence (DIGIT/Futurescot/SFN 17-artefact prohibited-use list)
  b2_status standing_rule_status not null default 'pending',
  b2_justification text,
  b2_artefacts_swept text,   -- Which of the 17 artefacts F9 actually checked

  -- B3 Multi-source attribution
  b3_status standing_rule_status not null default 'pending',
  b3_justification text,

  -- B4 Interlinking discipline (reader-first, 0-3 ceiling)
  b4_status standing_rule_status not null default 'pending',
  b4_justification text,

  -- B5 Backdating discipline
  b5_status standing_rule_status not null default 'pending',
  b5_justification text,

  -- B6 Three-headline generation + click-bait-leaning selection
  b6_status standing_rule_status not null default 'pending',
  b6_justification text,

  -- B7 Audit footer convention (NFP footer present + populated)
  b7_status standing_rule_status not null default 'pending',
  b7_justification text,

  -- Section M Defamation framework (Tier, Act defence, reasonable steps)
  section_m_status standing_rule_status not null default 'pending',
  section_m_justification text,

  -- Section L Lifts and verbatim handling
  section_l_status standing_rule_status not null default 'pending',
  section_l_justification text,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create trigger trg_article_standing_rule_sweep_updated
  before update on public.article_standing_rule_sweep
  for each row execute function public.set_updated_at();

comment on table public.article_standing_rule_sweep is
  'F9 Pack section 10 — Standing-Rule Compliance table. Cannot return PASS unless every row is CHECKED-PASS / CHECKED-FAIL / N/A-with-justification. A pending or N/A-without-justification row = INCOMPLETE.';


-- ─── 3. REASONABLE-STEPS LOG (pack section 8, Tier 2 only) ──────────────

create type defamation_defence as enum (
  'truth',             -- Defamation Act 2013 s.2
  'honest_opinion',    -- s.3
  'public_interest',   -- s.4
  'privilege',         -- s.6 / s.7
  'reportage'          -- Reportage doctrine
);

create table public.article_reasonable_steps (
  article_id uuid primary key references public.articles(id) on delete cascade,

  subjects_named text,                              -- Comma- or newline-separated
  public_record_response_url text,
  public_record_response_date date,

  defence defamation_defence,
  defence_justification text,                       -- One sentence

  tier_classifier_id uuid references public.profiles(id),
  tier_classifier_name text,                        -- Snapshot at classify time

  updated_at timestamptz not null default now()
);

create trigger trg_article_reasonable_steps_updated
  before update on public.article_reasonable_steps
  for each row execute function public.set_updated_at();

comment on table public.article_reasonable_steps is
  'F9 Pack section 8 — Reasonable-steps log for Tier 2 articles. D-Steps doctrine. Required for every Tier 2 article that proceeds to production.';


-- ─── 4. STRUCTURED NFP FOOTER ───────────────────────────────────────────
--
-- The existing article_research.nfp_footer_draft is free text. We add a
-- structured companion (JSONB) so H9 / A9 can audit field-by-field without
-- prose parsing. The free-text draft remains for paragraph notes.
--
-- Shape (target):
-- {
--   primary_source_url:        string,
--   independent_confirmations: string[],
--   dependency_status:         'clean' | 'digit_exposed' | 'futurescot_exposed' | 'sfn_exposed',
--   verbatim_audit_result:     'pass' | 'fail' | 'pending',
--   selected_backdate:         'YYYY-MM-DD' | null,
--   internal_link_count:       number,
--   outbound_link_count:       number,
--   word_count:                number,
--   video_script_status:       'pending' | 'drafted' | 'approved' | 'n_a',
--   triage_outcome:            string,
--   production_option:         1 | 2 | 3,
--   framing_brief_recap:       string,
--   defamation_tier:           1 | 2 | 3,
--   m3_outcome:                'pass' | 'fail' | 'n_a',
--   headline_options:          string[],
--   agent_headline_pick:       string,
--   agent_headline_rationale:  string
-- }

alter table public.article_research
  add column if not exists nfp_footer_fields jsonb,
  add column if not exists nfp_footer_updated_at timestamptz,
  add column if not exists nfp_footer_updated_by uuid references public.profiles(id);

comment on column public.article_research.nfp_footer_fields is
  'B7/B8/C9 — structured NFP footer for field-by-field audit. Companion to nfp_footer_draft.';


-- ─── 5. ARTICLE FAILURE LOG (pack section 0, cross-agent) ────────────────
--
-- Cross-agent chronological record. Sourced from F1/F2/F3/F4/F5/F6/F9 via the
-- shared appendFailureEvent action. Read by the pack renderer + by F9 audit.

create type failure_log_stage as enum (
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F9'
);

create type failure_log_event as enum (
  'triage_reject',           -- F1 disqualification
  'hard_gate_return',        -- F6 H-gate hard-fail
  'a_check_return',          -- F9 A-check hard-fail
  'rework',                  -- Any agent re-running
  'standing_rule_check_late',-- Standing rule added/checked after Stage 5
  'figure_revised',          -- Numeric claim changed mid-pipeline
  'quote_revised',           -- Quote changed after first draft
  'source_added',            -- Source pack mutated post Stage 4
  'source_removed',          -- Source pack mutated post Stage 4
  'override_applied',        -- SK-OPS.apply-override invoked
  'other'                    -- Free-text catch-all
);

create table public.article_failure_log (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  stage failure_log_stage not null,
  event failure_log_event not null,
  gate_code text,                       -- H1-H11 / A1-A10 / null
  detail text not null,
  remediation text,
  override_applied boolean not null default false,
  override_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index article_failure_log_article_idx
  on public.article_failure_log (article_id, created_at desc);
create index article_failure_log_stage_idx
  on public.article_failure_log (article_id, stage);

comment on table public.article_failure_log is
  'Pack section 0 — chronological cross-agent failure log. Read BEFORE the article content sections. Empty log = clean run (still mandatory section).';
