-- F1 Triage Scorecard fields on candidates (spec sections B0, B9.1, B9.2, D-Tiers).
--
-- F1 Triage assigns these BEFORE drafting; they travel downstream into the
-- commission's framing_brief (migration 0013) and through F2/F3.
--
--   production_option  — B0 three-option production ladder (1 / 2 / 3)
--                        1 = Direct Publish      (submitted content only)
--                        2 = AI Rewrite          (clean rewrite from source)
--                        3 = Value Added         (contextualised w/ editorial framing)
--
--   defamation_tier    — D-Tiers (1 / 2 / 3)
--                        1 = Standard            (~90% of output)
--                        2 = Sensitive           (both sides on public record)
--                        3 = Hold or Refuse      (default to reject queue)
--
--   framing_brief      — B9.2 brief mirrors commissions.framing_brief shape:
--                        {
--                          geographic_tier:  "scottish_origin" | "uk_origin" | "global_origin",
--                          category_tags:    ["AI", "Fintech"]  (≤3 from B9.1 taxonomy of 16),
--                          primary_frame:    one of six B9 frames,
--                          scottish_anchor:  free text — named entity,
--                          per_story_brief:  2-3 sentences
--                        }
--
-- We use individual smallint columns for option/tier (we filter and aggregate
-- on these — tier 2 review queue, option 1 hold-for-sense-check) and JSONB
-- for the framing brief (matches the existing commissions schema, lets us
-- copy across without re-shaping).

alter table public.candidates
  add column if not exists production_option smallint
    check (production_option is null or production_option in (1, 2, 3));

alter table public.candidates
  add column if not exists defamation_tier smallint
    check (defamation_tier is null or defamation_tier in (1, 2, 3));

alter table public.candidates
  add column if not exists framing_brief jsonb;

-- Index on tier — the F6 Reviewer queue needs to find Tier 2 articles fast,
-- and the inbox filter sidebar will surface "Sensitive (Tier 2)" as a chip.
create index if not exists candidates_defamation_tier_idx
  on public.candidates (defamation_tier)
  where defamation_tier is not null;

-- Index on production_option — Option 1 stories carry different downstream
-- workflow (direct publish, sense-check only) so the F1 routing logic
-- filters on it.
create index if not exists candidates_production_option_idx
  on public.candidates (production_option)
  where production_option is not null;

comment on column public.candidates.production_option is
  'B0 production ladder: 1=Direct Publish, 2=AI Rewrite, 3=Value Added. Assigned at F1 Triage.';
comment on column public.candidates.defamation_tier is
  'D-Tiers: 1=Standard, 2=Sensitive, 3=Hold/Refuse. Assigned at F1 Triage; gates F6 H11.';
comment on column public.candidates.framing_brief is
  'B9.2 framing brief — three-axis model (geographic tier, category tags, primary frame) + Scottish anchor + 2-3 sentence per-story brief.';
