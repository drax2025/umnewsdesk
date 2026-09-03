/**
 * Works out whether a press release is embargoed, and until when.
 *
 * Ported from Newsroom V1, which learned this against real agency mail. The
 * wording is not standardised: "EMBARGOED UNTIL 00:01 TUESDAY 25 AUGUST 2026",
 * "Embargoed until 21/08/2026 @ 08:59am", "STRICTLY EMBARGOED UNTIL 00:01HRS
 * FRIDAY 28 AUGUST" with no year at all, "Embargoed for publication until 8am
 * on Thursday 27th August".
 *
 * The trap is the opposite case. "Embargo: For immediate release" and
 * "EMBARGO: IMMEDIATE" are common and mean the story is free to run now — a
 * keyword match flags those as embargoed and holds a story that should have
 * gone out. Equally, an agency *asking* whether you want releases under embargo
 * is not itself an embargo.
 *
 * Default is cautious in the other direction: a release that mentions an
 * embargo but whose date cannot be read is still treated as embargoed, with no
 * lift time, so a person has to decide. Publishing an embargoed release early
 * is the mistake agencies do not forgive.
 */

export interface EmbargoFinding {
  embargoed: boolean;
  /** UTC instant the embargo lifts, where one could be read. */
  until: Date | null;
  /** The line it was read from, so a person can check the machine's work. */
  evidence: string | null;
  /** How much to trust it: a parsed date is 'high', a bare mention 'low'. */
  confidence: "high" | "low" | "none";
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "Embargo: for immediate release" is not an embargo. */
const IMMEDIATE = /embargo[^\n]{0,20}?\b(immediate|none|no embargo)\b/i;
/** Talking about an embargo is not being under one. */
const CHATTER = /(would like to receive|if you would like|happy to send|under embargo\?)/i;
const MENTIONS = /\bembargo(ed|s)?\b/i;

/**
 * The last Sunday of a month, for the British Summer Time rule: BST runs from
 * the last Sunday in March to the last Sunday in October. Done here rather than
 * with a timezone library because the answer has to be deterministic and
 * testable, and this is the only zone the desk works in.
 */
function lastSundayUtc(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

function isBritishSummerTime(y: number, m: number, d: number, hour: number): boolean {
  if (m < 2 || m > 9) return false;
  if (m > 2 && m < 9) return true;
  if (m === 2) {
    const start = lastSundayUtc(y, 2);
    return d > start || (d === start && hour >= 1);
  }
  const end = lastSundayUtc(y, 9);
  return d < end || (d === end && hour < 2);
}

/** A wall-clock time the desk would read, converted to the instant it happens. */
export function ukLocalToUtc(y: number, m: number, d: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(y, m, d, hour - (isBritishSummerTime(y, m, d, hour) ? 1 : 0), minute));
}

/** 8am, 8pm, 00:01, 00.01, 0001hrs, 08:59am. */
function readTime(text: string): { hour: number; minute: number } | null {
  const hm = text.match(/\b(\d{1,2})[:.](\d{2})\s*(hrs|hours)?\s*(am|pm)?/i);
  if (hm) {
    let hour = Number(hm[1]);
    const minute = Number(hm[2]);
    const suffix = (hm[4] || "").toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }
  const oclock = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (oclock) {
    let hour = Number(oclock[1]);
    if (/pm/i.test(oclock[2]) && hour < 12) hour += 12;
    if (/am/i.test(oclock[2]) && hour === 12) hour = 0;
    if (hour <= 23) return { hour, minute: 0 };
  }
  return null;
}

/**
 * The year is often missing — "FRIDAY 28 AUGUST" — so it is taken from the date
 * the release arrived. A release does not embargo something eleven months back,
 * so a date that lands well in the past rolls to the following year.
 */
function inferYear(month: number, day: number, receivedAt: Date): number {
  const year = receivedAt.getUTCFullYear();
  const candidate = Date.UTC(year, month, day);
  const arrived = Date.UTC(
    receivedAt.getUTCFullYear(), receivedAt.getUTCMonth(), receivedAt.getUTCDate(),
  );
  return candidate < arrived - 45 * 864e5 ? year + 1 : year;
}

function readDate(text: string, receivedAt: Date): { y: number; m: number; d: number } | null {
  // 21/08/2026 or 21-08-26, always day first — this is a British desk.
  const numeric = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]) - 1;
    let y = Number(numeric[3]);
    if (y < 100) y += 2000;
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) return { y, m, d };
  }

  const monthOf = (word: string): number | undefined => MONTHS[word.slice(0, 3).toLowerCase()];

  // Every candidate is examined, not just the first. "00:01 TUESDAY 25 AUGUST"
  // offers "01 TUESDAY" and "TUESDAY 25" before it offers "25 AUGUST", and
  // stopping at the first match found nothing at all.
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b(?:,?\s+(\d{4}))?/gi)) {
    const month = monthOf(m[2]);
    const day = Number(m[1]);
    if (month === undefined || day < 1 || day > 31) continue;
    return { y: m[3] ? Number(m[3]) : inferYear(month, day, receivedAt), m: month, d: day };
  }

  // September 1st 2026
  for (const m of text.matchAll(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/gi)) {
    const month = monthOf(m[1]);
    const day = Number(m[2]);
    if (month === undefined || day < 1 || day > 31) continue;
    return { y: m[3] ? Number(m[3]) : inferYear(month, day, receivedAt), m: month, d: day };
  }

  return null;
}

export function detectEmbargo(
  title: string,
  body: string,
  receivedAt: Date = new Date(),
): EmbargoFinding {
  const lines = [String(title || ""), ...String(body || "").split("\n")];

  let mentioned: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!MENTIONS.test(line)) continue;
    if (IMMEDIATE.test(line) || CHATTER.test(line)) continue; // says embargo, means the opposite
    mentioned = line;

    // Only read a date from the line that actually sets the embargo.
    if (!/\buntil\b|\bembargo(ed)?\s*[:-]/i.test(line)) continue;
    const when = readDate(line, receivedAt);
    const time = readTime(line);
    if (when) {
      return {
        embargoed: true,
        until: ukLocalToUtc(when.y, when.m, when.d, time?.hour ?? 0, time?.minute ?? 1),
        evidence: line.slice(0, 160),
        confidence: "high",
      };
    }
  }

  // Mentioned but no date read: still embargoed, and the desk has to say when.
  if (mentioned) {
    return { embargoed: true, until: null, evidence: mentioned.slice(0, 160), confidence: "low" };
  }
  return { embargoed: false, until: null, evidence: null, confidence: "none" };
}

/** Whether an embargo still binds. No date means it does — we cannot say it lifted. */
export function embargoActive(
  until: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!until) return true;
  const at = until instanceof Date ? until : new Date(until);
  return isNaN(at.getTime()) ? true : at.getTime() > now.getTime();
}
