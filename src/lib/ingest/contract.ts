/**
 * Discovery ingestion contract.
 *
 * One envelope shape per source kind. The ingestion runner (n8n, a
 * cron job, or anything else) is responsible for fetching, parsing,
 * and posting a normalized payload to /api/ingest/*. The app owns
 * everything past that: dedup, layer assignment, candidate insert,
 * audit, OPS-RR rules.
 *
 *   POST /api/ingest/sweep                    → open a sweep
 *   POST /api/ingest/sweep/:id/complete       → close a sweep
 *   POST /api/ingest/item                     → ingest a single item
 *   POST /api/ingest/alert                    → file an OPS-RR alert
 *
 * Auth: Authorization: Bearer $INGEST_TOKEN
 */

export type SweepSlot = "am" | "pm";
export type SweepTrigger = "scheduled" | "manual" | "webhook";
export type ItemKind = "rss" | "email" | "pdf" | "web" | "generic";
export type CrawlMethod = "rss" | "sitemap" | "html_scrape" | "api";

// ─── Source list (GET /api/ingest/sources) ───────────────────
// Lets a sweep runner ask the app which sources to fetch, so
// `discovery_sources` is the single source of truth rather than a
// hardcoded list inside the n8n workflow.
export type SweepSource = {
  code: string;
  name: string;
  feed_url: string;
  crawl_method: CrawlMethod;
  layer: string;
  status: string;
  signal_only_eligible: boolean;
};

export type SweepSourcesResponse = {
  method: CrawlMethod;
  count: number;
  sources: SweepSource[];
};

// ─── Open sweep ──────────────────────────────────────────────
export type OpenSweepBody = {
  slot: SweepSlot;
  trigger?: SweepTrigger;        // default 'scheduled'
  started_at?: string;           // ISO; defaults to server now()
};
export type OpenSweepResponse = {
  sweep_id: string;
  sweep_code: string;
};

// ─── Item ────────────────────────────────────────────────────
export type IngestItemBody = {
  sweep_id: string;              // returned by /sweep
  source_code: string;           // e.g. "SRC-0047"
  kind: ItemKind;
  fetched_at?: string;           // when the runner pulled it; defaults to now
  item: NormalizedItem;
};

export type NormalizedItem = {
  headline: string;              // becomes candidates.working_headline
  external_id?: string | null;   // canonical ID from the source (RSS guid, message-id, etc.)
  primary_url?: string | null;   // canonical URL if applicable
  published_at?: string | null;  // ISO; when the source claims it was published
  summary?: string | null;
  body_text?: string | null;     // full extracted text (PDFs, articles, emails)
  author?: string | null;
  image_url?: string | null;     // featured image; runner normalises enclosure / media:content / og:image
  tags?: string[];
  raw?: Record<string, unknown>; // original payload, stored as jsonb for audit
};

export type IngestItemResponse = {
  candidate_id: string | null;
  candidate_code: string | null;
  dedup_state: "clear" | "duplicate";
  duplicate_reason?: "external_id" | "primary_url" | "fuzzy_headline";
  matched_candidate_id?: string;
};

// ─── Complete sweep ──────────────────────────────────────────
export type CompleteSweepBody = {
  site_results: Array<{
    source_code: string;
    outcome: "reached_items" | "reached_empty" | "parse_failure" | "not_reached";
    http_status?: number | null;
    candidate_count?: number;     // ignored — we compute from inserts
    parse_issue_count?: number;
    resolved_primary_url?: string | null;
  }>;
};

export type CompleteSweepResponse = {
  sweep_id: string;
  status: "complete" | "partial" | "failed";
  totals: {
    sites_total: number;
    reached_with_items: number;
    reached_no_items: number;
    parse_failures: number;
    not_reached: number;
    candidates_total: number;
    dedup_holds: number;
  };
};

// ─── Alert ───────────────────────────────────────────────────
export type IngestAlertBody = {
  source_code: string;
  sweep_id?: string;
  severity: "p1" | "p2" | "p3";
  issue_type:
    | "parse_failure"
    | "unreachable"
    | "rate_limit"
    | "schema_drift"
    | "volume_anomaly"
    | "wordpress_check"
    | "config"
    | "timeout";
  description: string;
};

export type IngestAlertResponse = {
  alert_id: string;
  alert_code: string;
  state: "created" | "updated";
};
