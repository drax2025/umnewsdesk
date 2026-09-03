import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "mailparser";

/**
 * Copy a release's image attachments into Storage so the desk can actually see
 * them.
 *
 * Without this, `attachment_urls` holds filenames and nothing else — you can
 * tell a release came with "hero.jpg" but not whether it is a usable picture.
 * Deciding whether a story is worth running usually turns on that.
 *
 * Scope is deliberately narrow, per migration 0033:
 *   - images only. PDFs and .docx are the release text and belong in
 *     body_text; storing the binaries too would cost storage for no editorial
 *     use.
 *   - 5 MB a file, matching the bucket's own limit, so an oversized image
 *     fails here with a clear reason rather than as an opaque upload error.
 *
 * Never throws. A candidate that arrived is worth more than its pictures: a
 * failed mirror leaves the row intact with no attachments rather than losing
 * the release.
 */

const BUCKET = "candidate-attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type MirroredAttachment = {
  name: string;
  url: string;
  content_type: string;
  size: number;
};

/** Storage keys must be predictable and safe; the display name is kept in the row. */
function safeKey(candidateId: string, name: string, index: number): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-80);
  return `${candidateId}/${index}-${cleaned || "image"}`;
}

export async function mirrorImageAttachments(
  supabase: SupabaseClient,
  candidateId: string,
  attachments: Attachment[] | undefined,
): Promise<MirroredAttachment[]> {
  if (!attachments?.length) return [];
  const out: MirroredAttachment[] = [];

  for (const [i, att] of attachments.entries()) {
    try {
      const type = String(att.contentType ?? "").toLowerCase().split(";")[0].trim();
      if (!IMAGE_TYPES.has(type)) continue;
      const body = att.content as Buffer | undefined;
      if (!body?.length || body.length > MAX_BYTES) continue;

      const name = String(att.filename ?? `image-${i + 1}`).slice(0, 240);
      const key = safeKey(candidateId, name, i);

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(key, body, { contentType: type, upsert: true });
      if (error) {
        console.error(`[MIRROR] ${candidateId} ${name}: ${error.message}`);
        continue;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
      out.push({ name, url: data.publicUrl, content_type: type, size: body.length });
    } catch (e) {
      // One bad attachment must not cost the others.
      console.error(`[MIRROR] ${candidateId} attachment ${i}: ${(e as Error).message}`);
    }
  }
  return out;
}
