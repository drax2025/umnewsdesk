/**
 * Rejection — how a candidate leaves the inbox without being sent onward.
 *
 * Ported from Newsroom V1, whose reason list is reproduced here **exactly**:
 * both systems close stories, and reasons that differ by a word cannot be
 * counted together.
 *
 * The list is closed on purpose. Free text produces forty spellings of
 * "duplicate" and no way to count anything. "Other" plus a mandatory note is
 * the escape hatch — in V1 it accounts for 6 of 131 rejections, so it is not
 * being leaned on.
 */

export const REJECTION_REASONS = [
  "Not newsworthy",
  "Duplicate / already covered",
  "Out of region",
  "Advertorial",
  "Embargoed — expired",
  "Poor quality source",
  "No usable content",
  "Other",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export function isRejectionReason(v: unknown): v is RejectionReason {
  return typeof v === "string" && (REJECTION_REASONS as readonly string[]).includes(v);
}

/**
 * Why this rejection is not acceptable yet, or null when it is.
 *
 * Pure, so the rule can be checked in the form (to keep Submit disabled) and
 * again on the server without the two drifting apart. The database function
 * enforces it a third time — that is the one that counts.
 */
export function validateRejection(
  reason: unknown,
  note: unknown,
): string | null {
  if (!isRejectionReason(reason)) return "Choose a reason";
  if (reason === "Other" && String(note ?? "").trim().length === 0) {
    return "A note is required when the reason is Other";
  }
  return null;
}
