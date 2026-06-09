import { NextResponse } from "next/server";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { CompleteSweepBody, CompleteSweepResponse } from "@/lib/ingest/contract";

export const dynamic = "force-dynamic";

const OUTCOMES = new Set([
  "reached_items",
  "reached_empty",
  "parse_failure",
  "not_reached",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = checkIngestAuth(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { id: sweepId } = await params;
  if (!sweepId) {
    return NextResponse.json({ error: "Missing sweep id" }, { status: 400 });
  }

  let body: CompleteSweepBody;
  try {
    body = (await req.json()) as CompleteSweepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body?.site_results)) {
    return NextResponse.json(
      { error: "site_results must be an array" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: sweep } = await supabase
    .from("sweep_runs")
    .select("id, status, started_at")
    .eq("id", sweepId)
    .single();
  if (!sweep) {
    return NextResponse.json({ error: "Sweep not found" }, { status: 404 });
  }
  if (sweep.status === "complete" || sweep.status === "failed") {
    return NextResponse.json(
      { error: `Sweep already ${sweep.status}` },
      { status: 409 },
    );
  }

  // Resolve source codes to ids in one round-trip.
  const codes = Array.from(new Set(body.site_results.map((r) => r.source_code)));
  const { data: sources } = await supabase
    .from("discovery_sources")
    .select("id, code")
    .in("code", codes);
  const codeToId = new Map((sources ?? []).map((s) => [s.code, s.id]));

  // Persist per-source results. Skip rows referencing unknown sources.
  const rows = body.site_results
    .filter((r) => OUTCOMES.has(r.outcome) && codeToId.has(r.source_code))
    .map((r) => ({
      sweep_run_id: sweepId,
      source_id: codeToId.get(r.source_code)!,
      outcome: r.outcome,
      http_status: r.http_status ?? null,
      candidate_count: r.candidate_count ?? 0,
      parse_issue_count: r.parse_issue_count ?? 0,
      failure_streak: 0,
      resolved_primary_url: r.resolved_primary_url ?? null,
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("sweep_site_results")
      .upsert(rows, { onConflict: "sweep_run_id,source_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Compute totals from authoritative tables, not from the runner's report.
  const { data: results } = await supabase
    .from("sweep_site_results")
    .select("outcome")
    .eq("sweep_run_id", sweepId);

  const sites_total = results?.length ?? 0;
  const reached_with_items =
    results?.filter((r) => r.outcome === "reached_items").length ?? 0;
  const reached_no_items =
    results?.filter((r) => r.outcome === "reached_empty").length ?? 0;
  const parse_failures =
    results?.filter((r) => r.outcome === "parse_failure").length ?? 0;
  const not_reached =
    results?.filter((r) => r.outcome === "not_reached").length ?? 0;

  const { count: candidates_total } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("sweep_run_id", sweepId);

  const { count: dedup_holds } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("sweep_run_id", sweepId)
    .eq("dedup_state", "duplicate");

  const completedAt = new Date();
  const startedMs = new Date(sweep.started_at).getTime();
  const duration_seconds = Math.max(
    0,
    Math.round((completedAt.getTime() - startedMs) / 1000),
  );

  // partial = some failures; complete = clean; failed = nothing reached
  const finalStatus: "complete" | "partial" | "failed" =
    sites_total === 0
      ? "failed"
      : parse_failures + not_reached > 0
        ? "partial"
        : "complete";

  await supabase
    .from("sweep_runs")
    .update({
      status: finalStatus,
      completed_at: completedAt.toISOString(),
      duration_seconds,
      sites_total,
      reached_with_items,
      reached_no_items,
      parse_failures,
      not_reached,
      candidates_total: candidates_total ?? 0,
      dedup_holds: dedup_holds ?? 0,
    })
    .eq("id", sweepId);

  const res: CompleteSweepResponse = {
    sweep_id: sweepId,
    status: finalStatus,
    totals: {
      sites_total,
      reached_with_items,
      reached_no_items,
      parse_failures,
      not_reached,
      candidates_total: candidates_total ?? 0,
      dedup_holds: dedup_holds ?? 0,
    },
  };
  return NextResponse.json(res);
}
