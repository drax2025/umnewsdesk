/**
 * F6 Reviewer constants & types — lifted from spec v3.0 section F6 + C1-C9 +
 * D-Checklist. Single source of truth for the review page, gate rows,
 * H11 checklist, and verdict panel.
 */

/* -------------------------------------------------------------------------- */
/*  Gate status                                                               */
/* -------------------------------------------------------------------------- */

export type HGateStatus = "pending" | "pass" | "soft_fail" | "fail" | "na";

export const GATE_STATUS: {
  value: HGateStatus;
  label: string;
  short: string;
  tone: "muted" | "success" | "warn" | "destructive";
}[] = [
  { value: "pending",   label: "Pending",    short: "—",        tone: "muted"       },
  { value: "pass",      label: "Pass",       short: "PASS",     tone: "success"     },
  { value: "soft_fail", label: "Soft-fail",  short: "SOFT",     tone: "warn"        },
  { value: "fail",      label: "Fail",       short: "FAIL",     tone: "destructive" },
  { value: "na",        label: "N/A",        short: "N/A",      tone: "muted"       },
];

/* -------------------------------------------------------------------------- */
/*  Gate definitions                                                          */
/* -------------------------------------------------------------------------- */

export type GateKind = "hard" | "soft";

export type GateDef = {
  code: "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7" | "H8" | "H9" | "H10" | "H11";
  kind: GateKind;
  label: string;
  spec: string;               // Spec section reference (C1, C2, …)
  method: string;             // What the reviewer is verifying
  returns_to: "F1" | "F2" | "F3" | "F4" | "F5";
};

export const GATES: GateDef[] = [
  {
    code: "H1",
    kind: "hard",
    label: "Verbatim quote audit",
    spec: "C1",
    method:
      "Unicode-normalise (curly→straight quotes, U+2010-2015→ASCII hyphen, NBSP→space, whitespace collapsed). Substring-match each quoted paragraph against the normalised source. MISMATCH stops publication.",
    returns_to: "F2",
  },
  {
    code: "H2",
    kind: "hard",
    label: "Source independence + PDT",
    spec: "C2",
    method:
      "At least one non-DIGIT/non-Futurescot/non-SFN primary source exists. Public Domain Threshold met (3+ independent sources) OR primary source traced. Tier 2 controversial: two independent confirmations required.",
    returns_to: "F2",
  },
  {
    code: "H3",
    kind: "hard",
    label: "Paragraph-break preservation",
    spec: "C3",
    method:
      "Every multi-paragraph source quote preserves the source's paragraph structure in the published version. Not the writer's preferred flow — the source's.",
    returns_to: "F3",
  },
  {
    code: "H4",
    kind: "hard",
    label: "Author-register preservation",
    spec: "C4",
    method:
      "First-person sources (LinkedIn, blog, X thread): preserve the author's exact spelling, capitalisation, number style. Do NOT apply house style to verbatim quotes from first-person material.",
    returns_to: "F3",
  },
  {
    code: "H5",
    kind: "hard",
    label: "Date reconciliation",
    spec: "C5",
    method:
      "Cross-check the article's stated event date against the verified primary source. Reconcile to the primary.",
    returns_to: "F3",
  },
  {
    code: "H6",
    kind: "soft",
    label: "Word count",
    spec: "C6",
    method:
      "Strip markdown + editor notes, count words, confirm 500-750. Over: tighten ecosystem-context paragraphs only.",
    returns_to: "F3",
  },
  {
    code: "H7",
    kind: "soft",
    label: "Link integrity",
    spec: "C7",
    method:
      "Internal link count 0-3 inclusive. Every internal link resolves; anchor text describes target. All outbound links resolve and point to official institutional URLs (not press-release republishers). NO link points to digit.fyi, futurescot.com, or scottishfinancialnews.com.",
    returns_to: "F4",
  },
  {
    code: "H8",
    kind: "soft",
    label: "Headline character count",
    spec: "C8",
    method:
      "Confirm headline ≤ 90 characters (Google SERP truncation threshold).",
    returns_to: "F5",
  },
  {
    code: "H9",
    kind: "soft",
    label: "NFP footer presence + completeness",
    spec: "C9",
    method:
      "Editor-notes footer exists and contains: primary source URL, independent confirmation URLs, dependency note, audit result, backdate, link inventory, word count, video script, Triage scorecard outcome, Production Option, framing brief (geo + tags + frame + anchor + brief), defamation tier, M3 outcome (Tier 2 only).",
    returns_to: "F5",
  },
  {
    code: "H10",
    kind: "hard",
    label: "Standing-rule compliance",
    spec: "B2 / B6.1",
    method:
      "Headline within B6.1 hard limits (no all-caps, no clickbait that misrepresents the article). Standing-rules sweep: B1 verbatim, B2 signal-only, B3 multi-source, B4 interlinking, B5 backdating, B6 headline, B7 footer — each CHECKED-PASS / N/A-with-justification.",
    returns_to: "F5",
  },
  {
    code: "H11",
    kind: "hard",
    label: "Defamation triage (T2 only)",
    spec: "D-Checklist",
    method:
      "Tier 2 articles only — auto-N/A on Tier 1/3. Ten-question D-Checklist must be answered in the NFP footer. NO to Q3-Q9 or YES to Q10 fails H11 and routes back to F1 (typically to Reject Queue).",
    returns_to: "F1",
  },
];

export const HARD_GATES = GATES.filter((g) => g.kind === "hard");
export const SOFT_GATES = GATES.filter((g) => g.kind === "soft");

/* -------------------------------------------------------------------------- */
/*  H11 D-Checklist                                                           */
/* -------------------------------------------------------------------------- */

export type H11Question = {
  key:
    | "h11_q1_identifies_subject"
    | "h11_q2_factual_claim"
    | "h11_q3_claim_provable"
    | "h11_q4_comment_basis_stated"
    | "h11_q5_inference_framed"
    | "h11_q6_response_cited"
    | "h11_q7_defence_identified"
    | "h11_q8_third_parties_considered"
    | "h11_q9_distinguished_categories"
    | "h11_q10_unsupported_sentence";
  num: number;
  text: string;
  passOn: "yes" | "no" | "any"; // What answer is required for PASS
};

export const H11_QUESTIONS: H11Question[] = [
  {
    key: "h11_q1_identifies_subject",
    num: 1,
    text: "Does this article identify a specific person or company?",
    passOn: "any",
  },
  {
    key: "h11_q2_factual_claim",
    num: 2,
    text: "Does it make a factual claim that could damage their reputation in the eyes of right-thinking members of society?",
    passOn: "any",
  },
  {
    key: "h11_q3_claim_provable",
    num: 3,
    text: "Is the factual claim true and provable from independent sources?",
    passOn: "yes",
  },
  {
    key: "h11_q4_comment_basis_stated",
    num: 4,
    text: "If the claim is comment rather than fact, is the underlying fact stated and is the comment honestly held?",
    passOn: "yes",
  },
  {
    key: "h11_q5_inference_framed",
    num: 5,
    text: "If the claim is inference, is the factual basis stated and is the inference framed as inference rather than fact?",
    passOn: "yes",
  },
  {
    key: "h11_q6_response_cited",
    num: 6,
    text: "Is the subject's public-record response cited in the article?",
    passOn: "yes",
  },
  {
    key: "h11_q7_defence_identified",
    num: 7,
    text: "Which Defamation Act 2013 defence applies: truth (S2), honest opinion (S3), public interest (S4), privilege (S6-7), or reportage doctrine?",
    passOn: "yes",
  },
  {
    key: "h11_q8_third_parties_considered",
    num: 8,
    text: "Are there third parties whose reputation may be affected by association? If so, has their position been considered?",
    passOn: "yes",
  },
  {
    key: "h11_q9_distinguished_categories",
    num: 9,
    text: "Does the article distinguish clearly between what is established fact, what is reported claim, and what is editorial comment?",
    passOn: "yes",
  },
  {
    key: "h11_q10_unsupported_sentence",
    num: 10,
    text: "Would a hostile reader of this article be able to identify a specific sentence that is unsupported by evidence?",
    passOn: "no",
  },
];

export const H11_DEFENCES = [
  "Truth (S2)",
  "Honest opinion (S3)",
  "Public interest (S4)",
  "Privilege (S6-7)",
  "Reportage doctrine",
] as const;

export type H11Defence = (typeof H11_DEFENCES)[number];

/**
 * Compute H11 pass/fail from the 10 booleans + tier. Tier 1 = N/A.
 * Returns "pass", "fail", "na", or "pending" (any unanswered question).
 */
export function computeH11Status(
  defamationTier: 1 | 2 | 3 | null,
  answers: Partial<Record<H11Question["key"], boolean | null>>,
): HGateStatus {
  if (defamationTier === 1) return "na";
  if (defamationTier === 3) {
    // Tier 3 routes to reject queue — Reviewer doesn't H11 it.
    return "na";
  }
  for (const q of H11_QUESTIONS) {
    const v = answers[q.key];
    if (v === null || v === undefined) return "pending";
    if (q.passOn === "yes" && v !== true) return "fail";
    if (q.passOn === "no" && v !== false) return "fail";
  }
  return "pass";
}

/* -------------------------------------------------------------------------- */
/*  Verdict                                                                   */
/* -------------------------------------------------------------------------- */

export type F6Verdict =
  | "hand_to_f9"
  | "return_to_f1"
  | "return_to_f2"
  | "return_to_f3"
  | "return_to_f4"
  | "return_to_f5"
  | "escalate";

export const F6_VERDICTS: {
  value: F6Verdict;
  label: string;
  hint: string;
  tone: "success" | "warn" | "destructive";
}[] = [
  {
    value: "hand_to_f9",
    label: "Hand to F9 Pre-Publish",
    hint: "All hard gates PASS. Proceed to A1-A10 active checks + Senior Editor pack.",
    tone: "success",
  },
  {
    value: "return_to_f1",
    label: "Return to F1 Triage",
    hint: "Framing or tier classification failure. F1 reframes or DISQUALIFIES.",
    tone: "warn",
  },
  {
    value: "return_to_f2",
    label: "Return to F2 Researcher",
    hint: "Source / quote / date failure. Researcher fixes source pack.",
    tone: "warn",
  },
  {
    value: "return_to_f3",
    label: "Return to F3 Writer",
    hint: "Draft-level failure (paragraph structure, register, word count).",
    tone: "warn",
  },
  {
    value: "return_to_f4",
    label: "Return to F4 Interlinker",
    hint: "Link integrity failure. Interlinker fixes link pack.",
    tone: "warn",
  },
  {
    value: "return_to_f5",
    label: "Return to F5 Editor",
    hint: "Headline or standing-rule failure. Editor reworks headline / footer.",
    tone: "warn",
  },
  {
    value: "escalate",
    label: "Escalate [ESC]",
    hint: "Cannot resolve at F6. Routes to Senior Editor via [ESC] channel.",
    tone: "destructive",
  },
];

/* -------------------------------------------------------------------------- */
/*  Row type — mirrors SQL columns 1:1                                        */
/* -------------------------------------------------------------------------- */

export type ArticleReviewRow = {
  article_id: string;
  h1_status: HGateStatus;
  h1_detail: string | null;
  h2_status: HGateStatus;
  h2_detail: string | null;
  h3_status: HGateStatus;
  h3_detail: string | null;
  h4_status: HGateStatus;
  h4_detail: string | null;
  h5_status: HGateStatus;
  h5_detail: string | null;
  h6_status: HGateStatus;
  h6_detail: string | null;
  h6_word_count: number | null;
  h7_status: HGateStatus;
  h7_detail: string | null;
  h7_internal_link_count: number | null;
  h8_status: HGateStatus;
  h8_detail: string | null;
  h8_headline_chars: number | null;
  h9_status: HGateStatus;
  h9_detail: string | null;
  h10_status: HGateStatus;
  h10_detail: string | null;
  h11_status: HGateStatus;
  h11_detail: string | null;
  h11_q1_identifies_subject: boolean | null;
  h11_q2_factual_claim: boolean | null;
  h11_q3_claim_provable: boolean | null;
  h11_q4_comment_basis_stated: boolean | null;
  h11_q5_inference_framed: boolean | null;
  h11_q6_response_cited: boolean | null;
  h11_q7_defence_identified: boolean | null;
  h11_q8_third_parties_considered: boolean | null;
  h11_q9_distinguished_categories: boolean | null;
  h11_q10_unsupported_sentence: boolean | null;
  h11_defence: string | null;
  h11_response_url: string | null;
  verdict: F6Verdict | null;
  verdict_at: string | null;
  verdict_rationale: string | null;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Aggregate progress                                                        */
/* -------------------------------------------------------------------------- */

/** Compact gate codes for status iteration. */
export const GATE_CODES = [
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "H7",
  "H8",
  "H9",
  "H10",
  "H11",
] as const;

export type GateCode = (typeof GATE_CODES)[number];

export function gateStatusFromRow(
  row: ArticleReviewRow | null,
  code: GateCode,
): HGateStatus {
  if (!row) return "pending";
  const key = `${code.toLowerCase()}_status` as keyof ArticleReviewRow;
  return (row[key] as HGateStatus) ?? "pending";
}

/** Summary counts across all 11 gates. */
export function summariseReview(row: ArticleReviewRow | null): {
  pass: number;
  soft: number;
  fail: number;
  na: number;
  pending: number;
  hardFails: number;
  ready: boolean;
} {
  const out = { pass: 0, soft: 0, fail: 0, na: 0, pending: 0, hardFails: 0 };
  for (const code of GATE_CODES) {
    const st = gateStatusFromRow(row, code);
    if (st === "pass") out.pass += 1;
    else if (st === "soft_fail") out.soft += 1;
    else if (st === "fail") {
      out.fail += 1;
      const def = GATES.find((g) => g.code === code);
      if (def?.kind === "hard") out.hardFails += 1;
    } else if (st === "na") out.na += 1;
    else out.pending += 1;
  }
  return { ...out, ready: out.hardFails === 0 && out.pending === 0 };
}
