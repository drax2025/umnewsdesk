import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createServiceClient } from "@/lib/supabase/service";
import { mailboxConfigFromEnv } from "@/lib/ingest/mailbox";

/**
 * GET /api/cron/triage-digest
 *
 * What the inbox triage decided, so a wrong decision is seen rather than
 * buried. Moved here from Newsroom V1 along with triage itself: the report
 * has to live where the log does, and V1's copy would have emailed zeros
 * every morning while News Desk quietly did the work.
 *
 * Sent over the same Zoho account the mailbox authenticates as. The
 * X-Union-Newsroom header is what stops it being read back as a press release
 * on the next triage run — it lands in the very inbox this reports on.
 *
 *   ?hours=N   window, default 24, capped at a week
 *   ?dry=1     render and return without sending
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const APP_MAIL_HEADER = "X-Union-Newsroom";

type Row = {
  decided_at: string;
  from_email: string | null;
  subject: string | null;
  category: string;
  moved_to: string | null;
  reason: string | null;
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FONT = "-apple-system,Segoe UI,Helvetica,Arial,sans-serif";

function section(title: string, items: Row[], showFolder: boolean): string {
  if (!items.length) return "";
  return `
    <h2 style="font:600 13px/1 ${FONT};color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 8px">${esc(title)} (${items.length})</h2>
    <table style="width:100%;border-collapse:collapse">
      ${items.map((i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font:400 12px/1.4 ${FONT};color:#64748b;white-space:nowrap;vertical-align:top">${esc(i.from_email)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font:500 13px/1.4 ${FONT};color:#1e293b">${esc(i.subject)}
          <div style="font:400 11px/1.4 ${FONT};color:#94a3b8;margin-top:2px">${esc(i.reason)}</div></td>
        ${showFolder ? `<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font:400 11px/1.4 ui-monospace,Menlo,monospace;color:#64748b;white-space:nowrap;vertical-align:top">${esc(i.moved_to)}</td>` : ""}
      </tr>`).join("")}
    </table>`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const url = new URL(req.url);
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const token = bearer || url.searchParams.get("token") || "";
  if (!timingSafeEqual(token, secret)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const hours = Math.min(Number(url.searchParams.get("hours")) || 24, 168);
  const dryRun = url.searchParams.get("dry") === "1";
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  try {
    const supabase = createServiceClient();
    const [{ data: rowsRaw }, { data: lastRunRow }] = await Promise.all([
      supabase
        .from("triage_log")
        .select("decided_at, from_email, subject, category, moved_to, reason")
        .gte("decided_at", since)
        .order("category")
        .order("decided_at", { ascending: false })
        .returns<Row[]>(),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "inbox_triage_last_run")
        .maybeSingle<{ value: unknown }>(),
    ]);

    const rows = rowsRaw ?? [];
    const byCategory = (c: string) => rows.filter((r) => r.category === c);
    const filed = rows.filter((r) => r.moved_to);
    const left = rows.filter((r) => !r.moved_to);
    const subject = `Inbox triage: ${filed.length} filed, ${left.length} left for you`;

    // Silence is the failure mode worth shouting about: an empty digest reads
    // the same whether nothing arrived or triage stopped running.
    const lastRun = lastRunRow?.value ? new Date(String(lastRunRow.value)) : null;
    const staleHours = lastRun ? Math.floor((Date.now() - lastRun.getTime()) / 3600_000) : null;
    const staleWarning = !lastRun
      ? "Triage has never run."
      : staleHours !== null && staleHours >= 6
        ? `Triage has not run for ${staleHours} hours.`
        : null;

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc">
      <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px">
        <h1 style="font:700 20px/1.3 ${FONT};color:#1e293b;margin:0">Inbox triage</h1>
        <p style="font:400 14px/1.5 ${FONT};color:#64748b;margin:4px 0 16px">Last ${hours} hours · News Desk</p>
        ${staleWarning ? `<p style="font:600 13px/1.5 ${FONT};color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px">${esc(staleWarning)}</p>` : ""}
        ${section("Press releases filed", byCategory("pr"), true)}
        ${section("High value", byCategory("high-value"), true)}
        ${section("Link builders", byCategory("link-builder"), true)}
        ${section("Wire services — left in the inbox", byCategory("wire"), false)}
        ${section("Not recognised — left in the inbox", byCategory("unknown"), false)}
        ${rows.length === 0 ? `<p style="font:400 14px/1.5 ${FONT};color:#94a3b8">Nothing arrived.</p>` : ""}
      </div></body></html>`;

    const text = [
      `Inbox triage — last ${hours} hours`,
      "",
      staleWarning ? `WARNING: ${staleWarning}` : "",
      `Filed: ${filed.length}`,
      `Left in the inbox: ${left.length}`,
      "",
      ...rows.map((r) => `  [${r.category}] ${r.from_email} — ${r.subject}${r.moved_to ? ` -> ${r.moved_to}` : ""}`),
    ].filter(Boolean).join("\n");

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        subject,
        counts: { filed: filed.length, left: left.length },
        staleWarning,
        text,
      });
    }

    const config = mailboxConfigFromEnv();
    if (!config) return NextResponse.json({ error: "SMTP is not configured" }, { status: 503 });
    const to = process.env.TRIAGE_DIGEST_TO;
    if (!to) {
      return NextResponse.json(
        { error: "TRIAGE_DIGEST_TO is not set — nobody to send the digest to" },
        { status: 503 },
      );
    }
    const from = process.env.DIGEST_FROM || config.user;

    await nodemailer
      .createTransport({
        host: process.env.SMTP_HOST || "smtp.zoho.eu",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: { user: config.user, pass: config.pass },
      })
      .sendMail({
        from: `Union Media News Desk <${from}>`,
        to,
        headers: { [APP_MAIL_HEADER]: "triage-digest" },
        replyTo: from,
        subject,
        html,
        text,
      });

    console.log(`[TRIAGE] digest sent: ${subject}`);
    return NextResponse.json({ sent: true, subject, filed: filed.length, left: left.length });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[TRIAGE] digest failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
