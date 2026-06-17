-- ════════════════════════════════════════════════════════════════════════════
-- 0036_rename_f9_to_f7_pre_flight.sql
--
-- Canonical stage rename. The newsroom spec now numbers the editorial flow:
--
--   RR — Ranger Recon          (was: Discovery / OPS-RR process)
--   F1 — Triage                (unchanged)
--   F2 — Research              (unchanged)
--   F3 — Initial Draft         (was: Framing / Writer / Headlines)
--   F4 — Interlink             (was: Interlinks)
--   F5 — Editor                (was: F5 Edit / Backdate)
--   F6 — Final Review          (was: Review)
--   F7 — Pre-Flight Check      (was: F9 Pre-Publish)   ← renumbered
--   F8 — Publish               (was: F8 Post-Publish)  ← relabelled
--
-- The structural change is F9 → F7. F8 keeps its number but its role label
-- shifts from "Post-Publish" to "Publish" (it's the actual publish push,
-- not a follow-up). Old F8 sat after old F9 in practice (sweep + push after
-- the pack approval); under the new model F7 is the final gate and F8 the
-- publish action — same ordering, clearer names.
--
-- This migration:
--   1. Renames type f9_verdict → f7_verdict (column auto-updates).
--   2. Renames tables article_pre_publish, pre_publish_failures,
--      pre_publish_packs → article_pre_flight, pre_flight_failures,
--      pre_flight_packs (indexes + triggers follow).
--   3. Updates the root_cause_agent CHECK to F1–F7 (drops F9, adds F7).
--   4. Extends failure_log_stage with F7 and F8 (was F1–F6, F9).
--      F9 stays in the enum — Postgres cannot drop enum values without a
--      type recreate, and leaving it doesn't hurt: code never writes F9.
--   5. Updates column comments + table comments to match.
--
-- "Rename in place" was chosen explicitly. This will fail loudly on a
-- database that already has live data referencing the old type by name in
-- views or functions — there are none in current migrations, so it's safe.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Type rename (f9_verdict → f7_verdict) ───────────────────────────────
--
-- The enum VALUES (return_to_f1..return_to_f6, hand_to_senior_editor) stay.
-- They reference the upstream agent the check returns to — F1..F6 still
-- exist with the same numbers, and hand_to_senior_editor still routes to
-- [PUB] → F8 Publish.

alter type f9_verdict rename to f7_verdict;


-- ─── 1b. Update f6_verdict.hand_to_f9 → hand_to_f7 ─────────────────────────
--
-- F6 hands off to the next pipeline stage on success. That stage used to be
-- F9; under the new numbering it's F7. Existing rows with the old value get
-- carried over by the rename — Postgres handles this in place.

alter type f6_verdict rename value 'hand_to_f9' to 'hand_to_f7';


-- ─── 2. Table renames (pre_publish_* → pre_flight_*) ───────────────────────

alter table public.article_pre_publish     rename to article_pre_flight;
alter table public.pre_publish_failures    rename to pre_flight_failures;
alter table public.pre_publish_packs       rename to pre_flight_packs;

-- Indexes are tied to tables but their own names don't auto-rename.
alter index public.article_pre_publish_pack_ref_idx
  rename to article_pre_flight_pack_ref_idx;
alter index public.pre_publish_failures_article_idx
  rename to pre_flight_failures_article_idx;
alter index public.pre_publish_failures_check_idx
  rename to pre_flight_failures_check_idx;

-- Triggers likewise.
alter trigger trg_article_pre_publish_updated on public.article_pre_flight
  rename to trg_article_pre_flight_updated;
alter trigger trg_pre_publish_packs_updated on public.pre_flight_packs
  rename to trg_pre_flight_packs_updated;


-- ─── 3. Update root_cause_agent CHECK on pre_flight_failures ───────────────
--
-- The constraint listed F1..F6, F9 because F7/F8 didn't exist. Under the new
-- numbering F7 is the agent running these checks; if a fail's root cause is
-- itself an F7 bug we want to log that. Add F7. F9 dropped (no longer used).

alter table public.pre_flight_failures
  drop constraint if exists pre_publish_failures_root_cause_agent_check;

alter table public.pre_flight_failures
  add constraint pre_flight_failures_root_cause_agent_check
  check (root_cause_agent in ('F1','F2','F3','F4','F5','F6','F7'));


-- ─── 4. Extend failure_log_stage enum (add F7, F8) ─────────────────────────
--
-- ADD VALUE cannot run in the same transaction as a query that references
-- the new value. Supabase Studio's SQL editor runs each statement
-- separately so pasting this whole file at once is fine.

alter type failure_log_stage add value if not exists 'F7';
alter type failure_log_stage add value if not exists 'F8';


-- ─── 5. Comment refresh ────────────────────────────────────────────────────

comment on table public.article_pre_flight is
  'F7 Pre-Flight Check assembly. One row per article. A1–A10 active checks independent of F6 gates. Verdict hands to Senior Editor via [PUB] → F8 Publish, or returns to upstream agent on FAIL.';

comment on column public.article_pre_flight.pack_ref is
  'Hard cap of 3 articles per pack — packs are grouped by this ref. Renamed from PPP to PFP convention is forward-compatible; existing refs are left untouched.';

comment on table public.pre_flight_failures is
  'F7 Failure Log per article. One row per A-check soft_fail / fail. Sourced via SK-RECORD.append-failure-log-row.';

comment on table public.pre_flight_packs is
  'F7 Pre-Flight Pack record. Hard cap of 3 articles per pack (see article_1/2/3 columns). Stamped with Senior Editor verdict via [PUB] before handoff to F8 Publish.';

comment on table public.article_artefact_sweep is
  'F8 Publish — Stage 1: final B2 17-artefact sweep before WordPress push. Publish blocked while any artefact is pending or contamination_found.';

comment on table public.article_publish_log is
  'F8 Publish — Stage 2: chronological publish-attempt log. Successful publish flips articles.state to live and sets published_at on the article.';
