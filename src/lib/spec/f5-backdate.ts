/**
 * F5 step 2 — backdate selection.
 *
 * Spec references: B5 (backdating discipline), D3 (two defensible options),
 * D4 (Friday-after > 6 weeks reframe), Tier 3 no-backdate rule.
 *
 * Single source of truth for the backdate UI + write action.
 */

export type BackdateKind =
  | "friday_of_week"
  | "friday_after"
  | "source_date"
  | "custom";

export const BACKDATE_KINDS: {
  value: BackdateKind;
  label: string;
  short: string;
  hint: string;
}[] = [
  {
    value: "friday_of_week",
    label: "Friday of publication week",
    short: "FRI-PUB",
    hint: "Event happened earlier this week. The article is timestamped to this Friday.",
  },
  {
    value: "friday_after",
    label: "Friday after the event",
    short: "FRI-AFTER",
    hint: "D3 default for weekend events. The Friday that immediately follows the event date.",
  },
  {
    value: "source_date",
    label: "Source's own date",
    short: "SOURCE",
    hint: "Source is itself published on a Friday. Mirror it.",
  },
  {
    value: "custom",
    label: "Custom (rationale required)",
    short: "CUSTOM",
    hint: "Editor override. Rationale text required and surfaces in NFP footer + pack section 5.",
  },
];

/** Soft-rule cap from D4 — beyond this, the editor should reframe as feature. */
export const D4_FRIDAY_AFTER_WEEKS_CAP = 6;

/** ISO weekday for Friday under JS getDay(). */
const FRIDAY = 5;

/* -------------------------------------------------------------------------- */
/*  Friday-of-week / Friday-after suggestions                                 */
/* -------------------------------------------------------------------------- */

/**
 * Return the Friday of the calendar week containing `event` (UK week — Mon-Sun).
 * If `event` IS a Friday, returns `event`.
 */
export function fridayOfWeek(event: Date): Date {
  const d = new Date(event);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  // Days to add to land on Friday (5). Use ISO Mon-Sun week: if event is Sat (6)
  // or Sun (0), Friday-of-week is the Friday two/three days before — use the
  // preceding Friday rather than next Friday (this is the "Friday of the week
  // the event happened" reading per the spec example).
  let diff: number;
  if (day === 0) diff = -2;      // Sun → previous Fri
  else if (day === 6) diff = -1; // Sat → previous Fri
  else diff = FRIDAY - day;      // Mon-Fri → forward (or 0 if already Fri)
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Return the first Friday strictly after the event date.
 * (If event is a Friday, return the next Friday.)
 */
export function fridayAfter(event: Date): Date {
  const d = new Date(event);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day < FRIDAY ? FRIDAY - day : 7 - (day - FRIDAY);
  // diff===0 means today IS Friday — we want STRICTLY after, so push 7.
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  return d;
}

/** Friday of the week of `now`. */
export function suggestFridayOfThisWeek(now: Date = new Date()): Date {
  return fridayOfWeek(now);
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

export type BackdateValidation = {
  ok: boolean;
  /** Hard problems — block the save. */
  errors: string[];
  /** Soft warnings — surface but allow save. */
  warnings: string[];
};

export type ValidateInput = {
  backdate: Date | null;
  kind: BackdateKind | null;
  rationale: string | null;
  defamationTier: 1 | 2 | 3 | null;
  eventDate?: Date | null;
};

export function validateBackdate(input: ValidateInput): BackdateValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Tier 3 no-backdate hard rule.
  if (input.defamationTier === 3 && input.backdate) {
    errors.push(
      "Tier 3 stories must publish with full transparency on publication date — no backdate (D rule).",
    );
  }

  // Custom rationale required.
  if (input.kind === "custom" && !input.rationale?.trim()) {
    errors.push("Custom backdate requires a written rationale.");
  }

  // Backdate is in the future — almost always a mistake.
  if (input.backdate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (input.backdate > today) {
      errors.push("Backdate is in the future — pick today or earlier.");
    }
  }

  // D4 — Friday-after more than 6 weeks after the event.
  if (
    input.kind === "friday_after" &&
    input.backdate &&
    input.eventDate
  ) {
    const days =
      (input.backdate.getTime() - input.eventDate.getTime()) / 86_400_000;
    if (days > D4_FRIDAY_AFTER_WEEKS_CAP * 7) {
      warnings.push(
        `D4 — backdate is ${Math.round(days / 7)} weeks after the event. Reframe as a feature/explainer with a contemporary peg.`,
      );
    }
  }

  // Backdate is supposed to be a Friday under B5 — soft check.
  if (input.backdate && input.backdate.getDay() !== FRIDAY) {
    warnings.push("B5 prefers Friday timestamps — this is not a Friday.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* -------------------------------------------------------------------------- */
/*  Display helpers                                                           */
/* -------------------------------------------------------------------------- */

export function formatBackdate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function backdateIso(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function parseBackdate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw + "T00:00:00");
  return Number.isFinite(d.getTime()) ? d : null;
}
