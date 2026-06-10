-- Per-factor breakdown for the Triage Scorecard (spec C0).
-- Stored as JSON so we can render the rationale on hover and audit drift later.
-- Shape: { scottish_relevance, sector_relevance, recency, multi_source,
--          audience_impact, editorial_angle, press_release_quality, rationale }

alter table public.candidates
  add column if not exists score_breakdown jsonb;
