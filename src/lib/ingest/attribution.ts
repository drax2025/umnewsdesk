import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Crediting a story to the outlet that published it, not the feed that found it.
 *
 * An aggregator carries other outlets' work. "Silicon Scotland Feed" is an
 * rss.app feed registered as L2, and 272 of its stories are DIGIT's and 60 are
 * FutureScot's — both of which are registered separately as **L4 signal-only**.
 * Because the aggregator sweeps first, those stories entered as ordinary L2
 * material, the signal-only badge never showed, and the F3 drafting guardrail
 * never fired. The direct feeds meanwhile produced nothing at all: their items
 * were already here, so dedup rejected them, correctly.
 *
 * Per spec §B2 the sourcing rule is about the **outlet**, not the pipe: a story
 * carried only by DIGIT or FutureScot cannot run without an independent primary
 * source. So the item's own host decides, whichever feed delivered it.
 *
 * Data-driven rather than a hardcoded list: the registry already knows that
 * digit.fyi is L4 signal-only, because someone registered it that way. Adding a
 * source is enough — nothing here needs editing.
 *
 * A source is matched on its feed's host *and* on `article_hosts`, for the two
 * cases where those differ: a feed served from a delivery domain (the BBC's
 * feeds are on feeds.bbci.co.uk, its articles on bbc.co.uk and bbc.com) and a
 * feed fronted by a third party (an rss.app feed's host is rss.app, which no
 * article will ever match).
 */

export type HostSource = {
  id: string;
  code: string;
  layer: string | null;
  stream_id: string | null;
};

/** Lowercased, without a leading "www." — how hosts are compared here. */
export function registrableHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * host → the source that publishes it.
 *
 * Only sources whose feed sits on the outlet's own domain are indexed. An
 * aggregator's feed lives on the aggregator's domain (`rss.app`), which no
 * article URL will ever match, so aggregators cannot claim other outlets' work.
 */
export async function buildHostIndex(
  supabase: SupabaseClient,
): Promise<Map<string, HostSource>> {
  /**
   * `article_hosts` is read tolerantly.
   *
   * Migrations here are applied by hand and one has gone unnoticed for months
   * before. If this column is missing, selecting it fails and the whole index
   * comes back empty — which would silently stop attributing *anything*, a far
   * worse outcome than losing the aliases. So a missing column falls back to
   * matching on the feed host alone, and says so in the log.
   */
  type SourceRow = {
    id: string; code: string; layer: string | null;
    stream_id: string | null; feed_url: string | null;
    article_hosts?: string[] | null;
  };
  const COLS = "id, code, layer, stream_id, feed_url";
  let rows: SourceRow[] = [];
  const withHosts = await supabase
    .from("discovery_sources")
    .select(`${COLS}, article_hosts`);
  if (withHosts.error) {
    console.warn(
      "[attribution] article_hosts unavailable, matching on feed host only — " +
        "apply supabase/migrations/0048_source_article_hosts.sql. " +
        withHosts.error.message,
    );
    const plain = await supabase.from("discovery_sources").select(COLS);
    rows = (plain.data ?? []) as SourceRow[];
  } else {
    rows = (withHosts.data ?? []) as SourceRow[];
  }

  const data = rows;
  const index = new Map<string, HostSource>();
  for (const s of data) {
    const entry: HostSource = {
      id: s.id,
      code: s.code,
      layer: s.layer ?? null,
      stream_id: s.stream_id ?? null,
    };
    const hosts = [
      registrableHost(s.feed_url),
      ...(s.article_hosts ?? []).map((h) =>
        String(h || "").toLowerCase().trim().replace(/^www\./, "") || null,
      ),
    ].filter((h): h is string => !!h);
    for (const host of hosts) {
      // First registration of a host wins; a duplicate would be a registry
      // problem to fix there rather than silently resolve here.
      if (!index.has(host)) index.set(host, entry);
    }
  }
  return index;
}

/**
 * The source a story should be credited to, when that is not the one that
 * found it. Null means leave the attribution alone.
 */
export function attributeByHost(
  primaryUrl: string | null,
  carryingSourceId: string,
  index: Map<string, HostSource>,
): HostSource | null {
  const host = registrableHost(primaryUrl);
  if (!host) return null;
  const owner = index.get(host);
  if (!owner || owner.id === carryingSourceId) return null;
  return owner;
}
