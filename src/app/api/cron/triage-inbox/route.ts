import { NextResponse } from "next/server";
import type { ParsedMail } from "mailparser";
import { createServiceClient } from "@/lib/supabase/service";
import { mailboxConfigFromEnv, readNewInbox, moveMessages } from "@/lib/ingest/mailbox";
import { triage, type TriageDecision } from "@/lib/ingest/triage";

/**
 * GET /api/cron/triage-inbox
 *
 * Sorts the unsorted Zoho INBOX into folders. Press releases go to
 * PR/To Process, where the mailbox poller picks them up; commercial mail goes
 * to its own folders; wire traffic and anything unrecognised stay put for a
 * person. Nothing is ever routed to Spam — a misfiled client enquiry costs
 * more than an unfiled one.
 *
 * Ported from Newsroom V1, which is losing its copy in the same change. Two
 * triage jobs on one INBOX would race the way the two pollers did: whichever
 * ran first would move the message, and the other would report having seen
 * nothing.
 *
 * Progress is a UID high-water mark rather than the unseen flag, so a person
 * reading mail in Zoho cannot make messages invisible to this. The mark is
 * advanced only after the moves succeed, so a failure means the next run
 * retries rather than skips.
 *
 *   ?dry=1       classify and report, move nothing, do not advance the mark
 *   ?preview=N   classify the last N messages regardless of the mark
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Long enough for a backlog; a slow mailbox must not truncate a run silently.
export const maxDuration = 300;

const WATERMARK_KEY = "inbox_triage_uid";
const LAST_RUN_KEY = "inbox_triage_last_run";

/** Stamped on every message the newsroom sends, so its own digests are not read as releases. */
const APP_MAIL_HEADER = "x-union-newsroom";

const INTERNAL_DOMAINS = (
  process.env.INTERNAL_DOMAINS || "unionmedia.news,unionmedianews.com,unionmediainc.com"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const isInternal = (address: string): boolean => {
  const domain = String(address || "").split("@")[1]?.toLowerCase() || "";
  return INTERNAL_DOMAINS.includes(domain);
};

const sentByTheApp = (parsed: ParsedMail): boolean =>
  (parsed.headerLines || []).some(
    (h) => String(h.key || "").toLowerCase() === APP_MAIL_HEADER,
  );

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

type Decision = TriageDecision & {
  uid: number;
  fromEmail: string;
  subject: string;
  messageId: string;
};

function decide(uid: number, parsed: ParsedMail): Decision {
  const fromEmail = parsed.from?.value?.[0]?.address || "";
  const d = triage({
    fromEmail,
    fromName: parsed.from?.value?.[0]?.name || "",
    subject: parsed.subject || "",
    bodySample: String(parsed.text || "").slice(0, 2000),
    forwardedByUs: isInternal(fromEmail),
    sentByTheApp: sentByTheApp(parsed),
  });
  return {
    ...d,
    uid,
    fromEmail,
    subject: parsed.subject || "",
    messageId: String(parsed.messageId || ""),
  };
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
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

  const dryRun = url.searchParams.get("dry") === "1";
  const supabase = createServiceClient();

  try {
    const { data: mark } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", WATERMARK_KEY)
      .maybeSingle<{ value: unknown }>();

    // Classify recent mail without moving anything, so the rules can be judged
    // on real traffic before they are turned loose on it.
    const previewParam = url.searchParams.get("preview");
    if (previewParam) {
      const back = Math.min(Number(previewParam) || 20, 100);
      const all = await readNewInbox(config, config.source, 0, 0);
      const { messages } = await readNewInbox(
        config,
        config.source,
        Math.max(0, all.highestUid - back * 3),
        back,
      );
      return NextResponse.json({
        preview: true,
        decisions: messages.slice(-back).map(({ uid, parsed }) => {
          const d = decide(uid, parsed);
          return { ...d, subject: d.subject.slice(0, 70) };
        }),
      });
    }

    // First run records where the inbox is and processes nothing. "New messages
    // from now on" has to start somewhere, and the alternative is triaging
    // years of history on the first tick.
    if (!mark) {
      const { highestUid } = await readNewInbox(config, config.source, 0, 0);
      if (!dryRun) {
        await supabase
          .from("app_settings")
          .upsert({ key: WATERMARK_KEY, value: highestUid, updated_at: new Date().toISOString() });
      }
      console.log(`[TRIAGE] first run — watermark ${dryRun ? "would be" : "set"} at uid ${highestUid}`);
      return NextResponse.json({ firstRun: true, watermark: highestUid, processed: 0 });
    }

    const sinceUid = Number(mark.value) || 0;
    const { messages, highestUid } = await readNewInbox(config, config.source, sinceUid);

    const decisions = messages.map(({ uid, parsed }) => decide(uid, parsed));
    const moves = decisions
      .filter((d) => d.moveTo)
      .map((d) => ({ uid: d.uid, to: d.moveTo as string }));

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        since: sinceUid,
        seen: decisions.length,
        wouldMove: moves.length,
        decisions,
      });
    }

    const outcome = await moveMessages(config, config.source, moves);

    if (decisions.length) {
      // Every decision is recorded, including the ones that moved nothing —
      // "why was this left in the inbox" is the question people actually ask.
      await supabase.from("triage_log").insert(
        decisions.map((d) => ({
          uid: d.uid,
          message_id: d.messageId.slice(0, 512),
          from_email: d.fromEmail.slice(0, 255),
          subject: d.subject.slice(0, 512),
          category: d.category,
          moved_to: d.moveTo,
          reason: d.reason.slice(0, 255),
        })),
      );
    }

    // Advanced only after the moves, so a failure retries rather than skips.
    const now = new Date().toISOString();
    await supabase.from("app_settings").upsert([
      { key: WATERMARK_KEY, value: highestUid, updated_at: now },
      { key: LAST_RUN_KEY, value: now, updated_at: now },
    ]);

    if (decisions.length) {
      console.log(
        `[TRIAGE] ${decisions.length} new message(s), ${outcome.moved} filed, ${decisions.length - moves.length} left in the inbox`,
      );
    }
    return NextResponse.json({
      seen: decisions.length,
      filed: outcome.moved,
      left: decisions.length - moves.length,
      errors: outcome.errors,
      watermark: highestUid,
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[TRIAGE] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
