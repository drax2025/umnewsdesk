/**
 * A2 master content inventory — types + label maps.
 *
 * The inventory is the source of truth for F4 interlinking and the E7
 * drift mitigation. Every published article — legacy or native — should
 * have a row here. Search by headline / URL / silo from the editor
 * inventory screen.
 */

export const INVENTORY_SOURCES = [
  {
    value: "legacy_import" as const,
    label: "Legacy import",
    short: "legacy",
    description:
      "Bulk-imported from the master content inventory .docx (512 founding rows).",
  },
  {
    value: "native_publish" as const,
    label: "Native publish",
    short: "native",
    description:
      "Written by F8 publishArticle on a successful WordPress push.",
  },
  {
    value: "manual" as const,
    label: "Manual entry",
    short: "manual",
    description:
      "Editor added by hand (e.g. cross-pub from another title, late legacy backfill).",
  },
];

export type InventorySource = (typeof INVENTORY_SOURCES)[number]["value"];

export const INVENTORY_SOURCE_LABEL: Record<InventorySource, string> =
  Object.fromEntries(
    INVENTORY_SOURCES.map((s) => [s.value, s.label]),
  ) as Record<InventorySource, string>;

/**
 * Canonical silos for Silicon Scotland. New titles will add their own
 * silo lists in Section G per-title configuration (item 10).
 */
export const SILICON_SCOTLAND_SILOS = [
  "Cyber",
  "AI in Business",
  "Life Sciences",
  "Robotics",
  "Space",
  "FinTech",
  "General Tech",
] as const;

export type MasterContentInventoryRow = {
  id: string;
  title_id: string;
  silo: string | null;
  headline: string;
  url: string;
  published_at: string | null;
  sectors: string[];
  source: InventorySource;
  article_id: string | null;
  notes: string | null;
  imported_at: string;
  imported_by: string | null;
  updated_at: string;
};

export type MasterContentInventoryRowWithTitle =
  MasterContentInventoryRow & {
    title_name?: string | null;
    title_slug?: string | null;
  };

/* -------------------------------------------------------------------------- */
/*  URL canonicalisation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Normalise a URL for inventory dedupe. Strips trailing slash, query
 * string and fragment; lower-cases host. Throws on unparseable input —
 * caller should pre-validate.
 */
export function canonicaliseInventoryUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty URL");
  const u = new URL(trimmed);
  u.search = "";
  u.hash = "";
  u.host = u.host.toLowerCase();
  let path = u.pathname.replace(/\/+$/, "");
  if (path === "") path = "/";
  return `${u.protocol}//${u.host}${path}`;
}

export function tryCanonicalise(raw: string): string | null {
  try {
    return canonicaliseInventoryUrl(raw);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Drift summary — E7 mitigation                                             */
/* -------------------------------------------------------------------------- */

export type InventoryDriftSummary = {
  legacy: number;
  native: number;
  manual: number;
  total: number;
  last_native_at: string | null;
};

export function summariseInventory(
  rows: MasterContentInventoryRow[],
): InventoryDriftSummary {
  let legacy = 0;
  let native = 0;
  let manual = 0;
  let last_native_at: string | null = null;
  for (const r of rows) {
    if (r.source === "legacy_import") legacy++;
    else if (r.source === "native_publish") {
      native++;
      if (
        r.imported_at &&
        (!last_native_at || r.imported_at > last_native_at)
      ) {
        last_native_at = r.imported_at;
      }
    } else manual++;
  }
  return {
    legacy,
    native,
    manual,
    total: rows.length,
    last_native_at,
  };
}
