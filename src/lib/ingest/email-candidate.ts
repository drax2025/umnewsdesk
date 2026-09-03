import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMail } from "mailparser";
import { nextCandidateCode } from "@/lib/ingest/codes";
import { checkDedup } from "@/lib/ingest/dedup";
import { normalizeHeadline, safeIso, safeTrim } from "@/lib/ingest/normalize";

/**
 * Turning a press release read off IMAP into a `candidates` row.
 *
 * Kept separate from the transport so the mapping can be reasoned about (and
 * dry-run) without a mailbox, and separate from `/api/ingest/item` because a
 * release has no sweep behind it — it arrives when an agency sends it, not
 * when we go looking.
 */

export type EmailIngestResult =
  | { state: "clear"; candidate_id: string; candidate_code: string; agency: string | null }
  | { state: "duplicate"; reason: string; matched_candidate_id: string | null }
  | { state: "rejected"; reason: string };

/** "Alice Smith <alice@edelman.co.uk>" → "alice@edelman.co.uk" */
function addressOf(parsed: ParsedMail): string | null {
  const from = parsed.from?.value?.[0]?.address;
  return from ? from.trim().toLowerCase() : null;
}

/**
 * Body preference: plain text first. Unlike the old forwarded-mail path there
 * is no quoted wrapper to strip — this is the agency's original message — so
 * the text part is the cleanest thing available. HTML is a fallback, tags
 * stripped rather than converted, because what the scorer and the drafter need
 * is prose, not markup.
 */
function bodyOf(parsed: ParsedMail): string | null {
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (text.length >= 50) return text.slice(0, 100_000);
  const html = typeof parsed.html === "string" ? parsed.html : "";
  if (!html) return text || null;
  const stripped = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
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
  return stripped ? stripped.slice(0, 100_000) : text || null;
}

/**
 * Store one message. Idempotent on the RFC822 Message-ID, which is the whole
 * reason a re-run of the poller is safe: the same release moved back into the
 * watched folder by hand lands once, not twice.
 */
export async function ingestEmailMessage(
  supabase: SupabaseClient,
  parsed: ParsedMail,
  options: { dryRun?: boolean } = {},
): Promise<EmailIngestResult> {
  const subject = safeTrim(parsed.subject, 400);
  if (!subject) return { state: "rejected", reason: "no subject" };

  const messageId = safeTrim(parsed.messageId, 998);
  if (!messageId) return { state: "rejected", reason: "no Message-ID" };

  const fromEmail = addressOf(parsed);
  if (!fromEmail) return { state: "rejected", reason: "could not parse From address" };
  const fromDomain = fromEmail.split("@")[1] ?? "";

  // Fast path: this exact message is already stored.
  {
    const { data: existing } = await supabase
      .from("candidates")
      .select("id, code")
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      return { state: "duplicate", reason: "message_id", matched_candidate_id: existing.id };
    }
  }

  // Sender → agency → source. A known agency domain attributes the release and
  // lights up the scorecard's credible-source factor; anything else falls back
  // to the shared press mailbox and is flagged for one-click confirmation.
  const { data: agency } = fromDomain
    ? await supabase
        .from("press_agencies")
        .select("id, name, source_id, trust_tier")
        .contains("email_domains", [fromDomain])
        .maybeSingle()
    : { data: null };

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
    return { state: "rejected", reason: "PRESS_MAILBOX discovery_source not found" };
  }

  const bodyText = bodyOf(parsed);
  const headlineNorm = normalizeHeadline(subject);

  // Catches the same release reaching us twice under different Message-IDs,
  // and a release that also turned up on a feed.
  const dedup = await checkDedup(supabase, {
    source_id: sourceId,
    external_id: messageId,
    primary_url_canonical: null,
    headline_normalized: headlineNorm,
  });
  if (dedup.state === "duplicate") {
    return {
      state: "duplicate",
      reason: dedup.reason,
      matched_candidate_id: dedup.matched_candidate_id,
    };
  }

  const attachmentNames = (parsed.attachments ?? [])
    .map((a) => safeTrim(a.filename, 240))
    .filter((n): n is string => !!n)
    .slice(0, 20);

  if (options.dryRun) {
    return {
      state: "clear",
      candidate_id: "(dry-run)",
      candidate_code: "(dry-run)",
      agency: agency?.name ?? null,
    };
  }

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
      author: safeTrim(parsed.from?.value?.[0]?.name, 200),
      fetched_at: now,
      published_at: safeIso(parsed.date),
      dedup_state: "clear",
      triage_state: "ready",
      // Read straight from the mailbox, so the sender is the real sender rather
      // than whoever forwarded it. A known agency domain is therefore genuinely
      // 'verified' here, which it never was over the webhook.
      verification_state: agency ? "verified" : "unverified",
      risk: "low",
      pr_contact: { name: parsed.from?.value?.[0]?.name ?? null, email: fromEmail },
      attachment_urls: attachmentNames,
      raw: {
        from_email: fromEmail,
        from_domain: fromDomain,
        to: parsed.to && "text" in parsed.to ? parsed.to.text : null,
        subject,
        agency_id: agency?.id ?? null,
        agency_name: agency?.name ?? null,
        agency_match: agency ? "envelope" : null,
        trust_tier: agency?.trust_tier ?? null,
        attachment_count: parsed.attachments?.length ?? 0,
        ingest_path: "imap",
      },
    })
    .select("id, code")
    .single();

  if (error || !inserted) {
    // Race against the message_id unique index — if a concurrent run inserted
    // the same message between the fast path and here, that is a duplicate,
    // not a failure.
    if ((error as { code?: string } | null)?.code === "23505") {
      return { state: "duplicate", reason: "message_id", matched_candidate_id: null };
    }
    throw new Error(error?.message ?? "Failed to insert candidate");
  }

  return {
    state: "clear",
    candidate_id: inserted.id,
    candidate_code: inserted.code,
    agency: agency?.name ?? null,
  };
}
