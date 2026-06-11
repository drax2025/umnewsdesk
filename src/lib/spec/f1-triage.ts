/**
 * F1 Triage scorecard constants, lifted from spec v3.0:
 *   - B0   three-option production ladder
 *   - B9   six editorial frames
 *   - B9.1 three-axis framing model (geographic tier, category tags, primary frame)
 *   - B9.2 framing brief shape
 *   - D-Tiers three-tier defamation framework
 *
 * Single source of truth — the inbox table, modal form, and server action all
 * import from here. Update the spec, update this file, the UI follows.
 */

/* -------------------------------------------------------------------------- */
/*  B0 — Production option                                                    */
/* -------------------------------------------------------------------------- */

export type ProductionOption = 1 | 2 | 3;

export const PRODUCTION_OPTIONS: { value: ProductionOption; label: string; hint: string }[] = [
  { value: 1, label: "1 — Direct Publish",   hint: "Submitted content as received. Sense-check only." },
  { value: 2, label: "2 — AI Rewrite",       hint: "Clean rewrite from source. Default for routine submitted." },
  { value: 3, label: "3 — Value Added",      hint: "Contextualised, editorially framed. Default for sourced." },
];

/* -------------------------------------------------------------------------- */
/*  D-Tiers — Defamation tier                                                 */
/* -------------------------------------------------------------------------- */

export type DefamationTier = 1 | 2 | 3;

export const DEFAMATION_TIERS: { value: DefamationTier; label: string; hint: string }[] = [
  { value: 1, label: "1 — Standard",         hint: "Neutral or positive, public-record events. ~90% of output." },
  { value: 2, label: "2 — Sensitive",        hint: "Named criticism / dispute. Publishes only if both sides on record." },
  { value: 3, label: "3 — Hold or Refuse",   hint: "Allegations without confirmation. Default to reject queue." },
];

/* -------------------------------------------------------------------------- */
/*  B9.1 — Axis 1: Geographic tier                                            */
/* -------------------------------------------------------------------------- */

export type GeographicTier = "scottish_origin" | "uk_origin" | "global_origin";

export const GEOGRAPHIC_TIERS: { value: GeographicTier; label: string; short: string }[] = [
  { value: "scottish_origin", label: "Scottish-origin", short: "SCO" },
  { value: "uk_origin",       label: "UK-origin",       short: "UK"  },
  { value: "global_origin",   label: "Global-origin",   short: "INT" },
];

/* -------------------------------------------------------------------------- */
/*  B9.1 — Axis 2: Category tags (fixed taxonomy of sixteen)                  */
/* -------------------------------------------------------------------------- */

export const CATEGORY_TAGS = [
  "AI",
  "Cyber",
  "Fintech",
  "Biotech",
  "Space",
  "Robotics",
  "Games",
  "IT",
  "Science",
  "HealthTech",
  "EdTech",
  "CleanTech",
  "Quantum",
  "Semiconductor",
  "GovTech",
  "Data",
] as const;

export type CategoryTag = (typeof CATEGORY_TAGS)[number];

export const MAX_CATEGORY_TAGS = 3;

/* -------------------------------------------------------------------------- */
/*  B9 — Axis 3: Primary frame (one of six)                                   */
/* -------------------------------------------------------------------------- */

export const PRIMARY_FRAMES = [
  "Scottish Context",
  "Wider Sector Picture",
  "Technical or Scientific Depth",
  "Policy and Regulation",
  "Human Impact",
  "Comparison or Data Point",
] as const;

export type PrimaryFrame = (typeof PRIMARY_FRAMES)[number];

/* -------------------------------------------------------------------------- */
/*  B9.2 — Framing brief                                                      */
/* -------------------------------------------------------------------------- */

export type FramingBrief = {
  geographic_tier: GeographicTier | null;
  category_tags: CategoryTag[];
  primary_frame: PrimaryFrame | null;
  scottish_anchor: string | null;
  per_story_brief: string | null;
};

export const EMPTY_FRAMING_BRIEF: FramingBrief = {
  geographic_tier: null,
  category_tags: [],
  primary_frame: null,
  scottish_anchor: null,
  per_story_brief: null,
};

/* -------------------------------------------------------------------------- */
/*  Scorecard completion                                                      */
/* -------------------------------------------------------------------------- */

export type TriageScorecard = {
  production_option: ProductionOption | null;
  defamation_tier: DefamationTier | null;
  framing_brief: FramingBrief | null;
};

export function scorecardStatus(
  s: TriageScorecard,
): "complete" | "partial" | "empty" {
  const fb = s.framing_brief;
  const fields = [
    s.production_option,
    s.defamation_tier,
    fb?.geographic_tier,
    fb?.primary_frame,
    fb?.scottish_anchor,
    fb?.per_story_brief,
    fb?.category_tags && fb.category_tags.length > 0 ? "yes" : null,
  ];
  const set = fields.filter((v) => v !== null && v !== undefined).length;
  if (set === 0) return "empty";
  if (set === fields.length) return "complete";
  return "partial";
}
