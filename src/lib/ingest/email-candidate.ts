import type { SupabaseClient } from "@supabase/supabase-js";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import { nextCandidateCode } from "@/lib/ingest/codes";
import { checkDedup } from "@/lib/ingest/dedup";
import { detectEmbargo } from "@/lib/ingest/embargo";
import { mirrorImageAttachments } from "@/lib/ingest/mirror-attachments";
import { normalizeHeadline, safeIso, safeTrim } from "@/lib/ingest/normalize";
import { isInternalDomain } from "@/lib/ingest/internal";
import { ensureCrmAgency, resolveAgency } from "@/lib/crm/agency";

/**
 * Turning a press release read off IMAP into a `candidates` row.
 *
 * Kept separate from the transport so the mapping can be reasoned about (and
 * dry-run) without a mailbox, and separate from `/api/ingest/item` because a
 * release has no sweep behind it — it arrives when an agency sends it, not
 * when we go looking.
 */

export type EmailIngestResult =
  | {
      state: "clear";
      candidate_id: string;
      candidate_code: string;
      agency: string | null;
      embargoed?: boolean;
      embargo_until?: string | null;
    }
  | { state: "duplicate"; reason: string; matched_candidate_id: string | null }
  | { state: "rejected"; reason: string };

/**
 * A release forwarded with the original enclosed as a .eml.
 *
 * Editorial triage forwards releases from another mailbox and attaches the
 * original as `message/rfc822`, so the message we receive is a two-line
 * wrapper — "the original is attached in full" — and everything that matters
 * is inside the attachment: the body, the agency's address, the send date and
 * the pictures.
 *
 * Read as-is, such a release stored ~280 characters of covering note, no
 * agency attribution and no images, which is what PR-FAFC84 looked like.
 *
 * The enclosed message is preferred only when it actually carries more than
 * the wrapper, so a genuine reply that happens to attach an .eml is not
 * mistaken for a forward of it.
 */
async function unwrapEnclosed(
  outer: ParsedMail,
): Promise<{ inner: ParsedMail; forwardedBy: string | null } | null> {
  const eml = (outer.attachments ?? []).find(
    (a) =>
      /message\/rfc822/i.test(String(a.contentType ?? "")) ||
      /\.eml$/i.test(String(a.filename ?? "")),
  );
  if (!eml?.content) return null;
  try {
    const inner = await simpleParser(eml.content as Buffer);
    // mailparser types `html` as `string | false`.
    const len = (m: ParsedMail) =>
      (typeof m.text === "string" ? m.text.length : 0) +
      (typeof m.html === "string" ? m.html.length : 0);
    const innerLen = len(inner);
    const outerLen = len(outer);
    if (innerLen <= outerLen) return null;
    return { inner, forwardedBy: addressOf(outer) };
  } catch {
    // An unreadable attachment must not cost us the release; the wrapper
    // still carries the subject.
    return null;
  }
}

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
    // Entities generally, not a handful by name: agency HTML is full of
    // &reg;, &rsquo;, &mdash; and numeric escapes, and leaving them raw puts
    // "Velonix&reg;" in front of the desk.
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|reg|copy|trade|rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip|pound|euro);/g,
      (_, name: string) =>
        ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", reg: "\u00ae",
           copy: "\u00a9", trade: "\u2122", rsquo: "\u2019", lsquo: "\u2018",
           rdquo: "\u201d", ldquo: "\u201c", ndash: "\u2013", mdash: "\u2014",
           hellip: "\u2026", pound: "\u00a3", euro: "\u20ac" })[name] ?? _)
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
  outer: ParsedMail,
  options: { dryRun?: boolean } = {},
): Promise<EmailIngestResult> {
  // Where the real release is enclosed as a .eml, everything below reads from
  // the enclosed message instead: its body, its sender, its date, its
  // attachments — and its Message-ID, so the same release forwarded twice, or
  // forwarded once and also sent direct, makes one candidate rather than two.
  const unwrapped = await unwrapEnclosed(outer);
  const parsed = unwrapped ? unwrapped.inner : outer;
  const forwardedBy = unwrapped?.forwardedBy ?? null;

  const subject = safeTrim(parsed.subject, 400) ?? safeTrim(outer.subject, 400);
  if (!subject) return { state: "rejected", reason: "no subject" };

  const messageId = safeTrim(parsed.messageId, 998) ?? safeTrim(outer.messageId, 998);
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

  // press_agencies answers "which discovery_source and how much do we trust
  // it"; the CRM answers "who are they to us commercially". 309 organisations
  // are tagged 'PR Agency' there against 21 rows here, so the CRM name wins
  // where there is one — and when it cannot be reached this falls straight
  // back to the registry rather than failing the ingest.
  const senderName = safeTrim(parsed.from?.value?.[0]?.name, 200) ?? null;
  const crm = await resolveAgency(supabase, fromDomain, senderName);
  const agencyName = crm.name ?? agency?.name ?? null;
  const isAgency = crm.isPrAgency || !!agency;

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

  // Read against the message's own date, so "FRIDAY 28 AUGUST" with no year
  // resolves from when the agency sent it rather than when we happened to poll.
  const embargo = detectEmbargo(subject, bodyText ?? "", parsed.date ?? new Date());

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
      agency: agencyName,
      embargoed: embargo.embargoed,
      embargo_until: embargo.until?.toISOString() ?? null,
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
      // An embargoed release is held rather than offered to the desk. No lift
      // time still holds it: we cannot say an embargo has expired when we could
      // not read when it ends, and a person has to supply the date.
      triage_state: embargo.embargoed ? "held_source" : "ready",
      embargo_until: embargo.until?.toISOString() ?? null,
      embargo_confidence: embargo.confidence,
      // Read straight from the mailbox, so the sender is the real sender rather
      // than whoever forwarded it. A known agency domain is therefore genuinely
      // 'verified' here, which it never was over the webhook.
      verification_state: isAgency ? "verified" : "unverified",
      risk: "low",
      pr_contact: { name: parsed.from?.value?.[0]?.name ?? null, email: fromEmail },
      attachment_urls: attachmentNames,
      raw: {
        from_email: fromEmail,
        from_domain: fromDomain,
        to: parsed.to && "text" in parsed.to ? parsed.to.text : null,
        subject,
        agency_id: agency?.id ?? null,
        agency_name: agencyName,
        agency_match: agency ? "envelope" : crm.crmOrgId ? "crm" : null,
        trust_tier: agency?.trust_tier ?? null,
        // The live commercial record, for the pill on the discovery overview.
        crm_org_id: crm.crmOrgId,
        crm_lifecycle: crm.lifecycle,
        agency_source: crm.origin,
        attachment_count: parsed.attachments?.length ?? 0,
        // Who passed it on, when the release came enclosed as a .eml. The
        // sender above is the agency, recovered from the enclosed message.
        forwarded_by: forwardedBy,
        unwrapped_from_eml: !!unwrapped,
        // No embargo_evidence column, so the line the machine read is kept
        // here — a person must be able to check its work.
        embargo_evidence: embargo.evidence,
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

  // After the insert, because the storage path is keyed on the candidate id.
  // Best-effort by design: a picture that will not upload must not cost us the
  // release. See mirror-attachments.ts.
  try {
    const mirrored = await mirrorImageAttachments(
      supabase,
      inserted.id,
      parsed.attachments as Attachment[] | undefined,
    );
    if (mirrored.length) {
      await supabase.from("candidates").update({ attachments: mirrored }).eq("id", inserted.id);
    }
  } catch (e) {
    console.error(`[INGEST] ${inserted.code} attachment mirror failed: ${(e as Error).message}`);
  }

  // An agency has sent us material, which by the desk's rule makes them a
  // client. A new sender becomes a client PR agency in the CRM; a lead or a
  // prospect is promoted; anything uncertain goes to the review queue and is
  // not written. Never for mail from our own domains — a release the desk
  // forwarded to itself must not file us as our own client.
  //
  // Best-effort by design, like the attachment mirror above: the CRM is a
  // different box on a different network, and it must not cost us a release.
  if (!isInternalDomain(fromDomain)) {
    try {
      await ensureCrmAgency(supabase, {
        domain: fromDomain,
        name: senderName,
        candidateId: inserted.id,
      });
    } catch (e) {
      console.error(`[INGEST] ${inserted.code} CRM sync failed: ${(e as Error).message}`);
    }
  }

  return {
    state: "clear",
    candidate_id: inserted.id,
    candidate_code: inserted.code,
    agency: agencyName,
  };
}
