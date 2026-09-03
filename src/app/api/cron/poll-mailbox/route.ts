/**
 * Poll the PR mailbox and turn what is waiting into candidates.
 *
 * Replaces the Postmark inbound webhook, which stopped delivering on
 * 3 July 2026 and which — even when it worked — only ever saw forwarded
 * copies. See `src/lib/ingest/mailbox.ts` for why reading IMAP directly is the
 * better door.
 *
 *   GET /api/cron/poll-mailbox              schedule-driven, stores and files
 *   GET /api/cron/poll-mailbox?dry=1        reports what it would create, moves nothing
 *   GET /api/cron/poll-mailbox?test=1       checks credentials and folders only
 *   GET /api/cron/poll-mailbox?limit=5      cap the batch
 *
 * Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET`. The same token
 * is accepted in the query string so a run can be triggered by hand while
 * testing.
 *
 * Node runtime, not edge: IMAP is a long-lived TLS socket.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ingestEmailMessage } from "@/lib/ingest/email-candidate";
import { mailboxConfigFromEnv, pollMailbox, testMailbox } from "@/lib/ingest/mailbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A slow mailbox must not silently truncate the batch mid-run.
export const maxDuration = 300;

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
  const token = bearer || url.searchParams.get("token") || "";
  if (!timingSafeEqual(token, secret)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const config = mailboxConfigFromEnv();
  if (!config) {
    return NextResponse.json(
      { error: "Mailbox not configured — set IMAP_HOST, IMAP_USER and IMAP_PASSWORD" },
      { status: 503 },
    );
  }

  // Credentials-and-folders check. Worth having as its own mode: the first
  // thing that goes wrong with IMAP is a folder named slightly differently
  // from what the config expects, and that is invisible from a failed poll.
  if (url.searchParams.get("test")) {
    try {
      return NextResponse.json({ test: true, ...(await testMailbox(config)) }, { status: 200 });
    } catch (e) {
      return NextResponse.json(
        { test: true, connected: false, error: (e as Error).message },
        { status: 502 },
      );
    }
  }

  const dryRun = !!url.searchParams.get("dry");
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25;

  const supabase = createServiceClient();

  try {
    const outcome = await pollMailbox(
      config,
      async ({ parsed }, { dryRun: dry }) => {
        const result = await ingestEmailMessage(supabase, parsed, { dryRun: dry });
        const subject = (parsed.subject ?? "(no subject)").slice(0, 80);
        if (result.state === "clear") {
          return `${result.candidate_code} ${result.agency ? `[${result.agency}] ` : ""}${subject}`;
        }
        if (result.state === "duplicate") {
          return `duplicate (${result.reason}) ${subject}`;
        }
        // A rejection is a real problem with the message, so let pollMailbox
        // file it under Failed rather than leaving it to be retried forever.
        throw new Error(`${result.reason} — ${subject}`);
      },
      { dryRun, limit },
    );

    return NextResponse.json({ ok: true, dryRun, watching: config.inbox, ...outcome }, { status: 200 });
  } catch (e) {
    console.error("[POLL-MAILBOX] run failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
