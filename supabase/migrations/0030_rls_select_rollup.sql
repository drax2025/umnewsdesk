-- Rollup: fix RLS read-blackhole on 14 tables created by 0017-0023.
--
-- Same bug as 0029_article_review_rls.sql, but caught at audit time across
-- the rest of the F-pipeline schema. The Supabase project has RLS-by-default
-- on, so any table created without an explicit SELECT policy silently filters
-- authenticated reads to zero rows. The service-role client still sees the
-- data (because it bypasses RLS), so writes look successful and the table is
-- populated when inspected from the dashboard — but the user-facing app gets
-- back null and the screen renders blank.
--
-- Symptoms users would hit:
--   - F2 Research dossier: sources / quotes / research / opportunities blank
--   - F4 Interlinker: link list + verdict row blank
--   - F9 Pre-Publish: pack panel, failures, standing-rule sweep, reasonable
--     steps, failure log all blank — AND the global Approvals queue blank
--   - F8 Post-Publish: artefact sweep + publish log blank
--   - Escalation queue: F4/F9 escalations don't surface
--
-- Fix per table: enable RLS explicitly + add a SELECT policy for any
-- authenticated user. All writes already route through service-role server
-- actions in lib/actions/* that gate on profiles.role, so we deliberately do
-- NOT add INSERT/UPDATE/DELETE policies — the service client bypasses them
-- and the write authority lives in code where the role check is.
--
-- Same pattern as 0028 (article_corrections) and 0029 (article_review).

-- ─── F2 Research (0017) ─────────────────────────────────────────

alter table public.article_sources enable row level security;
drop policy if exists article_sources_select on public.article_sources;
create policy article_sources_select
  on public.article_sources for select
  to authenticated using (true);

alter table public.article_quotes enable row level security;
drop policy if exists article_quotes_select on public.article_quotes;
create policy article_quotes_select
  on public.article_quotes for select
  to authenticated using (true);

alter table public.article_research enable row level security;
drop policy if exists article_research_select on public.article_research;
create policy article_research_select
  on public.article_research for select
  to authenticated using (true);

alter table public.article_pipeline_opportunities enable row level security;
drop policy if exists article_pipeline_opportunities_select on public.article_pipeline_opportunities;
create policy article_pipeline_opportunities_select
  on public.article_pipeline_opportunities for select
  to authenticated using (true);

-- ─── F4 Interlinker (0019) ──────────────────────────────────────

alter table public.article_interlinks enable row level security;
drop policy if exists article_interlinks_select on public.article_interlinks;
create policy article_interlinks_select
  on public.article_interlinks for select
  to authenticated using (true);

alter table public.article_interlinker enable row level security;
drop policy if exists article_interlinker_select on public.article_interlinker;
create policy article_interlinker_select
  on public.article_interlinker for select
  to authenticated using (true);

-- ─── F9 Pre-Publish (0020) ──────────────────────────────────────

alter table public.article_pre_publish enable row level security;
drop policy if exists article_pre_publish_select on public.article_pre_publish;
create policy article_pre_publish_select
  on public.article_pre_publish for select
  to authenticated using (true);

alter table public.pre_publish_failures enable row level security;
drop policy if exists pre_publish_failures_select on public.pre_publish_failures;
create policy pre_publish_failures_select
  on public.pre_publish_failures for select
  to authenticated using (true);

alter table public.pre_publish_packs enable row level security;
drop policy if exists pre_publish_packs_select on public.pre_publish_packs;
create policy pre_publish_packs_select
  on public.pre_publish_packs for select
  to authenticated using (true);

-- ─── Editorial path completion (0022) ───────────────────────────

alter table public.article_standing_rule_sweep enable row level security;
drop policy if exists article_standing_rule_sweep_select on public.article_standing_rule_sweep;
create policy article_standing_rule_sweep_select
  on public.article_standing_rule_sweep for select
  to authenticated using (true);

alter table public.article_reasonable_steps enable row level security;
drop policy if exists article_reasonable_steps_select on public.article_reasonable_steps;
create policy article_reasonable_steps_select
  on public.article_reasonable_steps for select
  to authenticated using (true);

alter table public.article_failure_log enable row level security;
drop policy if exists article_failure_log_select on public.article_failure_log;
create policy article_failure_log_select
  on public.article_failure_log for select
  to authenticated using (true);

-- ─── F8 Post-Publish (0023) ─────────────────────────────────────

alter table public.article_artefact_sweep enable row level security;
drop policy if exists article_artefact_sweep_select on public.article_artefact_sweep;
create policy article_artefact_sweep_select
  on public.article_artefact_sweep for select
  to authenticated using (true);

alter table public.article_publish_log enable row level security;
drop policy if exists article_publish_log_select on public.article_publish_log;
create policy article_publish_log_select
  on public.article_publish_log for select
  to authenticated using (true);
