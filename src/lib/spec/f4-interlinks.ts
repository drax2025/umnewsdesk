/**
 * F4 Interlink constants & types, lifted from spec v3.0:
 *
 *   - F4   Interlink operational sequence (candidates → resolution → placement → recency)
 *   - B4   Reader-first placement test (3 questions, max 3 internal, zero is valid)
 *   - C7   Link integrity gate (banned domains, internal cap 0-3, outbound 3-5)
 *   - E4   Internal-link recency decay (prefer ≤ 90 days)
 *
 * Single source of truth for the F4 page + components + server actions.
 * Stays aligned with the SQL columns in 0019_article_interlinks_f4.sql.
 */

/* -------------------------------------------------------------------------- */
/*  Link kinds                                                                */
/* -------------------------------------------------------------------------- */

export type LinkKind = "internal" | "outbound";

export const LINK_KINDS: {
  value: LinkKind;
  label: string;
  hint: string;
}[] = [
  {
    value: "internal",
    label: "Internal",
    hint: "Pointer to another Union Media article. Max 3. Zero is valid (B4).",
  },
  {
    value: "outbound",
    label: "Outbound",
    hint: "Named institution, funder, regulator, primary source. Range 3-5 (B4).",
  },
];

/* -------------------------------------------------------------------------- */
/*  Resolution                                                                */
/* -------------------------------------------------------------------------- */

export type LinkResolution = "unchecked" | "ok" | "redirect" | "failed";

export const RESOLUTION: {
  value: LinkResolution;
  label: string;
  short: string;
  tone: "muted" | "success" | "warn" | "destructive";
}[] = [
  { value: "unchecked", label: "Unchecked",  short: "—",         tone: "muted"       },
  { value: "ok",        label: "Resolves",   short: "200",       tone: "success"     },
  { value: "redirect",  label: "Redirect",   short: "3xx",       tone: "warn"        },
  { value: "failed",    label: "Failed",     short: "4xx / 5xx", tone: "destructive" },
];

/* -------------------------------------------------------------------------- */
/*  Decision                                                                  */
/* -------------------------------------------------------------------------- */

export type LinkDecision = "candidate" | "placed" | "rejected";

export const DECISIONS: {
  value: LinkDecision;
  label: string;
  short: string;
  tone: "muted" | "success" | "destructive";
}[] = [
  { value: "candidate", label: "Candidate", short: "Candidate", tone: "muted"       },
  { value: "placed",    label: "Placed",    short: "Placed",    tone: "success"     },
  { value: "rejected",  label: "Rejected",  short: "Rejected",  tone: "destructive" },
];

/* -------------------------------------------------------------------------- */
/*  C7 banned domains — never link out to these                               */
/* -------------------------------------------------------------------------- */

/** Per C7: no link may point to digit.fyi, futurescot.com or scottishfinancialnews.com. */
export const BANNED_DOMAINS = [
  "digit.fyi",
  "futurescot.com",
  "scottishfinancialnews.com",
] as const;

/** Returns true if the URL's hostname matches a C7 banned outlet. */
export function isBannedDomainUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return BANNED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  B4 three-question placement test (internal only)                          */
/* -------------------------------------------------------------------------- */

export type B4Question = {
  key: "b4_q1_useful_context" | "b4_q2_topically_related" | "b4_q3_anchor_descriptive";
  number: 1 | 2 | 3;
  prompt: string;
  rationale: string;
};

export const B4_QUESTIONS: B4Question[] = [
  {
    key: "b4_q1_useful_context",
    number: 1,
    prompt:
      "Does this link give the reader genuinely useful additional context they are likely to want?",
    rationale:
      "Internal links exist to serve the reader's understanding, not to drive PV — useful-or-nothing.",
  },
  {
    key: "b4_q2_topically_related",
    number: 2,
    prompt:
      "Is the linked article topically and substantively related, not merely tag-overlapping?",
    rationale:
      "Tag overlap alone is not relatedness. Substance must connect.",
  },
  {
    key: "b4_q3_anchor_descriptive",
    number: 3,
    prompt:
      "Does the anchor text describe what the reader will find, in natural prose?",
    rationale:
      "Anchors must read as natural prose — not “click here”, not the headline jammed in.",
  },
];

/** Returns true if every B4 question is answered YES. */
export function passesB4(row: {
  b4_q1_useful_context: boolean | null;
  b4_q2_topically_related: boolean | null;
  b4_q3_anchor_descriptive: boolean | null;
}): boolean {
  return (
    row.b4_q1_useful_context === true &&
    row.b4_q2_topically_related === true &&
    row.b4_q3_anchor_descriptive === true
  );
}

/** Returns true if any B4 question is answered NO. */
export function failsB4(row: {
  b4_q1_useful_context: boolean | null;
  b4_q2_topically_related: boolean | null;
  b4_q3_anchor_descriptive: boolean | null;
}): boolean {
  return (
    row.b4_q1_useful_context === false ||
    row.b4_q2_topically_related === false ||
    row.b4_q3_anchor_descriptive === false
  );
}

/* -------------------------------------------------------------------------- */
/*  C7 + E4 caps and thresholds                                               */
/* -------------------------------------------------------------------------- */

/** Hard ceiling on internal links per article (B4 standing rule). */
export const MAX_INTERNAL_LINKS = 3;

/** Outbound link range — 3 minimum, 5 maximum (B4). */
export const MIN_OUTBOUND_LINKS = 3;
export const MAX_OUTBOUND_LINKS = 5;

/** Internal-link recency window (E4): prefer ≤ 90 days. */
export const RECENCY_DAYS = 90;

/** Returns true if a target publication date sits within E4's recency window. */
export function isRecent(targetPublishedAt: string | null): boolean {
  if (!targetPublishedAt) return false;
  const ms = Date.parse(targetPublishedAt);
  if (!Number.isFinite(ms)) return false;
  const ageDays = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  return ageDays <= RECENCY_DAYS;
}

/* -------------------------------------------------------------------------- */
/*  F4 verdict                                                                */
/* -------------------------------------------------------------------------- */

export type F4Verdict = "hand_to_f5" | "hand_back_to_f3" | "escalate";

export const F4_VERDICTS: {
  value: F4Verdict;
  label: string;
  hint: string;
  tone: "success" | "warn" | "destructive";
}[] = [
  {
    value: "hand_to_f5",
    label: "HAND TO F5",
    hint: "Internal 0-3 inclusive, outbound 3-5, all placed links resolve, no banned domains. Proceed to Editor.",
    tone: "success",
  },
  {
    value: "hand_back_to_f3",
    label: "HAND BACK TO F3",
    hint: "Body needs rework — no candidate fits the article, or natural-prose anchor not possible. Writer revises.",
    tone: "warn",
  },
  {
    value: "escalate",
    label: "ESCALATE",
    hint: "Interlinker cannot resolve — Admin [ESC] channel.",
    tone: "destructive",
  },
];

/* -------------------------------------------------------------------------- */
/*  Row types (mirror SQL columns 1:1)                                        */
/* -------------------------------------------------------------------------- */

export type ArticleInterlinkRow = {
  id: string;
  article_id: string;
  kind: LinkKind;
  target_url: string;
  target_article_id: string | null;
  target_title: string | null;
  target_published_at: string | null;
  anchor_text: string | null;
  placement_paragraph: number | null;
  order_idx: number;
  resolution_status: LinkResolution;
  http_status: number | null;
  resolution_checked_at: string | null;
  is_banned_domain: boolean;
  b4_q1_useful_context: boolean | null;
  b4_q2_topically_related: boolean | null;
  b4_q3_anchor_descriptive: boolean | null;
  decision: LinkDecision;
  decision_reason: string | null;
  notes: string | null;
  created_at: string;
};

export type ArticleInterlinkerRow = {
  article_id: string;
  verdict: F4Verdict | null;
  verdict_at: string | null;
  verdict_rationale: string | null;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Roll-up summary used by the verdict panel                                 */
/* -------------------------------------------------------------------------- */

export type InterlinkSummary = {
  internalPlaced: number;
  outboundPlaced: number;
  internalCandidates: number;
  outboundCandidates: number;
  rejected: number;
  brokenLinks: number;     // placed but resolution !== 'ok' (or redirect)
  bannedHits: number;      // any row with is_banned_domain (candidate or placed)
  /** True iff article is ready to HAND TO F5 per C7. */
  ready: boolean;
  /** Human-readable reason for not-ready. */
  blockers: string[];
};

export function summariseInterlinks(
  rows: ArticleInterlinkRow[],
): InterlinkSummary {
  const placed = rows.filter((r) => r.decision === "placed");
  const internalPlaced = placed.filter((r) => r.kind === "internal").length;
  const outboundPlaced = placed.filter((r) => r.kind === "outbound").length;
  const internalCandidates = rows.filter(
    (r) => r.kind === "internal" && r.decision === "candidate",
  ).length;
  const outboundCandidates = rows.filter(
    (r) => r.kind === "outbound" && r.decision === "candidate",
  ).length;
  const rejected = rows.filter((r) => r.decision === "rejected").length;
  const brokenLinks = placed.filter(
    (r) => r.resolution_status !== "ok" && r.resolution_status !== "redirect",
  ).length;
  const bannedHits = rows.filter((r) => r.is_banned_domain).length;

  const blockers: string[] = [];
  if (internalPlaced > MAX_INTERNAL_LINKS) {
    blockers.push(
      `${internalPlaced} internal links placed — cap is ${MAX_INTERNAL_LINKS} (B4).`,
    );
  }
  if (outboundPlaced < MIN_OUTBOUND_LINKS) {
    blockers.push(
      `${outboundPlaced}/${MIN_OUTBOUND_LINKS}-${MAX_OUTBOUND_LINKS} outbound links — below floor (B4).`,
    );
  }
  if (outboundPlaced > MAX_OUTBOUND_LINKS) {
    blockers.push(
      `${outboundPlaced} outbound links — ceiling is ${MAX_OUTBOUND_LINKS} (B4).`,
    );
  }
  if (brokenLinks > 0) {
    blockers.push(
      `${brokenLinks} placed link${brokenLinks === 1 ? "" : "s"} fail${brokenLinks === 1 ? "s" : ""} URL resolution (C7).`,
    );
  }
  const placedBanned = placed.filter((r) => r.is_banned_domain).length;
  if (placedBanned > 0) {
    blockers.push(
      `${placedBanned} placed link${placedBanned === 1 ? "" : "s"} on banned domain — DIGIT / Futurescot / SFN (C7).`,
    );
  }

  return {
    internalPlaced,
    outboundPlaced,
    internalCandidates,
    outboundCandidates,
    rejected,
    brokenLinks,
    bannedHits,
    ready: blockers.length === 0,
    blockers,
  };
}
