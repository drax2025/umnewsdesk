"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  canonicaliseInventoryUrl,
  tryCanonicalise,
  type InventorySource,
  type MasterContentInventoryRow,
} from "@/lib/spec/a2-inventory";

/**
 * A2 Master content inventory — server actions.
 *
 *   recordPublishedToInventory({ ... })  — internal helper, called by
 *                                          F8 publishArticle after a
 *                                          successful WordPress push.
 *   importInventoryRow(fd)               — editor-gated manual /
 *                                          legacy-backfill insert.
 *   updateInventoryRow(fd)               — editor edit of headline /
 *                                          silo / notes / sectors.
 *   deleteInventoryRow(fd)               — admin only — removes
 *                                          a row (typo / duplicate
 *                                          cleanup).
 *
 * All three persisted paths run through canonicaliseInventoryUrl so the
 * unique index dedupes irrespective of trailing slashes or query
 * strings.
 */

export type InventoryActionResult =
  | { ok: true; id?: string; canonical_url?: string }
  | { ok: false; error: string };

async function requireEditor(): Promise<InventoryActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (me?.role !== "editor" && me?.role !== "admin") {
    return { ok: false, error: "Editors only" };
  }
  return null;
}

async function requireSeniorEditor(): Promise<InventoryActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (me?.role !== "admin") {
    return { ok: false, error: "Admin only" };
  }
  return null;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  recordPublishedToInventory — F8 write-back                                */
/* -------------------------------------------------------------------------- */

export type RecordPublishedInput = {
  title_id: string;
  article_id: string;
  headline: string;
  url: string;
  silo?: string | null;
  sectors?: string[];
  published_at?: string | Date | null;
  notes?: string | null;
  created_by?: string | null;
};

/**
 * Best-effort write-back from F8 publishArticle. Idempotent — re-runs of
 * publishArticle (or retract → republish cycles) won't duplicate the
 * inventory row, thanks to the unique URL constraint + ON CONFLICT
 * update.
 *
 * Returns ok+id on success; on failure the caller (publishArticle)
 * already logged the failure to article_failure_log + article_publish_log
 * so we just surface the error string here.
 */
export async function recordPublishedToInventory(
  input: RecordPublishedInput,
): Promise<InventoryActionResult> {
  const url = tryCanonicalise(input.url);
  if (!url) return { ok: false, error: "Invalid live URL" };
  const headline = input.headline.trim();
  if (!headline) return { ok: false, error: "Missing headline" };
  if (!input.title_id) return { ok: false, error: "Missing title_id" };

  const publishedAt = input.published_at
    ? typeof input.published_at === "string"
      ? input.published_at.slice(0, 10)
      : input.published_at.toISOString().slice(0, 10)
    : null;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("master_content_inventory")
    .upsert(
      {
        title_id: input.title_id,
        article_id: input.article_id,
        headline,
        url,
        silo: input.silo ?? null,
        sectors: input.sectors ?? [],
        published_at: publishedAt,
        source: "native_publish" as InventorySource,
        notes: input.notes ?? null,
        imported_by: input.created_by ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "url" },
    )
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inventory");
  return { ok: true, id: data?.id, canonical_url: url };
}

/* -------------------------------------------------------------------------- */
/*  importInventoryRow — manual editor entry                                  */
/* -------------------------------------------------------------------------- */

function parseSectors(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 16);
}

function parsePublishedAt(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Expect YYYY-MM-DD; accept full timestamps and slice
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function parseSource(raw: unknown): InventorySource {
  const s = String(raw ?? "").trim();
  if (s === "native_publish" || s === "manual" || s === "legacy_import")
    return s;
  return "legacy_import";
}

export async function importInventoryRow(
  fd: FormData,
): Promise<InventoryActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const title_id = String(fd.get("title_id") ?? "").trim();
  const headline = String(fd.get("headline") ?? "").trim();
  const rawUrl = String(fd.get("url") ?? "").trim();
  const silo = String(fd.get("silo") ?? "").trim() || null;
  const sectors = parseSectors(fd.get("sectors"));
  const published_at = parsePublishedAt(fd.get("published_at"));
  const source = parseSource(fd.get("source"));
  const notes = String(fd.get("notes") ?? "").trim() || null;

  if (!title_id) return { ok: false, error: "Pick a title." };
  if (!headline) return { ok: false, error: "Headline is required." };
  if (!rawUrl) return { ok: false, error: "URL is required." };

  let url: string;
  try {
    url = canonicaliseInventoryUrl(rawUrl);
  } catch {
    return {
      ok: false,
      error: "URL must be a fully-qualified https:// link.",
    };
  }

  const admin = createServiceClient();
  const uid = await currentUserId();

  const { data, error } = await admin
    .from("master_content_inventory")
    .upsert(
      {
        title_id,
        headline,
        url,
        silo,
        sectors,
        published_at,
        source,
        notes,
        imported_by: uid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "url" },
    )
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inventory");
  return { ok: true, id: data?.id, canonical_url: url };
}

/* -------------------------------------------------------------------------- */
/*  updateInventoryRow                                                        */
/* -------------------------------------------------------------------------- */

export async function updateInventoryRow(
  fd: FormData,
): Promise<InventoryActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" };

  const headline = String(fd.get("headline") ?? "").trim();
  const silo = String(fd.get("silo") ?? "").trim() || null;
  const sectors = parseSectors(fd.get("sectors"));
  const published_at = parsePublishedAt(fd.get("published_at"));
  const notes = String(fd.get("notes") ?? "").trim() || null;

  if (!headline) return { ok: false, error: "Headline is required." };

  const admin = createServiceClient();
  const { error } = await admin
    .from("master_content_inventory")
    .update({
      headline,
      silo,
      sectors,
      published_at,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inventory");
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  deleteInventoryRow                                                        */
/* -------------------------------------------------------------------------- */

export async function deleteInventoryRow(
  fd: FormData,
): Promise<InventoryActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("master_content_inventory")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inventory");
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/*  searchInventoryCandidates — for F4 interlinker auto-suggest               */
/* -------------------------------------------------------------------------- */

/**
 * Returns up to `limit` inventory rows matching `query` (case-insensitive
 * substring against headline OR url), optionally scoped to a title and
 * preferring recent published_at (E4 mitigation — last 90 days first).
 */
export async function searchInventoryCandidates(args: {
  query: string;
  title_id?: string | null;
  limit?: number;
}): Promise<MasterContentInventoryRow[]> {
  const q = args.query.trim();
  if (!q) return [];
  const limit = Math.min(Math.max(args.limit ?? 12, 1), 30);

  const admin = createServiceClient();
  let req = admin
    .from("master_content_inventory")
    .select("*")
    .or(`headline.ilike.%${q}%,url.ilike.%${q}%`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (args.title_id) req = req.eq("title_id", args.title_id);

  const { data } = await req;
  return (data ?? []) as MasterContentInventoryRow[];
}
