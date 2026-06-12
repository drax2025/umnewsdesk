/**
 * Structured NOT-FOR-PUBLICATION footer (B7 / B8 / C9 / H9 / A9).
 *
 * Companion to the free-text `article_research.nfp_footer_draft`. The
 * structured fields live in `article_research.nfp_footer_fields` (JSONB)
 * so H9 (footer audit) and A9 (Pre-Publish footer cross-check) can
 * field-by-field audit without prose parsing.
 *
 * Field set is the consolidated NFP convention from the spec:
 *   - Primary source URL + independent confirmations (B2/B3)
 *   - Dependency status (B2 17-artefact prohibited-use clean/exposed)
 *   - Verbatim audit result (B1)
 *   - Selected backdate (B5)
 *   - Internal/outbound link counts (B4)
 *   - Word count + video script status (C/D)
 *   - Triage outcome (F1) + production option (F2/F3)
 *   - Framing brief recap (F3)
 *   - Defamation tier + M3 outcome (Section M)
 *   - Three headlines + agent's pick + rationale (B6 / B6.1)
 */

export type DependencyStatus =
  | "clean"
  | "digit_exposed"
  | "futurescot_exposed"
  | "sfn_exposed";

export type VerbatimAuditResult = "pass" | "fail" | "pending";

export type VideoScriptStatus = "pending" | "drafted" | "approved" | "n_a";

export type M3Outcome = "pass" | "fail" | "n_a";

export type ProductionOption = 1 | 2 | 3;

export type NFPFooterFields = {
  primary_source_url: string | null;
  independent_confirmations: string[];
  dependency_status: DependencyStatus | null;
  verbatim_audit_result: VerbatimAuditResult | null;
  selected_backdate: string | null; // YYYY-MM-DD
  internal_link_count: number | null;
  outbound_link_count: number | null;
  word_count: number | null;
  video_script_status: VideoScriptStatus | null;
  triage_outcome: string | null;
  production_option: ProductionOption | null;
  framing_brief_recap: string | null;
  defamation_tier: 1 | 2 | 3 | null;
  m3_outcome: M3Outcome | null;
  headline_options: string[];
  agent_headline_pick: string | null;
  agent_headline_rationale: string | null;
};

export const EMPTY_NFP_FOOTER: NFPFooterFields = {
  primary_source_url: null,
  independent_confirmations: [],
  dependency_status: null,
  verbatim_audit_result: null,
  selected_backdate: null,
  internal_link_count: null,
  outbound_link_count: null,
  word_count: null,
  video_script_status: null,
  triage_outcome: null,
  production_option: null,
  framing_brief_recap: null,
  defamation_tier: null,
  m3_outcome: null,
  headline_options: [],
  agent_headline_pick: null,
  agent_headline_rationale: null,
};

export type NFPFooterField = keyof NFPFooterFields;

export const NFP_FOOTER_FIELD_LABELS: Record<NFPFooterField, string> = {
  primary_source_url: "Primary source URL",
  independent_confirmations: "Independent confirmations",
  dependency_status: "Dependency status (B2)",
  verbatim_audit_result: "Verbatim audit result (B1)",
  selected_backdate: "Selected backdate (B5)",
  internal_link_count: "Internal link count (B4)",
  outbound_link_count: "Outbound link count (B4)",
  word_count: "Word count",
  video_script_status: "Video script status",
  triage_outcome: "Triage outcome (F1)",
  production_option: "Production option (1 / 2 / 3)",
  framing_brief_recap: "Framing brief recap",
  defamation_tier: "Defamation tier",
  m3_outcome: "M3 outcome",
  headline_options: "Three headline options (B6)",
  agent_headline_pick: "Agent headline pick (B6.1)",
  agent_headline_rationale: "Pick rationale (B6.1)",
};

/* -------------------------------------------------------------------------- */
/*  Tier-aware required-vs-optional matrix                                    */
/* -------------------------------------------------------------------------- */

/** Fields required for ALL tiers. */
const ALWAYS_REQUIRED: NFPFooterField[] = [
  "primary_source_url",
  "dependency_status",
  "verbatim_audit_result",
  "internal_link_count",
  "outbound_link_count",
  "word_count",
  "triage_outcome",
  "production_option",
  "framing_brief_recap",
  "defamation_tier",
  "headline_options",
  "agent_headline_pick",
  "agent_headline_rationale",
];

/** Tier 2 also requires the defamation framework + Section M outcome. */
const TIER_2_EXTRA: NFPFooterField[] = ["m3_outcome"];

/** Backdate is required UNLESS Tier 3 (which forbids backdate). */
function backdateRequiredFor(tier: 1 | 2 | 3 | null): boolean {
  return tier !== 3;
}

export type NFPFooterSummary = {
  populated: number;
  missing: NFPFooterField[];
  total: number;
  /** True iff every required field for the current tier is populated. */
  complete: boolean;
};

/**
 * "Populated" means: non-null, non-empty string, non-empty array.
 * Numbers are populated iff present and a real number (0 counts).
 */
function isFieldPopulated(
  fields: NFPFooterFields,
  field: NFPFooterField,
): boolean {
  const v = fields[field];
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

export function summariseNFPFooter(
  fields: NFPFooterFields,
  tier: 1 | 2 | 3 | null,
): NFPFooterSummary {
  const required: NFPFooterField[] = [...ALWAYS_REQUIRED];
  if (tier === 2) required.push(...TIER_2_EXTRA);
  if (backdateRequiredFor(tier)) required.push("selected_backdate");

  let populated = 0;
  const missing: NFPFooterField[] = [];

  for (const f of required) {
    if (isFieldPopulated(fields, f)) populated += 1;
    else missing.push(f);
  }

  return {
    populated,
    missing,
    total: required.length,
    complete: missing.length === 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  JSONB normaliser                                                          */
/* -------------------------------------------------------------------------- */

const DEPENDENCY_VALUES: DependencyStatus[] = [
  "clean",
  "digit_exposed",
  "futurescot_exposed",
  "sfn_exposed",
];
const VERBATIM_VALUES: VerbatimAuditResult[] = ["pass", "fail", "pending"];
const VIDEO_VALUES: VideoScriptStatus[] = [
  "pending",
  "drafted",
  "approved",
  "n_a",
];
const M3_VALUES: M3Outcome[] = ["pass", "fail", "n_a"];

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v;
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function asEnum<T extends string>(v: unknown, allowed: T[]): T | null {
  if (typeof v === "string" && allowed.includes(v as T)) return v as T;
  return null;
}

function asTier(v: unknown): 1 | 2 | 3 | null {
  if (v === 1 || v === 2 || v === 3) return v;
  return null;
}

function asProductionOption(v: unknown): ProductionOption | null {
  if (v === 1 || v === 2 || v === 3) return v;
  return null;
}

/**
 * Coerce arbitrary JSONB → a strongly-typed NFPFooterFields.
 * Defensive against schema drift — unknown shapes return EMPTY_NFP_FOOTER.
 */
export function normaliseNFPFooter(raw: unknown): NFPFooterFields {
  if (!raw || typeof raw !== "object") return EMPTY_NFP_FOOTER;
  const r = raw as Record<string, unknown>;

  return {
    primary_source_url: asString(r.primary_source_url),
    independent_confirmations: asStringArray(r.independent_confirmations),
    dependency_status: asEnum(r.dependency_status, DEPENDENCY_VALUES),
    verbatim_audit_result: asEnum(r.verbatim_audit_result, VERBATIM_VALUES),
    selected_backdate: asString(r.selected_backdate),
    internal_link_count: asNumber(r.internal_link_count),
    outbound_link_count: asNumber(r.outbound_link_count),
    word_count: asNumber(r.word_count),
    video_script_status: asEnum(r.video_script_status, VIDEO_VALUES),
    triage_outcome: asString(r.triage_outcome),
    production_option: asProductionOption(r.production_option),
    framing_brief_recap: asString(r.framing_brief_recap),
    defamation_tier: asTier(r.defamation_tier),
    m3_outcome: asEnum(r.m3_outcome, M3_VALUES),
    headline_options: asStringArray(r.headline_options),
    agent_headline_pick: asString(r.agent_headline_pick),
    agent_headline_rationale: asString(r.agent_headline_rationale),
  };
}
