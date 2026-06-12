/**
 * Mirror Postmark image attachments to the candidate-attachments Storage
 * bucket so editors can pick one as the featured image on F7 / F8 without
 * downloading + re-uploading.
 *
 * Scope:
 *   - Only image MIME types (image/jpeg, image/png, image/webp, image/gif).
 *     PDFs / DOCX are text-extracted into body_text upstream and intentionally
 *     not mirrored — they'd waste storage with no editorial use.
 *   - Per-attachment cap of 5 MB matches the bucket policy. Postmark's own
 *     inbound payload cap (~10 MB total) makes anything larger unlikely.
 *
 * Failure handling: best-effort. A single attachment that fails to upload
 * doesn't fail the others; an empty result means "no image attachments"
 * (legitimate — most PR emails have just a PDF) and the caller writes an
 * empty array to `candidates.attachments`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostmarkAttachmentInput } from "@/lib/ingest/attachment-extract";

const BUCKET = "candidate-attachments";
const MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_MIME_SET = new Set<string>([
  "image/jpeg",
  "image/jpg", // some agencies send this; map to jpeg
  "image/png",
  "image/webp",
  "image/gif",
]);

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export type MirroredAttachment = {
  name: string;
  url: string;
  content_type: string;
  size: number;
};

function normaliseMime(ct: string): string {
  const lower = ct.toLowerCase().split(";")[0]?.trim() ?? "";
  if (lower === "image/jpg") return "image/jpeg";
  return lower;
}

function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "image";
  // Storage object keys can't contain certain chars; also prevent path
  // traversal via "../" in the original filename.
  return base.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "image";
}

/**
 * Resolve a Postmark attachment's effective MIME type:
 *   1. Trust ContentType when it's a known image type.
 *   2. Fall back to the filename extension — agencies sometimes send with
 *      ContentType "application/octet-stream" but a .jpg filename.
 *   3. Otherwise return null (caller skips).
 */
function resolveImageMime(att: PostmarkAttachmentInput): string | null {
  const ct = normaliseMime(att.ContentType ?? "");
  if (IMAGE_MIME_SET.has(ct)) return ct === "image/jpg" ? "image/jpeg" : ct;
  const ext = (att.Name ?? "").toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXT_TO_MIME[ext] ?? null;
}

/**
 * Upload every image attachment to Storage under
 * `<candidate_id>/<index>-<safe-filename>` and return the URL list.
 *
 * The index prefix prevents collisions when an email has two attachments
 * named "image.jpg" (Postmark's renamer sometimes does this on forwards).
 */
export async function mirrorImageAttachments(
  supabase: SupabaseClient,
  candidateId: string,
  attachments: PostmarkAttachmentInput[] | undefined,
): Promise<MirroredAttachment[]> {
  if (!attachments?.length) return [];

  const out: MirroredAttachment[] = [];
  let idx = 0;
  for (const att of attachments) {
    idx += 1;
    if (!att.Content) continue;
    const mime = resolveImageMime(att);
    if (!mime) continue;

    // Decode the base64 payload. Buffer.from accepts the b64 string directly;
    // we then check the size against our cap. Postmark's ContentLength field
    // is unreliable on forwarded mail so we use the decoded length.
    let bytes: Buffer;
    try {
      bytes = Buffer.from(att.Content, "base64");
    } catch {
      continue;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) continue;

    const filename = safeFilename(att.Name ?? `image-${idx}.jpg`);
    const path = `${candidateId}/${idx}-${filename}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: mime,
    });
    if (upErr) continue; // best-effort; skip and keep going

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    out.push({
      name: att.Name ?? filename,
      url: pub.publicUrl,
      content_type: mime,
      size: bytes.byteLength,
    });
  }
  return out;
}
