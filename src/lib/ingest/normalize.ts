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

/**
 * Best-effort featured-image extraction from an RSS-ish raw envelope.
 *
 * Most runners deliver an `image_url` directly. For ones that don't,
 * walk the common paths seen in the wild (RSS enclosure, media:content,
 * og:image, generic `image`) so existing n8n workflows benefit without
 * a contract update. Returns null if nothing usable is found.
 */
const IMAGE_KEYS = [
  "image_url",
  "imageUrl",
  "image",
  "thumbnail",
  "og_image",
  "ogImage",
] as const;

export function extractImageUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  for (const k of IMAGE_KEYS) {
    const v = r[k];
    if (typeof v === "string" && v.startsWith("http")) return v;
    if (v && typeof v === "object") {
      const url = (v as Record<string, unknown>).url;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

  // RSS <enclosure url="…" type="image/…"/>
  const enc = r.enclosure;
  if (enc && typeof enc === "object") {
    const url = (enc as Record<string, unknown>).url;
    const type = (enc as Record<string, unknown>).type;
    if (
      typeof url === "string" &&
      url.startsWith("http") &&
      (typeof type !== "string" || type.startsWith("image/"))
    ) {
      return url;
    }
  }

  // <media:content url="…" medium="image"/>
  const media = (r["media:content"] ?? r.media_content) as unknown;
  if (media && typeof media === "object") {
    const url = (media as Record<string, unknown>).url;
    const medium = (media as Record<string, unknown>).medium;
    if (
      typeof url === "string" &&
      url.startsWith("http") &&
      (typeof medium !== "string" || medium === "image")
    ) {
      return url;
    }
  }

  return null;
}
