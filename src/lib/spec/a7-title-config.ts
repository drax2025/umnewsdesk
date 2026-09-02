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
 * surface. Publishing credentials are deliberately not here: Newsroom V1
 * owns publishing, and a second copy of a WordPress app-password is a
 * second thing to rotate and a second thing to leak.
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

