import { NextResponse } from "next/server";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { nextAlertCode } from "@/lib/ingest/codes";
import { createServiceClient } from "@/lib/supabase/service";
import type { IngestAlertBody, IngestAlertResponse } from "@/lib/ingest/contract";

export const dynamic = "force-dynamic";

const SEVERITIES = new Set(["p1", "p2", "p3"]);
const ISSUE_TYPES = new Set([
  "parse_failure",
  "unreachable",
  "rate_limit",
  "schema_drift",
  "volume_anomaly",
  "wordpress_check",
  "config",
  "timeout",
]);

// SLA windows (hours) per severity. Mirrors the OPS-RR runbook intent —
// p1 within an hour, p2 same shift, p3 next sweep.
const SLA_HOURS: Record<string, number> = { p1: 1, p2: 4, p3: 24 };

export async function POST(req: Request) {
  const auth = checkIngestAuth(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  let body: IngestAlertBody;
  try {
    body = (await req.json()) as IngestAlertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  if (typeof body.source_code !== "string" || !body.source_code) {
    return NextResponse.json({ error: "source_code is required" }, { status: 400 });
  }
  if (!SEVERITIES.has(body.severity)) {
    return NextResponse.json({ error: "severity must be p1|p2|p3" }, { status: 400 });
  }
  if (!ISSUE_TYPES.has(body.issue_type)) {
    return NextResponse.json({ error: "invalid issue_type" }, { status: 400 });
  }
  if (typeof body.description !== "string" || body.description.trim().length < 4) {
    return NextResponse.json(
      { error: "description must be a non-trivial string" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: source } = await supabase
    .from("discovery_sources")
    .select("id")
    .eq("code", body.source_code)
    .maybeSingle();
  if (!source) {
    return NextResponse.json(
      { error: `Unknown source_code '${body.source_code}'` },
      { status: 404 },
    );
  }

  let sweepId: string | null = null;
  if (body.sweep_id) {
    const { data: sweep } = await supabase
      .from("sweep_runs")
      .select("id")
      .eq("id", body.sweep_id)
      .maybeSingle();
    if (sweep) sweepId = sweep.id;
  }

  // Dedup against an already-open alert of the same (source, issue_type).
  // We bump the description + severity (if escalated) on the existing row
  // rather than spawning duplicates the editorial team has to triage.
  const { data: existing } = await supabase
    .from("ops_rr_alerts")
    .select("id, code, severity, description, status")
    .eq("source_id", source.id)
    .eq("issue_type", body.issue_type)
    .in("status", ["open", "investigating"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const newSeverity = severityMax(existing.severity, body.severity);
    const slaDeadline = new Date(
      Date.now() + SLA_HOURS[newSeverity] * 3_600_000,
    ).toISOString();

    await supabase
      .from("ops_rr_alerts")
      .update({
        severity: newSeverity,
        description: body.description.trim(),
        sweep_run_id: sweepId ?? undefined,
        sla_deadline_at: slaDeadline,
      })
      .eq("id", existing.id);

    const res: IngestAlertResponse = {
      alert_id: existing.id,
      alert_code: existing.code,
      state: "updated",
    };
    return NextResponse.json(res);
  }

  const code = await nextAlertCode(supabase);
  const slaDeadline = new Date(
    Date.now() + SLA_HOURS[body.severity] * 3_600_000,
  ).toISOString();

  const { data: inserted, error } = await supabase
    .from("ops_rr_alerts")
    .insert({
      code,
      source_id: source.id,
      sweep_run_id: sweepId,
      severity: body.severity,
      issue_type: body.issue_type,
      status: "open",
      description: body.description.trim(),
      sla_deadline_at: slaDeadline,
      auto_raised: true,
    })
    .select("id, code")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create alert" },
      { status: 500 },
    );
  }

  const res: IngestAlertResponse = {
    alert_id: inserted.id,
    alert_code: inserted.code,
    state: "created",
  };
  return NextResponse.json(res, { status: 201 });
}

function severityMax(a: string, b: string): "p1" | "p2" | "p3" {
  const rank: Record<string, number> = { p1: 3, p2: 2, p3: 1 };
  return ((rank[a] ?? 0) >= (rank[b] ?? 0) ? a : b) as "p1" | "p2" | "p3";
}
