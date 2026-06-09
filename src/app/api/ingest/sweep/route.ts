import { NextResponse } from "next/server";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { nextSweepCode } from "@/lib/ingest/codes";
import { createServiceClient } from "@/lib/supabase/service";
import type { OpenSweepBody, OpenSweepResponse } from "@/lib/ingest/contract";

export const dynamic = "force-dynamic";

const SLOTS = new Set(["am", "pm"]);
const TRIGGERS = new Set(["scheduled", "manual", "webhook"]);

export async function POST(req: Request) {
  const auth = checkIngestAuth(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  let body: OpenSweepBody;
  try {
    body = (await req.json()) as OpenSweepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  if (!SLOTS.has(body.slot)) {
    return NextResponse.json({ error: "slot must be 'am' or 'pm'" }, { status: 400 });
  }
  const trigger = body.trigger ?? "scheduled";
  if (!TRIGGERS.has(trigger)) {
    return NextResponse.json({ error: "invalid trigger" }, { status: 400 });
  }

  const startedAt = body.started_at ? new Date(body.started_at) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    return NextResponse.json({ error: "started_at not a valid date" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const code = await nextSweepCode(supabase);

  const { data, error } = await supabase
    .from("sweep_runs")
    .insert({
      code,
      slot: body.slot,
      trigger,
      status: "running",
      started_at: startedAt.toISOString(),
    })
    .select("id, code")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to open sweep" },
      { status: 500 },
    );
  }

  const res: OpenSweepResponse = { sweep_id: data.id, sweep_code: data.code };
  return NextResponse.json(res, { status: 201 });
}
