"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * The full contents of one candidate, for the inbox preview.
 *
 * Loaded on demand rather than with the list. The inbox pulls 200 rows and a
 * press release body runs to a few thousand characters — carrying that for
 * every row to show one would be a large payload for a panel that is usually
 * closed.
 */

export type AttachmentPreview = {
  name: string;
  url: string | null;
  content_type: string | null;
  size: number | null;
};

export type CandidatePreview = {
  id: string;
  code: string;
  headline: string;
  summary: string | null;
  body: string | null;
  primaryUrl: string | null;
  imageUrl: string | null;
  kind: string | null;
  layer: string | null;
  score: number | null;
  triageState: string;
  dedupState: string;
  verificationState: string;
  surfacedAt: string;
  publishedAt: string | null;
  author: string | null;
  sourceName: string | null;
  signalOnly: boolean;
  agencyName: string | null;
  fromEmail: string | null;
  embargoUntil: string | null;
  embargoConfidence: string | null;
  embargoEvidence: string | null;
  images: AttachmentPreview[];
  otherFiles: string[];
  sentToNewsroomAt: string | null;
  newsroomRecordId: string | null;
};

type Row = {
  id: string; code: string; working_headline: string; summary: string | null;
  body_text: string | null; primary_url: string | null; image_url: string | null;
  kind: string | null; layer: string | null; score: number | null;
  triage_state: string; dedup_state: string; verification_state: string;
  surfaced_at: string; published_at: string | null; author: string | null;
  embargo_until: string | null; embargo_confidence: string | null;
  attachment_urls: string[] | null; attachments: unknown;
  sent_to_newsroom_at: string | null; newsroom_record_id: string | null;
  raw: { agency_name?: string | null; from_email?: string | null; embargo_evidence?: string | null } | null;
  discovery_sources: { name: string | null; signal_only_eligible: boolean | null } | null;
};

export async function getCandidatePreview(
  id: string,
): Promise<{ ok: true; preview: CandidatePreview } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "No candidate id" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id, code, working_headline, summary, body_text, primary_url, image_url, kind, " +
      "layer, score, triage_state, dedup_state, verification_state, surfaced_at, " +
      "published_at, author, embargo_until, embargo_confidence, attachment_urls, " +
      "attachments, sent_to_newsroom_at, newsroom_record_id, raw, " +
      "discovery_sources(name, signal_only_eligible)",
    )
    .eq("id", id)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Candidate not found" };
  const c = data as unknown as Row;

  // `attachments` holds mirrored images; `attachment_urls` holds every
  // filename, images included. Showing a name we already render as a picture
  // would list the same file twice, so the names are filtered against it.
  const mirrored: AttachmentPreview[] = Array.isArray(c.attachments)
    ? (c.attachments as AttachmentPreview[]).filter((a) => a && typeof a.url === "string")
    : [];
  const mirroredNames = new Set(mirrored.map((a) => a.name));
  const otherFiles = (c.attachment_urls ?? []).filter((n) => n && !mirroredNames.has(n));

  return {
    ok: true,
    preview: {
      id: c.id,
      code: c.code,
      headline: c.working_headline,
      summary: c.summary,
      body: c.body_text,
      primaryUrl: c.primary_url,
      imageUrl: c.image_url,
      kind: c.kind,
      layer: c.layer,
      score: c.score,
      triageState: c.triage_state,
      dedupState: c.dedup_state,
      verificationState: c.verification_state,
      surfacedAt: c.surfaced_at,
      publishedAt: c.published_at,
      author: c.author,
      sourceName: c.discovery_sources?.name ?? null,
      signalOnly: Boolean(c.discovery_sources?.signal_only_eligible),
      agencyName: c.raw?.agency_name ?? null,
      fromEmail: c.raw?.from_email ?? null,
      embargoUntil: c.embargo_until,
      embargoConfidence: c.embargo_confidence,
      embargoEvidence: c.raw?.embargo_evidence ?? null,
      images: mirrored,
      otherFiles,
      sentToNewsroomAt: c.sent_to_newsroom_at,
      newsroomRecordId: c.newsroom_record_id,
    },
  };
}
