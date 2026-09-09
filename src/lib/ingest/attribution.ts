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
  const { data } = await supabase
    .from("discovery_sources")
    .select("id, code, layer, stream_id, feed_url");
  const index = new Map<string, HostSource>();
  for (const s of data ?? []) {
    const host = registrableHost(s.feed_url as string | null);
    if (!host) continue;
    // First registration of a host wins; a duplicate would be a registry
    // problem to fix there rather than silently resolve here.
    if (!index.has(host)) {
      index.set(host, {
        id: s.id as string,
        code: s.code as string,
        layer: (s.layer as string) ?? null,
        stream_id: (s.stream_id as string) ?? null,
      });
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
