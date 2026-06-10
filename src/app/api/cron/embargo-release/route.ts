/**
 * Embargo release cron.
 *
 * Runs every 15 min (see vercel.json). Flips any candidate that:
 *   - was held by the email ingest path (triage_state = 'held_source')
 *   - has a parsed embargo_until timestamp now in the past
 * back to 'ready' so it shows up in the F1 triage queue.
 *
 * Auth: Vercel cron requests carry `Authorization: Bearer $CRON_SECRET`.
 * We allow that OR a manual call with the same token in the query string,
 * so you can re-trigger from a browser / curl while testing.
 *
 * Idempotent: re-running picks up nothing because the same candidates are
 * already in 'ready'.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const header = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1] ?? "";
  const query = url.searchParams.get("token") ?? "";
  if (!timingSafeEqual(bearer, secret) && !timingSafeEqual(query, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: released, error } = await supabase
    .from("candidates")
    .update({ triage_state: "ready", verification_state: "pending" })
    .eq("triage_state", "held_source")
    .not("embargo_until", "is", null)
    .lte("embargo_until", nowIso)
    .select("id, code, embargo_until");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      released_count: released?.length ?? 0,
      released: released ?? [],
      ran_at: nowIso,
    },
    { status: 200 },
  );
}

// POST mirrors GET so Vercel cron (which always uses GET) and any manual
// retry tooling both work without remembering the method.
export const POST = GET;

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
