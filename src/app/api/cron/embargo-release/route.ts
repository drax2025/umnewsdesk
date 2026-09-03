/**
 * Embargo release cron.
 *
 * Restored alongside the IMAP poller: the poller holds embargoed releases at
 * `triage_state = 'held_source'`, and without this they would stay held for
 * ever. Flips any candidate whose parsed `embargo_until` is now in the past
 * back to 'ready' so it reaches the triage queue.
 *
 * A hold with **no** `embargo_until` is deliberately not released — the machine
 * could not read a lift time, so a person supplies one. Releasing those on a
 * timer would be the one failure mode worth avoiding: publishing early.
 *
 * Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET`; the same token
 * is accepted in the query string for manual runs.
 *
 * Idempotent: a re-run picks up nothing, because the same candidates are
 * already 'ready'.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
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

  // Only triage_state moves. The previous version also reset
  // verification_state to 'pending', which would now undo the attribution the
  // IMAP path establishes — a release read from the mailbox with a known agency
  // domain is genuinely verified, and an embargo lifting says nothing about that.
  const { data: released, error } = await supabase
    .from("candidates")
    .update({ triage_state: "ready" })
    .eq("triage_state", "held_source")
    .not("embargo_until", "is", null)
    .lte("embargo_until", nowIso)
    .select("id, code, embargo_until");

  if (error) {
    console.error("[EMBARGO-RELEASE] update failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { released_count: released?.length ?? 0, released: released ?? [], ran_at: nowIso },
    { status: 200 },
  );
}
