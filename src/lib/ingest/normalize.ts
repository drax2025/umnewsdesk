/**
 * Canonicalize a URL for dedup:
 *  - lowercase host
 *  - drop the fragment
 *  - drop tracking params (utm_*, fbclid, gclid, mc_*, ref, ref_src)
 *  - sort remaining query params
 *  - trim trailing slash on path (unless path is exactly "/")
 *
 * Returns null when the input doesn't parse as a URL.
 */
const STRIP_PARAMS = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$|cmpid$)/i;

export function canonicalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  u.hash = "";
  u.host = u.host.toLowerCase();
  const keep: [string, string][] = [];
  for (const [k, v] of u.searchParams) {
    if (!STRIP_PARAMS.test(k)) keep.push([k, v]);
  }
  keep.sort((a, b) => a[0].localeCompare(b[0]));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

/**
 * Headline normalization for fuzzy matching:
 *  - lowercase
 *  - collapse whitespace
 *  - strip punctuation/control
 *  - drop leading article words (the, a, an)
 */
export function normalizeHeadline(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

export function safeTrim(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function safeIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
