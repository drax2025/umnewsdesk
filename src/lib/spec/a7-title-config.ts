/**
 * A7 / Section G — per-title configuration spec.
 *
 * Centralises the per-publication settings the editorial pipeline needs:
 *
 *   - Brand / display          tagline, primary colour, default frame
 *   - WordPress connection     base URL, username, app-password,
 *                              default post status, default category
 *   - Editorial defaults       default sectors, silo options (used by A2
 *                              inventory + opportunities), default geo tier,
 *                              slug prefix
 *   - Operational              is_active (phase-2 toggle), launch date,
 *                              weekly issue day (0=Sun..6=Sat) for K5
 *                              sweeps
 *
 * Everything is server-rendered through the senior-only `/system/titles`
 * surface; F8 publishArticle reads wp_* off the title row when present and
 * falls back to env vars only if the title hasn't been configured.
 */

export const PRIMARY_FRAMES = [
  "Scottish Context",
  "Wider Sector Picture",
  "Technical or Scientific Depth",
  "Policy and Regulation",
  "Human Impact",
  "Comparison or Data Point",
] as const;
export type PrimaryFrame = (typeof PRIMARY_FRAMES)[number];

export const GEO_TIERS = [
  { value: "scottish_origin" as const, label: "Scottish origin" },
  { value: "uk_origin" as const, label: "UK origin (find Scottish hook)" },
  { value: "global_origin" as const, label: "Global origin (anchor Scottish stake)" },
];
export type GeoTier = (typeof GEO_TIERS)[number]["value"];

export const WP_DEFAULT_STATUSES = [
  { value: "publish" as const, label: "Publish immediately" },
  { value: "draft" as const, label: "Draft (manual publish on WP)" },
  { value: "future" as const, label: "Future (scheduled via WP)" },
];
export type WpDefaultStatus = (typeof WP_DEFAULT_STATUSES)[number]["value"];

export const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export type TitleConfigRow = {
  id: string;
  slug: string;
  name: string;
  domain: string | null;

  // Section G — brand
  tagline: string | null;
  primary_color: string | null;
  default_frame: PrimaryFrame | null;

  // Section G — WordPress
  wp_base_url: string | null;
  wp_username: string | null;
  wp_app_password: string | null;
  wp_default_status: WpDefaultStatus | null;
  wp_default_category_id: number | null;

  // Section G — editorial defaults
  default_sectors: string[];
  silo_options: string[];
  default_geo_tier: GeoTier | null;
  slug_prefix: string | null;

  // Section G — operational
  is_active: boolean;
  launched_at: string | null;
  weekly_issue_day: number | null;

  // Free-form jsonb
  config: Record<string, unknown>;

  // Audit
  created_at: string;
  updated_at: string | null;
  config_updated_at: string | null;
  config_updated_by: string | null;
};

/**
 * "Configuration completeness" score (0..5). Reported on the title list so
 * the editor can see at a glance which titles are launch-ready.
 *
 *   1. WP credentials present (base + user + app password)
 *   2. Default frame set
 *   3. At least one default sector
 *   4. At least three silo options
 *   5. Launch date set
 */
export function configCompleteness(row: TitleConfigRow): {
  score: number;
  total: number;
  missing: string[];
} {
  const checks: { ok: boolean; label: string }[] = [
    {
      ok: Boolean(row.wp_base_url && row.wp_username && row.wp_app_password),
      label: "WordPress credentials",
    },
    { ok: Boolean(row.default_frame), label: "Default frame" },
    {
      ok: row.default_sectors.length > 0,
      label: "At least one default sector",
    },
    {
      ok: row.silo_options.length >= 3,
      label: "Three+ silo options",
    },
    { ok: Boolean(row.launched_at), label: "Launch date" },
  ];
  const score = checks.filter((c) => c.ok).length;
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  return { score, total: checks.length, missing };
}

/**
 * Public-safe view of WordPress credentials — the app-password never
 * leaves the server in plaintext.
 */
export function maskedWpStatus(row: TitleConfigRow): {
  base_url: string | null;
  username: string | null;
  password_state: "set" | "missing";
  default_status: WpDefaultStatus | null;
  default_category_id: number | null;
  configured: boolean;
} {
  return {
    base_url: row.wp_base_url,
    username: row.wp_username,
    password_state: row.wp_app_password ? "set" : "missing",
    default_status: row.wp_default_status,
    default_category_id: row.wp_default_category_id,
    configured: Boolean(
      row.wp_base_url && row.wp_username && row.wp_app_password,
    ),
  };
}

/**
 * Parse a comma-or-newline-delimited list field into a deduped string[].
 * Used by silo_options and default_sectors editor inputs.
 */
export function parseListField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const v = part.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function isValidHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

export function isValidHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
