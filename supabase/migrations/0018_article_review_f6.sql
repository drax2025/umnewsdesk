-- F6 Reviewer H1-H11 gate audit trail (spec section F6, C1-C9, B2, D-Checklist).
--
-- One record per article, all eleven gates in named columns. We deliberately
-- denormalise the gate statuses onto the parent row rather than spawning a
-- gate_audit table because:
--
--   - The set of gates is fixed and small (11)
--   - The screen renders all eleven together; one row, one read
--   - F9 Pre-Publish Pack joins this in one SELECT
--   - History is preserved via Failure Log entries elsewhere, not gate diffs
--
-- The H11 defamation triage checklist (D-Checklist, 10 questions) is stored
-- as ten booleans on the same row. Tier 1 articles auto-mark H11 as N/A.

-- ─── enums ──────────────────────────────────────────────────────

create type h_gate_status as enum (
  'pending',     -- Not yet reviewed
  'pass',        -- Gate cleared
  'soft_fail',   -- Soft-gate failure — flagged in pack, not blocking
  'fail',        -- Hard-gate failure — returns to producing agent
  'na'           -- Not applicable (e.g. H11 on Tier 1 articles)
);

create type f6_verdict as enum (
  'hand_to_f9',      -- All hard gates pass — proceed to Pre-Publish Pack
  'return_to_f1',    -- Triage / framing failure (H8 framing, H11 tier)
  'return_to_f2',    -- Source / quote failure (H1, H2, H3, H4, H5)
  'return_to_f3',    -- Writer-level failure (H6 word count, H4 register)
  'return_to_f4',    -- Interlinker failure (H7 link integrity)
  'return_to_f5',    -- Editor-level failure (H8 headline, H10 standing rules)
  'escalate'         -- Cannot resolve at F6 — bump to Senior Editor [ESC]
);

-- ─── article_review ─────────────────────────────────────────────

create table public.article_review (
  article_id uuid primary key references public.articles(id) on delete cascade,

  -- H1 — Verbatim quote audit (HARD)
  h1_status h_gate_status not null default 'pending',
  h1_detail text,

  -- H2 — Source independence + PDT (HARD)
  h2_status h_gate_status not null default 'pending',
  h2_detail text,

  -- H3 — Paragraph-break preservation (HARD)
  h3_status h_gate_status not null default 'pending',
  h3_detail text,

  -- H4 — Author-register preservation (HARD)
  h4_status h_gate_status not null default 'pending',
  h4_detail text,

  -- H5 — Date reconciliation (HARD)
  h5_status h_gate_status not null default 'pending',
  h5_detail text,

  -- H6 — Word count 500-750 (SOFT)
  h6_status h_gate_status not null default 'pending',
  h6_detail text,
  h6_word_count integer,

  -- H7 — Link integrity (SOFT)
  h7_status h_gate_status not null default 'pending',
  h7_detail text,
  h7_internal_link_count smallint,

  -- H8 — Headline character count ≤ 90 (SOFT)
  h8_status h_gate_status not null default 'pending',
  h8_detail text,
  h8_headline_chars smallint,

  -- H9 — NFP footer presence + completeness (SOFT)
  h9_status h_gate_status not null default 'pending',
  h9_detail text,

  -- H10 — Standing-rule compliance (HARD)
  h10_status h_gate_status not null default 'pending',
  h10_detail text,

  -- H11 — Defamation triage checklist (HARD, T2 only)
  h11_status h_gate_status not null default 'pending',
  h11_detail text,

  -- H11 ten-question D-Checklist (yes = true, no = false, null = unanswered)
  -- Q3-Q9: "yes" required for PASS.
  -- Q10:   "no"  required for PASS.
  h11_q1_identifies_subject boolean,
  h11_q2_factual_claim boolean,
  h11_q3_claim_provable boolean,
  h11_q4_comment_basis_stated boolean,
  h11_q5_inference_framed boolean,
  h11_q6_response_cited boolean,
  h11_q7_defence_identified boolean,
  h11_q8_third_parties_considered boolean,
  h11_q9_distinguished_categories boolean,
  h11_q10_unsupported_sentence boolean,
  h11_defence text,              -- Truth (S2) / Honest opinion (S3) / Public interest (S4) / Privilege (S6-7) / Reportage
  h11_response_url text,         -- Public-record response URL

  -- Verdict stamp
  verdict f6_verdict,
  verdict_at timestamptz,
  verdict_by uuid references public.profiles(id),
  verdict_rationale text,

  updated_at timestamptz not null default now()
);

create trigger trg_article_review_updated
  before update on public.article_review
  for each row execute function public.set_updated_at();

comment on table public.article_review is
  'F6 Reviewer H1-H11 gate audit trail. One row per article, denormalised because the gate set is fixed (11). H11 holds the D-Checklist for Tier 2 articles.';

comment on column public.article_review.h11_q10_unsupported_sentence is
  'D-Checklist Q10: "Would a hostile reader identify an unsupported sentence?" YES fails H11. PASS requires NO.';
