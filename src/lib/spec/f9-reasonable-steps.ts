/**
 * F9 Pack section 8 — Reasonable-steps log.
 *
 * D-Steps doctrine. Required for every Tier 2 article that proceeds to
 * production. Tier 1 is not applicable (no defamation risk to log against).
 * Tier 3 is rejected upstream — F1 disqualifies before this surface is reached.
 *
 * Mirrors article_reasonable_steps in migration 0022.
 */

export type DefamationDefence =
  | "truth"
  | "honest_opinion"
  | "public_interest"
  | "privilege"
  | "reportage";

export const DEFENCES: {
  value: DefamationDefence;
  label: string;
  short: string;
  act_ref: string;
  hint: string;
}[] = [
  {
    value: "truth",
    label: "Truth",
    short: "TRUTH",
    act_ref: "Defamation Act 2013 s.2",
    hint: "The statement complained of is substantially true. Strongest defence — requires evidence on file.",
  },
  {
    value: "honest_opinion",
    label: "Honest opinion",
    short: "OPINION",
    act_ref: "Defamation Act 2013 s.3",
    hint: "Statement is opinion, indicates the basis, and an honest person could hold it on the facts.",
  },
  {
    value: "public_interest",
    label: "Publication on a matter of public interest",
    short: "PUBLIC INTEREST",
    act_ref: "Defamation Act 2013 s.4",
    hint: "Publishing was in the public interest and the publisher reasonably believed so. Requires reasonable-steps log.",
  },
  {
    value: "privilege",
    label: "Privilege",
    short: "PRIVILEGE",
    act_ref: "Defamation Act 2013 s.6 / s.7",
    hint: "Peer-reviewed statement (s.6) or report of a court / parliamentary / official proceeding (s.7).",
  },
  {
    value: "reportage",
    label: "Reportage",
    short: "REPORTAGE",
    act_ref: "Common law doctrine",
    hint: "Neutral and accurate reporting of a dispute, where the reporting itself (not the truth) is in the public interest.",
  },
];

export type ArticleReasonableStepsRow = {
  article_id: string;
  subjects_named: string | null;
  public_record_response_url: string | null;
  public_record_response_date: string | null;
  defence: DefamationDefence | null;
  defence_justification: string | null;
  tier_classifier_id: string | null;
  tier_classifier_name: string | null;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export type ReasonableStepsSummary = {
  /** Status against the article's defamation tier. */
  status: "not_applicable" | "incomplete" | "complete";
  /** Field codes still missing (only meaningful when status === "incomplete"). */
  missing: ReasonableStepsField[];
};

export type ReasonableStepsField =
  | "subjects_named"
  | "public_record_response_url"
  | "public_record_response_date"
  | "defence"
  | "defence_justification"
  | "tier_classifier_name";

export const REASONABLE_STEPS_FIELD_LABELS: Record<ReasonableStepsField, string> =
  {
    subjects_named: "Subjects named",
    public_record_response_url: "Right-of-reply URL",
    public_record_response_date: "Right-of-reply date",
    defence: "Act defence selected",
    defence_justification: "Defence justification",
    tier_classifier_name: "Tier classifier (on record)",
  };

/**
 * Spec rule:
 *   Tier 1 → not_applicable (no defamation framework required).
 *   Tier 2 → all six fields required.
 *   Tier 3 → not_applicable (article should have been disqualified upstream).
 */
export function summariseReasonableSteps(
  row: ArticleReasonableStepsRow | null,
  tier: 1 | 2 | 3 | null,
): ReasonableStepsSummary {
  if (tier !== 2) {
    return { status: "not_applicable", missing: [] };
  }

  const missing: ReasonableStepsField[] = [];

  if (!row?.subjects_named?.trim()) missing.push("subjects_named");
  if (!row?.public_record_response_url?.trim())
    missing.push("public_record_response_url");
  if (!row?.public_record_response_date)
    missing.push("public_record_response_date");
  if (!row?.defence) missing.push("defence");
  if (!row?.defence_justification?.trim())
    missing.push("defence_justification");
  if (!row?.tier_classifier_name?.trim())
    missing.push("tier_classifier_name");

  return {
    status: missing.length === 0 ? "complete" : "incomplete",
    missing,
  };
}

export function defenceLabel(value: DefamationDefence | null): string {
  if (!value) return "—";
  return DEFENCES.find((d) => d.value === value)?.label ?? value;
}

export function defenceActRef(value: DefamationDefence | null): string {
  if (!value) return "";
  return DEFENCES.find((d) => d.value === value)?.act_ref ?? "";
}
