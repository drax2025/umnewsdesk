-- Structured framing brief (spec section P2 / B9.2). Travels with the
-- article through F2 Researcher and F3 Writer; appears in the NFP footer
-- per C9. Kept on the commission because that's where the editor authors
-- it; later we may promote to articles when the article dossier needs it.
--
-- Shape:
-- {
--   "geographic_tier":  "scottish_origin" | "uk_origin" | "global_origin",
--   "category_tags":    ["AI", "Fintech"],
--   "primary_frame":    "Scottish Context",
--   "scottish_anchor":  "NatWest Edinburgh AI unit",
--   "per_story_brief":  "Lead with the FCA's new AI-in-financial-services …",
--   "disqualified":     false,
--   "disqualified_reason": null
-- }

alter table public.commissions
  add column if not exists framing_brief jsonb;
