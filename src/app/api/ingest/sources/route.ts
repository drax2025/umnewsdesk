/**
 * Source list for sweep runners.
 *
 * The RSS sweep used to carry its own hardcoded copy of the source list in an
 * n8n Code node, which meant `discovery_sources` was decorative: adding a
 * source in /system/discovery-config did nothing until someone also edited the
 * workflow, and deleting one left the runner fetching a dead URL. This endpoint
 * makes the registry authoritative — n8n asks the app what to sweep.
 *
 * GET /api/ingest/sources?method=rss
 *   Authorization: Bearer $INGEST_TOKEN
 *
 * Filtering rules (deliberately conservative — a runner should never fetch
 * something the desk has switched off):
 *   - `status = 'paused'`            → excluded
 *   - `paused_until` in the future   → excluded
 *   - `warning` / `critical`         → INCLUDED. Those are health signals, not
 *     off-switches; excluding them would mean a source that failed once could
 *     never recover on its own.
 *   - signal-only sources            → INCLUDED, with the flag exposed. Signal-only
 *     restricts *drafting*, not ingestion (see the F3 runner guardrail).
 */

import { NextResponse } from "next/server";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { CrawlMethod, SweepSourcesResponse } from "@/lib/ingest/contract";

export const dynamic = "force-dynamic";

const CRAWL_VALUES: CrawlMethod[] = ["rss", "sitemap", "html_scrape", "api"];

export async function GET(req: Request) {
  const auth = checkIngestAuth(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(req.url);
  const methodParam = url.searchParams.get("method");
  // Default to rss: the scheduled sweep is an RSS runner. Other kinds opt in
  // explicitly so a future scraper workflow can share this endpoint.
  const method = (methodParam ?? "rss") as CrawlMethod;
  if (!CRAWL_VALUES.includes(method)) {
    return NextResponse.json(
      { error: `method must be one of ${CRAWL_VALUES.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("discovery_sources")
    .select(
      "code, name, feed_url, crawl_method, layer, status, signal_only_eligible, paused_until",
    )
    .eq("crawl_method", method)
    .neq("status", "paused")
    .order("code", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to read source registry" },
      { status: 500 },
    );
  }

  const now = Date.now();
  const sources = (data ?? [])
    .filter((s) => {
      if (!s.feed_url) return false;
      if (!s.paused_until) return true;
      const until = new Date(s.paused_until).getTime();
      return Number.isNaN(until) ? true : until <= now;
    })
    .map((s) => ({
      code: s.code,
      name: s.name,
      feed_url: s.feed_url as string,
      crawl_method: s.crawl_method as CrawlMethod,
      layer: s.layer as string,
      status: s.status as string,
      signal_only_eligible: Boolean(s.signal_only_eligible),
    }));

  const body: SweepSourcesResponse = { method, count: sources.length, sources };
  return NextResponse.json(body, { status: 200 });
}
