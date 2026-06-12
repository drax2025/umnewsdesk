/**
 * F3 / F5 headline-options shared types and validation.
 *
 * Per spec v3.0:
 *   - F3 step 4:  Writer produces THREE headline options, ≤90 chars each,
 *                 click-bait-leaning per B6.1.
 *   - F5 step 1:  Editor selects one (or writes a fourth if all three fail
 *                 the B6.1 policy). Selection is recorded in NFP footer.
 *   - C8 / H8:    Headline char count ≤ 90 (Google SERP truncation) — soft
 *                 gate at F6, surfaced here as a soft cap warning.
 *
 * Single source of truth for the headline editor + write action.
 */

/* -------------------------------------------------------------------------- */
/*  Limits                                                                    */
/* -------------------------------------------------------------------------- */

/** Hard count cap (F3 produces exactly three options). */
export const MAX_HEADLINE_OPTIONS = 3;

/** Soft character cap (H8 / C8 — Google SERP truncation). */
export const HEADLINE_CHAR_SOFT_CAP = 90;

/* -------------------------------------------------------------------------- */
/*  Shape                                                                     */
/* -------------------------------------------------------------------------- */

export type HeadlineOption = {
  text: string;
  rationale: string;
  char_count: number;
};

export type HeadlineOptionsRow = {
  options: HeadlineOption[];
  selected_idx: 0 | 1 | 2 | null;
};

export const EMPTY_HEADLINE_OPTIONS: HeadlineOptionsRow = {
  options: [],
  selected_idx: null,
};

/* -------------------------------------------------------------------------- */
/*  Normalisation + validation                                                */
/* -------------------------------------------------------------------------- */

/**
 * Normalise a raw value (e.g. from JSONB) into our shape. Tolerates legacy
 * shapes: bare strings, missing rationale, missing char_count.
 */
export function normaliseHeadlineOptions(raw: unknown): HeadlineOption[] {
  if (!Array.isArray(raw)) return [];
  const out: HeadlineOption[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push({
        text: entry,
        rationale: "",
        char_count: entry.length,
      });
      continue;
    }
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      const text = typeof e.text === "string" ? e.text : "";
      const rationale = typeof e.rationale === "string" ? e.rationale : "";
      const charCount =
        typeof e.char_count === "number" ? e.char_count : text.length;
      out.push({ text, rationale, char_count: charCount });
    }
  }
  return out.slice(0, MAX_HEADLINE_OPTIONS);
}

/** Returns true if the row passes F3's "three valid options" gate. */
export function hasFullThreeSet(options: HeadlineOption[]): boolean {
  if (options.length !== MAX_HEADLINE_OPTIONS) return false;
  return options.every(
    (o) => o.text.trim().length > 0 && o.char_count <= HEADLINE_CHAR_SOFT_CAP,
  );
}

/** Soft-cap check for a single headline. */
export function isOverSoftCap(text: string): boolean {
  return text.length > HEADLINE_CHAR_SOFT_CAP;
}

/** Returns counts useful for the F3/F5 status pill. */
export function summariseHeadlines(row: HeadlineOptionsRow): {
  filled: number;
  overCap: number;
  hasSelection: boolean;
  ready: boolean;
} {
  const filled = row.options.filter((o) => o.text.trim().length > 0).length;
  const overCap = row.options.filter((o) => isOverSoftCap(o.text)).length;
  const hasSelection = row.selected_idx !== null;
  const ready =
    filled === MAX_HEADLINE_OPTIONS && overCap === 0 && hasSelection;
  return { filled, overCap, hasSelection, ready };
}
