/**
 * Pack section 0 — Article Failure Log.
 *
 * Chronological cross-agent record. Sourced from F1 / F2 / F3 / F4 / F5 / F6 /
 * F7 / F8 via the shared `appendFailureEvent` action. Read by the pack
 * renderer BEFORE the article content sections (a clean log is itself a
 * positive disclosure — empty log == clean run, still mandatory).
 *
 * Mirrors article_failure_log in migrations 0022 + 0036.
 *
 * Naming note: the F9 stage was renumbered to F7 (Pre-Flight Check) and
 * F8 (Post-Publish → Publish) was relabelled in migration 0036. The
 * `failure_log_stage` enum kept its old `'F9'` value (Postgres cannot drop
 * enum values without a type recreate) but the spec no longer references it
 * — new rows always carry F1–F8.
 */

export type FailureLogStage =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8";

export const FAILURE_LOG_STAGES: {
  value: FailureLogStage;
  label: string;
  short: string;
}[] = [
  { value: "F1", label: "F1 — Triage", short: "F1" },
  { value: "F2", label: "F2 — Research", short: "F2" },
  { value: "F3", label: "F3 — Initial Draft", short: "F3" },
  { value: "F4", label: "F4 — Interlink", short: "F4" },
  { value: "F5", label: "F5 — Editor", short: "F5" },
  { value: "F6", label: "F6 — Final Review (H-gates)", short: "F6" },
  { value: "F7", label: "F7 — Pre-Flight Check (A-gates)", short: "F7" },
  { value: "F8", label: "F8 — Publish", short: "F8" },
];

export type FailureLogEvent =
  | "triage_reject"
  | "hard_gate_return"
  | "a_check_return"
  | "rework"
  | "standing_rule_check_late"
  | "figure_revised"
  | "quote_revised"
  | "source_added"
  | "source_removed"
  | "override_applied"
  | "other";

export const FAILURE_LOG_EVENTS: {
  value: FailureLogEvent;
  label: string;
  short: string;
  tone: "destructive" | "warn" | "muted" | "info";
}[] = [
  {
    value: "triage_reject",
    label: "Triage rejection (F1)",
    short: "TRIAGE-REJECT",
    tone: "destructive",
  },
  {
    value: "hard_gate_return",
    label: "F6 hard-gate return",
    short: "H-RETURN",
    tone: "destructive",
  },
  {
    value: "a_check_return",
    label: "F7 A-check return",
    short: "A-RETURN",
    tone: "destructive",
  },
  {
    value: "rework",
    label: "Rework (agent re-run)",
    short: "REWORK",
    tone: "warn",
  },
  {
    value: "standing_rule_check_late",
    label: "Standing rule checked late (post Stage 5)",
    short: "LATE-CHECK",
    tone: "warn",
  },
  {
    value: "figure_revised",
    label: "Numeric claim revised mid-pipeline",
    short: "FIG-CHG",
    tone: "warn",
  },
  {
    value: "quote_revised",
    label: "Quote revised after first draft",
    short: "QUOTE-CHG",
    tone: "warn",
  },
  {
    value: "source_added",
    label: "Source added after Stage 4",
    short: "SRC-ADD",
    tone: "info",
  },
  {
    value: "source_removed",
    label: "Source removed after Stage 4",
    short: "SRC-RM",
    tone: "info",
  },
  {
    value: "override_applied",
    label: "SK-OPS override applied",
    short: "OVERRIDE",
    tone: "destructive",
  },
  {
    value: "other",
    label: "Other (free text)",
    short: "OTHER",
    tone: "muted",
  },
];

export type ArticleFailureLogRow = {
  id: string;
  article_id: string;
  stage: FailureLogStage;
  event: FailureLogEvent;
  gate_code: string | null;
  detail: string;
  remediation: string | null;
  override_applied: boolean;
  override_reason: string | null;
  created_at: string;
  created_by: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function stageLabel(value: FailureLogStage): string {
  return FAILURE_LOG_STAGES.find((s) => s.value === value)?.label ?? value;
}

export function eventLabel(value: FailureLogEvent): string {
  return FAILURE_LOG_EVENTS.find((e) => e.value === value)?.label ?? value;
}

export function eventShort(value: FailureLogEvent): string {
  return FAILURE_LOG_EVENTS.find((e) => e.value === value)?.short ?? value;
}

export function eventTone(
  value: FailureLogEvent,
): "destructive" | "warn" | "muted" | "info" {
  return FAILURE_LOG_EVENTS.find((e) => e.value === value)?.tone ?? "muted";
}

export type FailureLogSummary = {
  total: number;
  /** Count by stage. */
  byStage: Record<FailureLogStage, number>;
  /** Count by event. */
  byEvent: Record<FailureLogEvent, number>;
  /** Number of entries that carry an SK-OPS override. */
  overrideCount: number;
  /** Pack-language "clean run" — zero entries on the log. */
  cleanRun: boolean;
};

function emptyByStage(): Record<FailureLogStage, number> {
  const r = {} as Record<FailureLogStage, number>;
  for (const s of FAILURE_LOG_STAGES) r[s.value] = 0;
  return r;
}

function emptyByEvent(): Record<FailureLogEvent, number> {
  const r = {} as Record<FailureLogEvent, number>;
  for (const e of FAILURE_LOG_EVENTS) r[e.value] = 0;
  return r;
}

export function summariseFailureLog(
  rows: ArticleFailureLogRow[],
): FailureLogSummary {
  const byStage = emptyByStage();
  const byEvent = emptyByEvent();
  let overrideCount = 0;

  for (const r of rows) {
    byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
    byEvent[r.event] = (byEvent[r.event] ?? 0) + 1;
    if (r.override_applied) overrideCount += 1;
  }

  return {
    total: rows.length,
    byStage,
    byEvent,
    overrideCount,
    cleanRun: rows.length === 0,
  };
}

/**
 * Pack-language declaration for the "clean run" disclosure at the top of
 * pack section 0. Returns the exact phrase the pack renderer should print.
 */
export function cleanRunDeclaration(rows: ArticleFailureLogRow[]): string {
  if (rows.length === 0) {
    return "Clean run — no failure events recorded across F1 / F2 / F3 / F4 / F5 / F6 / F7 / F8.";
  }
  const overrides = rows.filter((r) => r.override_applied).length;
  if (overrides > 0) {
    return `${rows.length} failure event${rows.length === 1 ? "" : "s"} recorded; ${overrides} carried an SK-OPS override.`;
  }
  return `${rows.length} failure event${rows.length === 1 ? "" : "s"} recorded; no overrides applied.`;
}
