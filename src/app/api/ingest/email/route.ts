/**
 * Postmark Inbound webhook → candidates row.
 *
 * Wire-up:
 *   1. Add a custom Inbound Stream in Postmark.
 *   2. Set its webhook URL to https://<host>/api/ingest/email?token=$POSTMARK_INBOUND_SECRET
 *   3. Point the MX of inbound.<domain> at Postmark per their setup instructions.
 *
 * Auth: constant-time compare on a long random token in the URL query string.
 * Postmark doesn't HMAC-sign inbound webhooks; URL-based shared secret is the
 * documented pattern.
 *
 * Idempotency: candidates.message_id is uniquely indexed (migration 0014).
 * If Postmark redelivers the same MessageID we return 200 with the existing
 * candidate rather than 500ing or inserting a dup.
 *
 * Default cautious on embargo: any embargo phrase + unparseable date holds.
 * See src/lib/ingest/embargo.ts.
 */

import { NextResponse } from "next/server";
import {
  extractFromAttachments,
  type PostmarkAttachmentInput,
} from "@/lib/ingest/attachment-extract";
import { checkDedup } from "@/lib/ingest/dedup";
import { parseEmbargo } from "@/lib/ingest/embargo";
import { nextCandidateCode } from "@/lib/ingest/codes";
import { normalizeHeadline, safeIso, safeTrim } from "@/lib/ingest/normalize";
import {
  recoverOriginalSender,
  type RecoveredSender,
} from "@/lib/ingest/forwarded-sender";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type PostmarkHeader = { Name: string; Value: string };
type PostmarkInbound = {
  MessageID?: string;
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  To?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Headers?: PostmarkHeader[];
  Attachments?: PostmarkAttachmentInput[];
  Date?: string;
};

export async function POST(req: Request) {
  const secret = process.env.POSTMARK_INBOUND_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Inbound endpoint not configured (POSTMARK_INBOUND_SECRET missing)" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const token =
    url.searchParams.get("token") ?? req.headers.get("x-postmark-token") ?? "";
  if (!timingSafeEqual(token, secret)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: PostmarkInbound;
  try {
    body = (await req.json()) as PostmarkInbound;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = safeTrim(body.Subject, 400);
  if (!subject) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  const fromEmail = (body.FromFull?.Email ?? extractEmail(body.From))?.toLowerCase();
  if (!fromEmail) {
    return NextResponse.json({ error: "Could not parse From address" }, { status: 400 });
  }
  const fromDomain = fromEmail.split("@")[1] ?? "";

  // Prefer the RFC822 Message-ID over Postmark's own ID — gives us idempotency
  // across Postmark re-deliveries AND across forwards from multiple aliases.
  const rfc822 = body.Headers?.find(
    (h) => h.Name?.toLowerCase() === "message-id",
  )?.Value;
  const messageId = safeTrim(rfc822, 998) ?? safeTrim(body.MessageID, 998);
  if (!messageId) {
    return NextResponse.json({ error: "No Message-ID" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fast path: this exact message was already ingested.
  {
    const { data: existing } = await supabase
      .from("candidates")
      .select("id, code")
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          candidate_id: existing.id,
          candidate_code: existing.code,
          dedup_state: "duplicate",
          duplicate_reason: "message_id",
        },
        { status: 200 },
      );
    }
  }

  const inlineBody =
    safeTrim(body.TextBody, 100_000) ?? stripHtml(body.HtmlBody ?? "");

  // Try the first PDF/.docx attachment if the inline body is thin.
  // PR agencies often send the courtesy note inline + the actual release as an
  // attachment, so without this scoring would see no real content.
  const extracted = await extractFromAttachments(body.Attachments, inlineBody);
  const bodyText = extracted?.text ?? inlineBody;

  // Sender → agency → source. Two-pass match: envelope From first, then
  // (if no agency) try Reply-To / Resent-From / forwarded body markers so
  // a manually-forwarded press release from a known agency still attributes
  // correctly instead of falling through to PRESS_MAILBOX unverified.
  const envelopeAgency = fromDomain
    ? (
        await supabase
          .from("press_agencies")
          .select("id, name, source_id, trust_tier")
          .contains("email_domains", [fromDomain])
          .maybeSingle()
      ).data
    : null;

  let recovered: RecoveredSender | null = null;
  let agency = envelopeAgency;
  if (!agency) {
    recovered = recoverOriginalSender(body.Headers, bodyText, fromEmail);
    if (recovered?.domain) {
      const { data: recoveredAgency } = await supabase
        .from("press_agencies")
        .select("id, name, source_id, trust_tier")
        .contains("email_domains", [recovered.domain])
        .maybeSingle();
      if (recoveredAgency) agency = recoveredAgency;
    }
  }

  let sourceId: string | null = agency?.source_id ?? null;
  if (!sourceId) {
    const { data: fallback } = await supabase
      .from("discovery_sources")
      .select("id")
      .eq("code", "PRESS_MAILBOX")
      .maybeSingle();
    sourceId = fallback?.id ?? null;
  }
  if (!sourceId) {
    return NextResponse.json(
      { error: "PRESS_MAILBOX discovery_source not found — run migration 0014" },
      { status: 500 },
    );
  }

  const haystack = `${subject}\n\n${bodyText ?? ""}`;
  const embargo = parseEmbargo(haystack);

  // Existing fuzzy/url dedup still applies — catches the same press release
  // hitting both the mailbox and an RSS scrape.
  const headlineNorm = normalizeHeadline(subject);
  const dedup = await checkDedup(supabase, {
    source_id: sourceId,
    external_id: messageId,
    primary_url_canonical: null,
    headline_normalized: headlineNorm,
  });
  if (dedup.state === "duplicate") {
    return NextResponse.json(
      {
        candidate_id: null,
        candidate_code: null,
        dedup_state: "duplicate",
        duplicate_reason: dedup.reason,
        matched_candidate_id: dedup.matched_candidate_id,
      },
      { status: 200 },
    );
  }

  const triageState: "ready" | "held_source" = embargo.embargoed
    ? "held_source"
    : "ready";

  // Unknown senders surface as 'unverified' so the inbox lights them up
  // for one-click agency confirmation later.
  const verificationState = agency ? "pending" : "unverified";

  const attachmentNames = Array.isArray(body.Attachments)
    ? body.Attachments
        .map((a) => safeTrim(a.Name, 240))
        .filter((n): n is string => !!n)
        .slice(0, 20)
    : [];

  // When we recovered a sender from a forward, the PR contact is the recovered
  // address (the real PR person), not the forwarder.
  const prContact = recovered
    ? { name: null, email: recovered.email }
    : {
        name: safeTrim(body.FromName ?? body.FromFull?.Name, 200),
        email: fromEmail,
      };

  const code = await nextCandidateCode(supabase);
  const now = new Date().toISOString();

  const { data: inserted, error } = await supabase
    .from("candidates")
    .insert({
      code,
      source_id: sourceId,
      working_headline: subject,
      external_id: messageId,
      message_id: messageId,
      kind: "email",
      summary: bodyText ? bodyText.slice(0, 2000) : null,
      body_text: bodyText,
      author: prContact.name,
      fetched_at: now,
      published_at: safeIso(body.Date),
      dedup_state: "clear",
      triage_state: triageState,
      verification_state: verificationState,
      risk: "low",
      embargo_until: embargo.until?.toISOString() ?? null,
      embargo_confidence: embargo.confidence,
      pr_contact: prContact,
      attachment_urls: attachmentNames, // MVP: names only. Phase 2: mirror to Storage.
      raw: {
        from: body.From,
        from_email: fromEmail,
        from_domain: fromDomain,
        to: body.To,
        subject,
        agency_id: agency?.id ?? null,
        agency_name: agency?.name ?? null,
        agency_match: recovered ? "recovered" : envelopeAgency ? "envelope" : null,
        recovered_sender: recovered
          ? {
              email: recovered.email,
              domain: recovered.domain,
              source: recovered.source,
            }
          : null,
        trust_tier: agency?.trust_tier ?? null,
        embargo_matched_text: embargo.matched_text,
        attachment_count: body.Attachments?.length ?? 0,
        extracted_attachment: extracted
          ? {
              name: extracted.name,
              source: extracted.source,
              char_count: extracted.char_count,
            }
          : null,
      },
    })
    .select("id, code")
    .single();

  if (error || !inserted) {
    // Race against the message_id unique index — if another request inserted
    // the same Message-ID between our fast-path check and this INSERT, treat
    // it as a duplicate rather than a 500.
    if (error?.code === "23505") {
      return NextResponse.json(
        { dedup_state: "duplicate", duplicate_reason: "message_id" },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "Failed to insert candidate" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      candidate_id: inserted.id,
      candidate_code: inserted.code,
      dedup_state: "clear",
      embargoed: embargo.embargoed,
      embargo_until: embargo.until?.toISOString() ?? null,
      embargo_confidence: embargo.confidence,
      agency_id: agency?.id ?? null,
    },
    { status: 201 },
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// "Alice Smith <alice@edelman.co.uk>" → "alice@edelman.co.uk"
function extractEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const angle = /<([^>]+)>/.exec(s);
  if (angle) return angle[1].trim();
  const bare = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(s);
  return bare ? bare[1] : null;
}

// Best-effort plain-text fallback when TextBody is missing. We don't want a
// full DOM parser on the request path; a tag-strip + entity-decode is enough
// for embargo regex matching and the body_text preview in the inbox.
function stripHtml(html: string): string | null {
  if (!html) return null;
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripped.length ? stripped.slice(0, 100_000) : null;
}
