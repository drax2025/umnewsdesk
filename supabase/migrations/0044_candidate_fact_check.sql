-- ═══════════════════════════════════════════════════════════
-- The advisory fact-check: what a candidate says, against the page it
-- came from. Stored on the candidate as well as sent to the newsroom,
-- so News Desk can answer "what did we know when we sent this" without
-- asking V1.
--
-- jsonb rather than columns because the finding shape will change and a
-- migration per adjustment to an advisory note is not worth it. Nothing
-- queries inside it; it is read whole or not at all.
--
-- No default and no not-null: a candidate that has never been sent has
-- never been checked, and "not checked" must not read as "clean".
-- ═══════════════════════════════════════════════════════════

alter table public.candidates
  add column if not exists fact_check      jsonb,
  add column if not exists fact_checked_at timestamptz;

comment on column public.candidates.fact_check is
  'Advisory fact-check result: {state: clean|notes|unavailable, findings[], ...}. Never blocks a send.';
comment on column public.candidates.fact_checked_at is
  'When the check ran. Null means never checked, which is not the same as clean.';
