/**
 * Recover the *original* sender from a forwarded email.
 *
 * The agency lookup matches the envelope From domain — but when a user
 * forwards a press release (manual Forward or a Zoho/Gmail filter), the
 * envelope From gets rewritten to the forwarder, so a known agency falls
 * through to PRESS_MAILBOX unverified.
 *
 * We try, in order:
 *   1. Reply-To header (often preserved across forwards)
 *   2. Resent-From header (set by some server-side forwards)
 *   3. X-Forwarded-For / X-Original-From / X-Original-Sender (mailbox-specific)
 *   4. The first `From: …` line inside the forwarded body
 *
 * Conservative on all of these: if multiple parse, the first match wins.
 * The forwarder is still recorded on candidates.raw for audit.
 */

type HeaderLike = { Name?: string; Value?: string };

const FORWARDED_FROM_RE =
  /^\s*(?:From:|Van:|De:|Von:|Da:)\s*(.+?)\s*$/im;

const FORWARDED_BLOCK_RE =
  /---+\s*(?:Forwarded message|Original message|Begin forwarded message)[\s\S]{0,4000}?(?:From|Van|De|Von|Da):\s*(.+)/i;

export type RecoveredSender = {
  email: string;
  domain: string;
  source: "reply-to" | "resent-from" | "x-header" | "body";
};

export function recoverOriginalSender(
  headers: HeaderLike[] | undefined,
  bodyText: string | null | undefined,
  envelopeEmail: string | null,
): RecoveredSender | null {
  const headerMap = new Map<string, string>();
  for (const h of headers ?? []) {
    const n = (h.Name ?? "").trim().toLowerCase();
    const v = (h.Value ?? "").trim();
    if (n && v) headerMap.set(n, v);
  }

  const tries: Array<[string, RecoveredSender["source"]]> = [
    [headerMap.get("reply-to") ?? "", "reply-to"],
    [headerMap.get("resent-from") ?? "", "resent-from"],
    [
      headerMap.get("x-original-from") ??
        headerMap.get("x-original-sender") ??
        headerMap.get("x-forwarded-for") ??
        "",
      "x-header",
    ],
  ];

  for (const [raw, source] of tries) {
    const email = extractEmail(raw);
    if (!email) continue;
    if (envelopeEmail && email.toLowerCase() === envelopeEmail.toLowerCase()) continue;
    return toRecovered(email, source);
  }

  // Body fallback: look for a forwarded block, then any "From: …" line.
  if (bodyText) {
    const blockMatch = bodyText.match(FORWARDED_BLOCK_RE);
    const lineMatch = blockMatch ? null : bodyText.match(FORWARDED_FROM_RE);
    const raw = blockMatch?.[1] ?? lineMatch?.[1] ?? "";
    const email = extractEmail(raw);
    if (
      email &&
      (!envelopeEmail || email.toLowerCase() !== envelopeEmail.toLowerCase())
    ) {
      return toRecovered(email, "body");
    }
  }

  return null;
}

function toRecovered(
  email: string,
  source: RecoveredSender["source"],
): RecoveredSender {
  const e = email.toLowerCase();
  return { email: e, domain: e.split("@")[1] ?? "", source };
}

// "Alice Smith <alice@edelman.co.uk>" → "alice@edelman.co.uk"
function extractEmail(s: string): string | null {
  if (!s) return null;
  const angle = /<([^>]+@[^>]+)>/.exec(s);
  if (angle) return angle[1].trim();
  const bare = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(s);
  return bare ? bare[1] : null;
}
