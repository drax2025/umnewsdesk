"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextSourceCode } from "@/lib/ingest/codes";

type SourceStatus = "active" | "warning" | "critical" | "paused";
type SourceLayer = "l1" | "l2" | "l3" | "l4";
type CrawlMethod = "rss" | "sitemap" | "html_scrape" | "api";

const STATUS_VALUES: SourceStatus[] = ["active", "warning", "critical", "paused"];
const LAYER_VALUES: SourceLayer[] = ["l1", "l2", "l3", "l4"];
const CRAWL_VALUES: CrawlMethod[] = ["rss", "sitemap", "html_scrape", "api"];

const REVALIDATE_PATHS = [
  "/system/discovery-config",
  "/system/source-health",
  "/discovery",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

export type SourceActionResult =
  | { ok: true; id?: string; code?: string }
  | { ok: false; error: string };

function validateUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function updateSourceStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SourceStatus;
  if (!id || !STATUS_VALUES.includes(status)) return;
  const supabase = await createClient();
  await supabase.from("discovery_sources").update({ status }).eq("id", id);
  revalidateAll();
}

export async function updateSourceExclusivity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("exclusivity_window_hours") ?? "");
  const hours = Number.parseInt(raw, 10);
  if (!id || !Number.isFinite(hours) || hours < 0 || hours > 720) return;
  const supabase = await createClient();
  await supabase
    .from("discovery_sources")
    .update({ exclusivity_window_hours: hours })
    .eq("id", id);
  revalidateAll();
}

export async function toggleSourceSignalOnly(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("signal_only_eligible") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("discovery_sources")
    .update({ signal_only_eligible: next })
    .eq("id", id);
  revalidateAll();
}

/**
 * Create a new discovery source. Code is auto-issued as `SRC-NNNN`.
 * Validates the four enum-like fields and the feed URL before insert,
 * returning a structured result the client form uses to surface errors
 * inline rather than blowing up the request.
 */
export async function createSource(formData: FormData): Promise<SourceActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const feed_url = String(formData.get("feed_url") ?? "").trim();
  const crawl_method = String(formData.get("crawl_method") ?? "") as CrawlMethod;
  const layer = String(formData.get("layer") ?? "") as SourceLayer;
  const status = String(formData.get("status") ?? "active") as SourceStatus;
  const exclRaw = String(formData.get("exclusivity_window_hours") ?? "48");
  const signal_only_eligible = formData.get("signal_only_eligible") === "on";

  if (name.length < 2) return { ok: false, error: "Name must be at least 2 characters" };
  if (!validateUrl(feed_url)) return { ok: false, error: "Feed URL must be a valid http(s) URL" };
  if (!CRAWL_VALUES.includes(crawl_method)) return { ok: false, error: "Invalid crawl method" };
  if (!LAYER_VALUES.includes(layer)) return { ok: false, error: "Invalid layer" };
  if (!STATUS_VALUES.includes(status)) return { ok: false, error: "Invalid status" };

  const hours = Number.parseInt(exclRaw, 10);
  if (!Number.isFinite(hours) || hours < 0 || hours > 720) {
    return { ok: false, error: "Exclusivity window must be 0–720 hours" };
  }

  const stream_raw = String(formData.get("stream_id") ?? "");
  const stream_id = stream_raw && stream_raw !== "none" ? stream_raw : null;

  const supabase = await createClient();
  const code = await nextSourceCode(supabase);

  const { data, error } = await supabase
    .from("discovery_sources")
    .insert({
      code,
      name,
      feed_url,
      crawl_method,
      layer,
      status,
      exclusivity_window_hours: hours,
      signal_only_eligible,
      stream_id,
    })
    .select("id, code")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create source" };
  }

  revalidateAll();
  return { ok: true, id: data.id, code: data.code };
}

/**
 * Full edit of a source row — name, feed URL, crawl method, layer.
 * Inline cells already cover status/exclusivity/signal-only, so this
 * action is the "open the drawer" path for everything else.
 */
export async function updateSource(formData: FormData): Promise<SourceActionResult> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const feed_url = String(formData.get("feed_url") ?? "").trim();
  const crawl_method = String(formData.get("crawl_method") ?? "") as CrawlMethod;
  const layer = String(formData.get("layer") ?? "") as SourceLayer;

  if (!id) return { ok: false, error: "Missing id" };
  if (name.length < 2) return { ok: false, error: "Name must be at least 2 characters" };
  if (!validateUrl(feed_url)) return { ok: false, error: "Feed URL must be a valid http(s) URL" };
  if (!CRAWL_VALUES.includes(crawl_method)) return { ok: false, error: "Invalid crawl method" };
  if (!LAYER_VALUES.includes(layer)) return { ok: false, error: "Invalid layer" };

  const stream_raw = String(formData.get("stream_id") ?? "");
  const stream_id = stream_raw && stream_raw !== "none" ? stream_raw : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("discovery_sources")
    .update({ name, feed_url, crawl_method, layer, stream_id })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true, id };
}

/**
 * Hard-delete a source. Foreign keys on candidates/sweep_site_results
 * cascade or set-null per the schema, so this is safe — but the UI
 * should still gate it behind a confirmation since it loses history
 * context for any candidates that originated here.
 */
export async function deleteSource(formData: FormData): Promise<SourceActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id" };

  const supabase = await createClient();
  const { error } = await supabase.from("discovery_sources").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}
