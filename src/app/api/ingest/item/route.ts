import { NextResponse } from "next/server";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { nextCandidateCode } from "@/lib/ingest/codes";
import { checkDedup } from "@/lib/ingest/dedup";
import {
  canonicalizeUrl,
  extractImageUrl,
  normalizeHeadline,
  safeIso,
  safeTrim,
} from "@/lib/ingest/normalize";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  IngestItemBody,
  IngestItemResponse,
  ItemKind,
} from "@/lib/ingest/contract";

export const dynamic = "force-dynamic";

const KINDS = new Set<ItemKind>(["rss", "email", "pdf", "web", "generic"]);

export async function POST(req: Request) {
  const auth = checkIngestAuth(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  let body: IngestItemBody;
  try {
    body = (await req.json()) as IngestItemBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  if (typeof body.sweep_id !== "string" || !body.sweep_id) {
    return NextResponse.json({ error: "sweep_id is required" }, { status: 400 });
  }
  if (typeof body.source_code !== "string" || !body.source_code) {
    return NextResponse.json({ error: "source_code is required" }, { status: 400 });
  }
  if (!KINDS.has(body.kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!body.item || typeof body.item !== "object") {
    return NextResponse.json({ error: "item is required" }, { status: 400 });
  }

  const headline = safeTrim(body.item.headline, 400);
  if (!headline) {
    return NextResponse.json(
      { error: "item.headline is required (non-empty string)" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Resolve sweep + source in parallel
  const [{ data: sweep }, { data: source }] = await Promise.all([
    supabase
      .from("sweep_runs")
      .select("id, status")
      .eq("id", body.sweep_id)
      .maybeSingle(),
    supabase
      .from("discovery_sources")
      .select("id, layer, stream_id, status")
      .eq("code", body.source_code)
      .maybeSingle(),
  ]);

  if (!sweep) {
    return NextResponse.json({ error: "Unknown sweep_id" }, { status: 404 });
  }
  if (sweep.status === "complete" || sweep.status === "failed") {
    return NextResponse.json(
      { error: `Sweep is ${sweep.status} — cannot ingest items` },
      { status: 409 },
    );
  }
  if (!source) {
    return NextResponse.json(
      { error: `Unknown source_code '${body.source_code}'` },
      { status: 404 },
    );
  }
  if (source.status === "paused") {
    return NextResponse.json(
      { error: "Source is paused — ingestion rejected", code: "SOURCE_PAUSED" },
      { status: 409 },
    );
  }

  const primaryUrl = canonicalizeUrl(body.item.primary_url ?? null);
  const externalId = safeTrim(body.item.external_id, 256);
  const headlineNorm = normalizeHeadline(headline);

  const dedup = await checkDedup(supabase, {
    source_id: source.id,
    external_id: externalId,
    primary_url_canonical: primaryUrl,
    headline_normalized: headlineNorm,
  });

  // Duplicate: do NOT insert a new candidate. Return the matched id so
  // the runner can record the link if it wants to. Still cheap to be
  // explicit about why we deduped.
  if (dedup.state === "duplicate") {
    const res: IngestItemResponse = {
      candidate_id: null,
      candidate_code: null,
      dedup_state: "duplicate",
      duplicate_reason: dedup.reason,
      matched_candidate_id: dedup.matched_candidate_id,
    };
    return NextResponse.json(res, { status: 200 });
  }

  // Clear: insert a new candidate.
  const code = await nextCandidateCode(supabase);
  const fetchedAt =
    safeIso(body.fetched_at) ?? new Date().toISOString();
  const publishedAt = safeIso(body.item.published_at);

  const tags = Array.isArray(body.item.tags)
    ? body.item.tags
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .slice(0, 16)
    : [];

  const raw = body.item.raw && typeof body.item.raw === "object"
    ? body.item.raw
    : null;

  const imageUrl = safeTrim(body.item.image_url, 2000) ?? extractImageUrl(raw);

  const { data: inserted, error } = await supabase
    .from("candidates")
    .insert({
      code,
      sweep_run_id: sweep.id,
      source_id: source.id,
      stream_id: source.stream_id,
      layer: source.layer,
      working_headline: headline,
      primary_url: primaryUrl,
      external_id: externalId,
      kind: body.kind,
      summary: safeTrim(body.item.summary, 2000),
      body_text: safeTrim(body.item.body_text, 100_000),
      author: safeTrim(body.item.author, 200),
      image_url: imageUrl,
      tags,
      raw,
      fetched_at: fetchedAt,
      published_at: publishedAt,
      dedup_state: "clear",
      triage_state: "ready",
      verification_state: "pending",
      risk: "low",
    })
    .select("id, code")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to insert candidate" },
      { status: 500 },
    );
  }

  const res: IngestItemResponse = {
    candidate_id: inserted.id,
    candidate_code: inserted.code,
    dedup_state: "clear",
  };
  return NextResponse.json(res, { status: 201 });
}
