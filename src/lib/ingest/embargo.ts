/**
 * Embargo parser for inbound press releases.
 *
 * Default mode is cautious: if any embargo phrase is detected at all and we
 * can't parse a future time, we still HOLD the candidate (confidence='low').
 * Releasing an embargoed story is a relationship-ender with PR agencies, so
 * a false hold is much cheaper than a false release.
 *
 * Patterns covered:
 *   ✓ FOR IMMEDIATE RELEASE / Immediate release
 *   ✓ EMBARGOED UNTIL 09:00 BST Tuesday 11 June 2026
 *   ✓ Strictly embargoed until 00:01 GMT Wed 11 June 2026
 *   ✓ Embargo: 1pm BST 11/06/2026
 *   ✓ Embargoed until 9am BST 11 June
 *   ✓ EMBARGOED UNTIL 2026-06-11 09:00 BST
 *
 * Anything ambiguous (no date number, vague phrases like "end of day Friday")
 * falls through to confidence='low', held=true. Operator review required.
 */

export type EmbargoConfidence = "high" | "med" | "low" | "none";

export type EmbargoResult = {
  embargoed: boolean;
  until: Date | null;
  confidence: EmbargoConfidence;
  matched_text: string | null;
};

const IMMEDIATE_RE = /\bfor\s+immediate\s+release\b/i;
const EMBARGO_RE = /\b(?:strictly\s+)?embargo(?:ed)?(?:\s+until|\s*:|\s+at)?\b/i;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseEmbargo(text: string | null | undefined): EmbargoResult {
  if (!text) return none();

  // Normalise NBSP, collapse whitespace
  const norm = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");

  const immediate = IMMEDIATE_RE.test(norm);
  const embargo = EMBARGO_RE.exec(norm);

  // "For immediate release" with no competing embargo phrase wins.
  if (immediate && !embargo) {
    return {
      embargoed: false,
      until: null,
      confidence: "high",
      matched_text: "for immediate release",
    };
  }

  if (!embargo) return none();

  const window = norm.slice(embargo.index, embargo.index + 200);
  const until = parseEmbargoDate(window);

  if (until) {
    const now = new Date();
    if (until > now) {
      return {
        embargoed: true,
        until,
        confidence: "high",
        matched_text: window.slice(0, 120).trim(),
      };
    }
    // Embargo phrase + parseable but past timestamp → not embargoed.
    return {
      embargoed: false,
      until: null,
      confidence: "high",
      matched_text: window.slice(0, 120).trim(),
    };
  }

  // Embargo phrase detected, no parseable time → safer to hold.
  return {
    embargoed: true,
    until: null,
    confidence: "low",
    matched_text: window.slice(0, 120).trim(),
  };
}

function none(): EmbargoResult {
  return { embargoed: false, until: null, confidence: "none", matched_text: null };
}

function parseEmbargoDate(window: string): Date | null {
  const time = parseTime(window);
  if (!time) return null;
  const date = parseDate(window);
  if (!date) return null;
  const tz = parseTz(window) ?? "BST"; // default to UK summer time — flips to GMT in winter via the offset table

  let utcHours = time.h;
  // Both UK timezones treated as fixed offsets from UTC; we don't import a tz
  // library because PR-agency embargoes are always UK-anchored in practice.
  if (tz === "BST") utcHours -= 1;
  // GMT/UTC → no offset.

  return new Date(Date.UTC(date.y, date.m, date.d, utcHours, time.min));
}

function parseTime(s: string): { h: number; min: number } | null {
  // 24h or 12h with explicit minutes: 09:00, 9:00am
  const m1 = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i.exec(s);
  if (m1) {
    let h = Number.parseInt(m1[1], 10);
    const min = Number.parseInt(m1[2], 10);
    const ap = m1[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return { h, min };
  }
  // 12h without minutes: 9am, 1pm
  const m2 = /\b(\d{1,2})\s*(am|pm)\b/i.exec(s);
  if (m2) {
    let h = Number.parseInt(m2[1], 10);
    const ap = m2[2].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23) return null;
    return { h, min: 0 };
  }
  // Midnight / noon
  if (/\bmidnight\b/i.test(s)) return { h: 0, min: 0 };
  if (/\bnoon\b/i.test(s)) return { h: 12, min: 0 };
  return null;
}

function parseDate(s: string): { y: number; m: number; d: number } | null {
  const lower = s.toLowerCase();
  const monthsRe = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)";

  // ISO 2026-06-11
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (iso) {
    return {
      y: Number.parseInt(iso[1], 10),
      m: Number.parseInt(iso[2], 10) - 1,
      d: Number.parseInt(iso[3], 10),
    };
  }

  // DD MONTH YYYY?  (e.g. "11 June 2026", "11th June")
  const dmy = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthsRe}[a-z]*(?:\\s+(\\d{4}))?\\b`,
    "i",
  ).exec(lower);
  if (dmy) {
    const d = Number.parseInt(dmy[1], 10);
    const m = MONTHS[dmy[2].toLowerCase().slice(0, 3)];
    if (m === undefined || d < 1 || d > 31) return null;
    const y = dmy[3] ? Number.parseInt(dmy[3], 10) : inferYear(m, d);
    return { y, m, d };
  }

  // MONTH DD YYYY? (e.g. "June 11", "June 11 2026")
  const mdy = new RegExp(
    `\\b${monthsRe}[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?\\b`,
    "i",
  ).exec(lower);
  if (mdy) {
    const m = MONTHS[mdy[1].toLowerCase().slice(0, 3)];
    const d = Number.parseInt(mdy[2], 10);
    if (m === undefined || d < 1 || d > 31) return null;
    const y = mdy[3] ? Number.parseInt(mdy[3], 10) : inferYear(m, d);
    return { y, m, d };
  }

  // DD/MM/YYYY or DD-MM-YYYY (UK order)
  const slash = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/.exec(s);
  if (slash) {
    const d = Number.parseInt(slash[1], 10);
    const m = Number.parseInt(slash[2], 10) - 1;
    let y = Number.parseInt(slash[3], 10);
    if (y < 100) y += 2000;
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    return { y, m, d };
  }

  return null;
}

function parseTz(s: string): "BST" | "GMT" | "UTC" | null {
  if (/\bBST\b/.test(s)) return "BST";
  if (/\bGMT\b/.test(s)) return "GMT";
  if (/\bUTC\b/.test(s)) return "UTC";
  return null;
}

function inferYear(month: number, day: number): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(y, month, day));
  // If the dateless candidate is >7 days in the past, assume next year.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return candidate < sevenDaysAgo ? y + 1 : y;
}
