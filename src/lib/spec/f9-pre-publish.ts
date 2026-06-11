/**
 * F9 Pre-Publish Pack constants & types — lifted from spec v3.0 section F9 +
 * A1-A10 active-check matrix + D-Steps Reasonable Steps doctrine + the
 * Senior Editor [PUB] channel.
 *
 * Single source of truth for the F9 page + components + server actions.
 * Mirrors the SQL columns in 0020_article_pre_publish_f9.sql exactly.
 *
 * Per spec line 1155, the canonical Pre-Publish glyph palette is:
 *
 *   ✅ PASS   ⚠️ SOFT-FAIL   ❌ FAIL   N/A
 *
 * Per spec line 107, A10 explicitly demands a *positive trace* on every
 * numeric / quantitative claim — not just an absence of red flags.
 */
import type { F6Verdict } from "@/lib/spec/f6-review";

/* -------------------------------------------------------------------------- */
/*  A-check status                                                            */
/* -------------------------------------------------------------------------- */

export type ACheckStatus = "pending" | "pass" | "soft_fail" | "fail" | "na";

export const A_CHECK_STATUS: {
  value: ACheckStatus;
  label: string;
  short: string;
  glyph: string;
  tone: "muted" | "success" | "warn" | "destructive";
}[] = [
  { value: "pending",   label: "Pending",   short: "—",     glyph: "—",   tone: "muted"       },
  { value: "pass",      label: "Pass",      short: "PASS",  glyph: "✅", tone: "success"     },
  { value: "soft_fail", label: "Soft-fail", short: "SOFT",  glyph: "⚠️", tone: "warn"        },
  { value: "fail",      label: "Fail",      short: "FAIL",  glyph: "❌", tone: "destructive" },
  { value: "na",        label: "N/A",       short: "N/A",   glyph: "—",  tone: "muted"       },
];

/* -------------------------------------------------------------------------- */
/*  A-check definitions                                                       */
/* -------------------------------------------------------------------------- */

export type ACheckKind = "hard" | "soft";

export type RootCauseAgent = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F9";

export type ACheckCode =
  | "A1" | "A2" | "A3" | "A4" | "A5"
  | "A6" | "A7" | "A8" | "A9" | "A10";

export type ACheckDef = {
  code: ACheckCode;
  kind: ACheckKind;
  label: string;
  spec: string;
  method: string;
  /** Default agent the failure returns to when this check fails. */
  rootCause: RootCauseAgent;
};

export const A_CHECKS: ACheckDef[] = [
  {
    code: "A1",
    kind: "hard",
    label: "Reasonable steps log",
    spec: "D-Steps · S4 defence",
    method:
      "Confirm the D-Steps log captures the steps taken (or N/A for Tier 1). Tier 2: the reply attempt + outcome must be on file; absent reply justified per spec.",
    rootCause: "F2",
  },
  {
    code: "A2",
    kind: "hard",
    label: "Primary source reverify",
    spec: "C2 · B3",
    method:
      "Re-open every primary source URL listed in the NFP footer. Confirm each still resolves and still supports the verbatim claim it underwrites.",
    rootCause: "F2",
  },
  {
    code: "A3",
    kind: "hard",
    label: "Public domain reverify (PDT)",
    spec: "B3 · Public Domain Threshold",
    method:
      "Reverify 3+ independent sources for non-primary claims. Record the actual count — anything below 3 is FAIL unless single primary trace covers the claim.",
    rootCause: "F2",
  },
  {
    code: "A4",
    kind: "hard",
    label: "Verbatim quote sampling",
    spec: "B1 · C1",
    method:
      "Sample-check N quotes vs the F2 ledger after Unicode normalisation. Mismatch on any sampled quote is hard FAIL.",
    rootCause: "F3",
  },
  {
    code: "A5",
    kind: "hard",
    label: "Paragraph structure preservation",
    spec: "C3",
    method:
      "Confirm multi-paragraph source quotes still preserve the source's break structure post-edit. Editor or writer must not have reflowed.",
    rootCause: "F3",
  },
  {
    code: "A6",
    kind: "hard",
    label: "Date / backdate consistency",
    spec: "C5 · B5",
    method:
      "Cross-check the chosen backdate against the primary source's event date and the F5 editor stamp. A6 mirrors the F5 backdate selection.",
    rootCause: "F5",
  },
  {
    code: "A7",
    kind: "soft",
    label: "Interlink resolution",
    spec: "C7",
    method:
      "Re-resolve every placed internal + outbound link. Counts mirrored from article_interlinks. Broken/banned hits soft-fail or return to F4 depending on count.",
    rootCause: "F4",
  },
  {
    code: "A8",
    kind: "hard",
    label: "Headline + framing alignment",
    spec: "B6 · F1 framing brief",
    method:
      "Headline ≤ 90 chars and faithful to the F1 framing brief. Drift away from the agreed frame fails A8 and returns to F1.",
    rootCause: "F1",
  },
  {
    code: "A9",
    kind: "soft",
    label: "NFP footer completeness",
    spec: "B7 · C9",
    method:
      "Footer carries: primary URL, independent confirmations, dependency note, audit result, backdate, link inventory, word count, video script, Triage outcome, Production Option, framing brief, defamation tier, M3 outcome (T2 only).",
    rootCause: "F5",
  },
  {
    code: "A10",
    kind: "hard",
    label: "Standing-rule sweep + numeric-claim positive trace",
    spec: "B2 · spec line 107",
    method:
      "B1–B7 each CHECKED-PASS or N/A-with-justification. Every numeric / quantitative claim has a positive trace to the source (not just absence of red flags).",
    rootCause: "F5",
  },
];

export const HARD_CHECKS = A_CHECKS.filter((c) => c.kind === "hard");
export const SOFT_CHECKS = A_CHECKS.filter((c) => c.kind === "soft");

export const A_CHECK_CODES: readonly ACheckCode[] = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
  "A10",
] as const;

export const ROOT_CAUSE_AGENTS: readonly RootCauseAgent[] = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F9",
] as const;

/* -------------------------------------------------------------------------- */
/*  F9 verdict                                                                */
/* -------------------------------------------------------------------------- */

export type F9Verdict =
  | "hand_to_senior_editor"
  | "return_to_f1"
  | "return_to_f2"
  | "return_to_f3"
  | "return_to_f4"
  | "return_to_f5"
  | "return_to_f6";

export const F9_VERDICTS: {
  value: F9Verdict;
  label: string;
  hint: string;
  tone: "success" | "warn" | "destructive";
}[] = [
  {
    value: "hand_to_senior_editor",
    label: "Hand to Senior Editor",
    hint: "All A-checks PASS / SOFT-FAIL / N/A. Pack assembles and posts to [PUB].",
    tone: "success",
  },
  {
    value: "return_to_f1",
    label: "Return to F1 Triage",
    hint: "A8 headline / framing drift. F1 reframes brief.",
    tone: "warn",
  },
  {
    value: "return_to_f2",
    label: "Return to F2 Researcher",
    hint: "A1 / A2 / A3 source-side failure. Researcher patches source pack.",
    tone: "warn",
  },
  {
    value: "return_to_f3",
    label: "Return to F3 Writer",
    hint: "A4 / A5 writer-side failure. Writer fixes quote / paragraph drift.",
    tone: "warn",
  },
  {
    value: "return_to_f4",
    label: "Return to F4 Interlinker",
    hint: "A7 interlink failure. Interlinker fixes link pack.",
    tone: "warn",
  },
  {
    value: "return_to_f5",
    label: "Return to F5 Editor",
    hint: "A6 / A9 / A10 editor-side failure. Editor patches footer / backdate / standing rules.",
    tone: "warn",
  },
  {
    value: "return_to_f6",
    label: "Return to F6 Reviewer",
    hint: "F6 gate audit looks incomplete. Reviewer redoes the relevant H-gate.",
    tone: "destructive",
  },
];

/** Map an A-check code to its default verdict if it fails. */
export function defaultVerdictForFailure(code: ACheckCode): F9Verdict {
  const def = A_CHECKS.find((c) => c.code === code);
  if (!def) return "return_to_f6";
  switch (def.rootCause) {
    case "F1": return "return_to_f1";
    case "F2": return "return_to_f2";
    case "F3": return "return_to_f3";
    case "F4": return "return_to_f4";
    case "F5": return "return_to_f5";
    case "F6": return "return_to_f6";
    case "F9": return "return_to_f6"; // F9-internal fall back to F6 review
  }
}

/* -------------------------------------------------------------------------- */
/*  [PUB] Senior Editor verdict                                               */
/* -------------------------------------------------------------------------- */

export type PubVerdict = "pending" | "approve" | "modify" | "reject";

export const PUB_VERDICTS: {
  value: PubVerdict;
  label: string;
  short: string;
  hint: string;
  tone: "muted" | "success" | "warn" | "destructive";
}[] = [
  {
    value: "pending",
    label: "Pending",
    short: "—",
    hint: "Senior Editor has not yet stamped.",
    tone: "muted",
  },
  {
    value: "approve",
    label: "APPROVE",
    short: "APPROVE",
    hint: "Article cleared for F8 publish.",
    tone: "success",
  },
  {
    value: "modify",
    label: "MODIFY",
    short: "MODIFY",
    hint: "Specific changes requested. Bounces to relevant F-agent with notes.",
    tone: "warn",
  },
  {
    value: "reject",
    label: "REJECT",
    short: "REJECT",
    hint: "Article will not publish. Logged and held.",
    tone: "destructive",
  },
];

/* -------------------------------------------------------------------------- */
/*  Pack — hard cap of 3 articles                                             */
/* -------------------------------------------------------------------------- */

export const PACK_HARD_CAP = 3;

/** Generate a pack ref of the form PPP-YYYY-MM-DD-NNN. */
export function formatPackRef(date: Date, seq: number): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const nnn = String(Math.max(1, Math.min(999, seq))).padStart(3, "0");
  return `PPP-${yyyy}-${mm}-${dd}-${nnn}`;
}

/* -------------------------------------------------------------------------- */
/*  Row types — mirror SQL 1:1                                                */
/* -------------------------------------------------------------------------- */

export type ArticlePrePublishRow = {
  article_id: string;

  a1_status: ACheckStatus;
  a1_detail: string | null;

  a2_status: ACheckStatus;
  a2_detail: string | null;

  a3_status: ACheckStatus;
  a3_detail: string | null;
  a3_independent_count: number | null;

  a4_status: ACheckStatus;
  a4_detail: string | null;
  a4_quotes_sampled: number | null;

  a5_status: ACheckStatus;
  a5_detail: string | null;

  a6_status: ACheckStatus;
  a6_detail: string | null;
  a6_backdate: string | null;

  a7_status: ACheckStatus;
  a7_detail: string | null;
  a7_internal_count: number | null;
  a7_outbound_count: number | null;

  a8_status: ACheckStatus;
  a8_detail: string | null;
  a8_headline_chars: number | null;

  a9_status: ACheckStatus;
  a9_detail: string | null;

  a10_status: ACheckStatus;
  a10_detail: string | null;

  pack_ref: string | null;
  origin_sweep_id: string | null;
  pack_archive_path: string | null;

  verdict: F9Verdict | null;
  verdict_at: string | null;
  verdict_by: string | null;
  verdict_rationale: string | null;

  pub_verdict: PubVerdict;
  pub_verdict_at: string | null;
  pub_verdict_by: string | null;
  pub_verdict_notes: string | null;

  updated_at: string;
};

export type PrePublishFailureRow = {
  id: string;
  article_id: string;
  check_code: ACheckCode;
  status: Exclude<ACheckStatus, "pending" | "pass" | "na">;
  root_cause_agent: RootCauseAgent | null;
  description: string;
  remediation: string | null;
  override_applied: boolean;
  override_reason: string | null;
  created_at: string;
  created_by: string | null;
};

export type PrePublishPackRow = {
  pack_ref: string;
  article_1_id: string | null;
  article_2_id: string | null;
  article_3_id: string | null;
  origin_sweep_id: string | null;
  archive_path: string | null;
  rendered_at: string | null;
  rendered_by: string | null;
  pub_channel_posted_at: string | null;
  pub_verdict: PubVerdict;
  pub_verdict_at: string | null;
  pub_verdict_by: string | null;
  pub_verdict_notes: string | null;
  created_at: string;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function statusFromRow(
  row: ArticlePrePublishRow | null,
  code: ACheckCode,
): ACheckStatus {
  if (!row) return "pending";
  const key = `${code.toLowerCase()}_status` as keyof ArticlePrePublishRow;
  return (row[key] as ACheckStatus) ?? "pending";
}

export function detailFromRow(
  row: ArticlePrePublishRow | null,
  code: ACheckCode,
): string | null {
  if (!row) return null;
  const key = `${code.toLowerCase()}_detail` as keyof ArticlePrePublishRow;
  return (row[key] as string | null) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Roll-up summary                                                           */
/* -------------------------------------------------------------------------- */

export type PrePublishSummary = {
  pass: number;
  soft: number;
  fail: number;
  na: number;
  pending: number;
  hardFails: number;
  softFails: number;
  /** True iff there are zero hard fails and zero pending checks. */
  ready: boolean;
  /** Human-readable blocker list explaining why ready is false. */
  blockers: string[];
};

export function summarisePrePublish(
  row: ArticlePrePublishRow | null,
): PrePublishSummary {
  const counts = {
    pass: 0,
    soft: 0,
    fail: 0,
    na: 0,
    pending: 0,
    hardFails: 0,
    softFails: 0,
  };
  const blockers: string[] = [];
  for (const code of A_CHECK_CODES) {
    const st = statusFromRow(row, code);
    if (st === "pass") counts.pass += 1;
    else if (st === "soft_fail") {
      counts.soft += 1;
      counts.softFails += 1;
    } else if (st === "fail") {
      counts.fail += 1;
      const def = A_CHECKS.find((c) => c.code === code);
      if (def?.kind === "hard") {
        counts.hardFails += 1;
        blockers.push(`${code} — ${def.label} is a hard FAIL.`);
      } else {
        blockers.push(`${code} — ${def?.label ?? code} is a FAIL.`);
      }
    } else if (st === "na") counts.na += 1;
    else {
      counts.pending += 1;
      const def = A_CHECKS.find((c) => c.code === code);
      blockers.push(`${code} — ${def?.label ?? code} is still pending.`);
    }
  }
  return {
    ...counts,
    ready: counts.hardFails === 0 && counts.pending === 0,
    blockers,
  };
}

/* -------------------------------------------------------------------------- */
/*  Misc bridge to F6 (kept here so spec module is self-contained for callers)*/
/* -------------------------------------------------------------------------- */

/** Re-export the F6 verdict type for code paths that want a single import. */
export type { F6Verdict };
