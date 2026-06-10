/**
 * Attachment text extraction for inbound press releases.
 *
 * PR agencies frequently send the release as a PDF or Word attachment with a
 * short courteous note in the email body. Without extraction the candidate
 * would land with a body_text of "Please find attached…" which is useless
 * for scoring + dedup. So when the email body is thin we try the first
 * attachment that looks like a document and use its extracted text instead.
 *
 * Conservative on errors: extraction failures return null rather than
 * throwing — the email still ingests with whatever body text exists.
 *
 * Supported:
 *   - application/pdf
 *   - application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx)
 *
 * NOT supported:
 *   - legacy .doc (would need antiword or libreoffice — out of scope for MVP)
 *   - .rtf, .pages, .odt — same reason
 */

import mammoth from "mammoth";

const MAX_TEXT_LEN = 100_000;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB hard cap
const BODY_THIN_THRESHOLD = 240; // chars — anything below this looks like a courtesy note

export type ExtractedAttachment = {
  name: string;
  content_type: string;
  source: "pdf" | "docx";
  text: string;
  char_count: number;
};

export type PostmarkAttachmentInput = {
  Name?: string;
  Content?: string; // base64
  ContentType?: string;
  ContentLength?: number;
};

/**
 * Try to extract usable body text from the first extractable attachment.
 *
 * Returns null when:
 *   - the email body is already substantial (no need to dig into attachments)
 *   - no attachments look like documents
 *   - extraction failed (logged on the candidate's `raw` envelope by the caller)
 */
export async function extractFromAttachments(
  attachments: PostmarkAttachmentInput[] | undefined,
  existingBody: string | null,
): Promise<ExtractedAttachment | null> {
  if (!attachments?.length) return null;
  if (existingBody && existingBody.trim().length >= BODY_THIN_THRESHOLD) return null;

  for (const att of attachments) {
    const name = (att.Name ?? "").trim();
    const ct = (att.ContentType ?? "").toLowerCase();
    const size = att.ContentLength ?? 0;
    if (!att.Content) continue;
    if (size > MAX_ATTACHMENT_BYTES) continue;

    const ext = name.toLowerCase().split(".").pop() ?? "";

    if (ct === "application/pdf" || ext === "pdf") {
      const text = await extractPdf(att.Content);
      if (text) {
        return { name, content_type: ct || "application/pdf", source: "pdf", text, char_count: text.length };
      }
      continue;
    }

    if (
      ct === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const text = await extractDocx(att.Content);
      if (text) {
        return { name, content_type: ct || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", source: "docx", text, char_count: text.length };
      }
      continue;
    }
  }

  return null;
}

async function extractPdf(base64: string): Promise<string | null> {
  try {
    const buf = Buffer.from(base64, "base64");
    // Dynamic import keeps the heavy pdfjs runtime out of bundles that never
    // hit this code path (e.g. the inbox page).
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    await parser.destroy();
    return cleanExtractedText(result.text);
  } catch {
    return null;
  }
}

async function extractDocx(base64: string): Promise<string | null> {
  try {
    const buf = Buffer.from(base64, "base64");
    const result = await mammoth.extractRawText({ buffer: buf });
    return cleanExtractedText(result.value);
  } catch {
    return null;
  }
}

function cleanExtractedText(raw: string): string | null {
  if (!raw) return null;
  const t = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!t) return null;
  return t.length > MAX_TEXT_LEN ? t.slice(0, MAX_TEXT_LEN) : t;
}
