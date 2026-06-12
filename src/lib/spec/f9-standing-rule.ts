/**
 * Pack section 10 — Standing-Rule Compliance.
 *
 * F9 cannot return PASS without every row completed:
 *   CHECKED-PASS / CHECKED-FAIL / N/A-with-justification.
 *
 * A pending row, or N/A without justification, makes the pack INCOMPLETE
 * and routes back to F9.
 *
 * Mirrors article_standing_rule_sweep in migration 0022.
 */

export type StandingRuleStatus =
  | "pending"
  | "checked_pass"
  | "checked_fail"
  | "na";

export const STANDING_RULE_STATUS: {
  value: StandingRuleStatus;
  label: string;
  short: string;
  glyph: string;
  tone: "muted" | "success" | "destructive" | "warn";
}[] = [
  { value: "pending",        label: "Pending",         short: "—",       glyph: "—",   tone: "muted"       },
  { value: "checked_pass",   label: "Checked — pass",  short: "PASS",    glyph: "✅", tone: "success"     },
  { value: "checked_fail",   label: "Checked — fail",  short: "FAIL",    glyph: "❌", tone: "destructive" },
  { value: "na",             label: "N/A (justify)",   short: "N/A",     glyph: "—",   tone: "warn"        },
];

/** Spec ordering — the 9 rows in the pack table. */
export type StandingRuleCode =
  | "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "section_m" | "section_l";

export type StandingRuleDef = {
  code: StandingRuleCode;
  label: string;
  description: string;
  /** Row carries an extra free-text "artefacts swept" field — B2 only. */
  hasArtefactsSwept?: boolean;
};

export const STANDING_RULES: StandingRuleDef[] = [
  {
    code: "B1",
    label: "B1 — Verbatim audit (extended scope)",
    description:
      "Substring-match every quoted paragraph against the normalised source, including hyphen/quote variants and body+headline+standfirst scope.",
  },
  {
    code: "B2",
    label: "B2 — Source independence (17-artefact prohibited-use list)",
    description:
      "DIGIT / Futurescot / Scottish Financial News do not appear in any of the 17 prohibited artefacts. Record WHICH artefacts were swept.",
    hasArtefactsSwept: true,
  },
  {
    code: "B3",
    label: "B3 — Multi-source attribution over single-source rewrites",
    description:
      "Article cites at least two independent sources for the central claim, or the primary directly anchors the entire claim.",
  },
  {
    code: "B4",
    label: "B4 — Interlinking discipline (reader-first, 0-3 ceiling)",
    description:
      "Internal links are reader-useful, not SEO-padding. Zero is valid; ceiling of three; outbound links 3-5 separate rule.",
  },
  {
    code: "B5",
    label: "B5 — Backdating discipline",
    description:
      "Friday timestamp consistent with the cadence pattern. Tier 3 articles must NOT be backdated. D3 / D4 edge cases captured in rationale.",
  },
  {
    code: "B6",
    label: "B6 — Three-headline generation + click-bait-leaning selection",
    description:
      "Three options on file, each ≤ 90 chars. Live headline picked per B6.1 click-bait-leaning policy and respects the hard limits (no misrepresentation / no vague teasers / no question / no formula).",
  },
  {
    code: "B7",
    label: "B7 — Audit footer convention (NFP footer present + populated)",
    description:
      "NFP footer carries every required field. Field-by-field audit covered by A9 — this row confirms B7 *standing* compliance.",
  },
  {
    code: "section_m",
    label: "Section M — Defamation framework (Tier, Act defence, reasonable steps)",
    description:
      "Tier classified; Defamation Act 2013 defence selected (Tier 2+); reasonable-steps log populated; M3 checklist passed (Tier 2 only).",
  },
  {
    code: "section_l",
    label: "Section L — Lifts and verbatim handling",
    description:
      "Lifted material (quotes, lifted figures, lifted paragraphs) attributed; paragraph structure preserved; primary attribution clear.",
  },
];

export type ArticleStandingRuleSweepRow = {
  article_id: string;

  b1_status: StandingRuleStatus;
  b1_justification: string | null;

  b2_status: StandingRuleStatus;
  b2_justification: string | null;
  b2_artefacts_swept: string | null;

  b3_status: StandingRuleStatus;
  b3_justification: string | null;

  b4_status: StandingRuleStatus;
  b4_justification: string | null;

  b5_status: StandingRuleStatus;
  b5_justification: string | null;

  b6_status: StandingRuleStatus;
  b6_justification: string | null;

  b7_status: StandingRuleStatus;
  b7_justification: string | null;

  section_m_status: StandingRuleStatus;
  section_m_justification: string | null;

  section_l_status: StandingRuleStatus;
  section_l_justification: string | null;

  updated_at: string;
  updated_by: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function statusForRule(
  row: ArticleStandingRuleSweepRow | null,
  code: StandingRuleCode,
): StandingRuleStatus {
  if (!row) return "pending";
  const key = `${code}_status` as keyof ArticleStandingRuleSweepRow;
  return (row[key] as StandingRuleStatus) ?? "pending";
}

export function justificationForRule(
  row: ArticleStandingRuleSweepRow | null,
  code: StandingRuleCode,
): string | null {
  if (!row) return null;
  const key = `${code}_justification` as keyof ArticleStandingRuleSweepRow;
  return (row[key] as string | null) ?? null;
}

export type StandingRuleSummary = {
  pass: number;
  fail: number;
  na: number;
  pending: number;
  missingJustification: StandingRuleCode[];
  /** True iff every row is checked_pass / checked_fail / na with justification. */
  complete: boolean;
};

/**
 * Spec rule: a row marked N/A must carry a one-line justification. A row
 * marked checked_fail likewise — if you're going to call it a fail, say why.
 * pending counts against complete.
 */
export function summariseStandingRules(
  row: ArticleStandingRuleSweepRow | null,
): StandingRuleSummary {
  let pass = 0,
    fail = 0,
    na = 0,
    pending = 0;
  const missingJustification: StandingRuleCode[] = [];

  for (const def of STANDING_RULES) {
    const st = statusForRule(row, def.code);
    const j = justificationForRule(row, def.code);
    if (st === "checked_pass") pass += 1;
    else if (st === "checked_fail") {
      fail += 1;
      if (!j || j.trim().length === 0) missingJustification.push(def.code);
    } else if (st === "na") {
      na += 1;
      if (!j || j.trim().length === 0) missingJustification.push(def.code);
    } else pending += 1;
  }

  return {
    pass,
    fail,
    na,
    pending,
    missingJustification,
    complete: pending === 0 && missingJustification.length === 0,
  };
}
