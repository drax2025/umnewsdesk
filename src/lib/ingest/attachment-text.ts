import type { Attachment } from "mailparser";

/**
 * Reading the release out of the attachment when the mail is only a covering
 * note.
 *
 * A good number of agencies write "please find the release attached below" and
 * put the whole thing in a Word file. Read as mail alone, that stores a few
 * hundred characters of pleasantries and nothing the desk can work with —
 * REC-2026-11466 held 429 characters of "national recognition" while the
 * release sat in EBCNOMINATIONS2.docx beside it. Eight candidates were in that
 * state when this was written, out of 77 carrying a document.
 *
 * Same judgement as the .eml unwrap in email-candidate.ts: the longer text
 * wins, because the covering note is by definition the shorter one.
 *
 * mammoth and pdf-parse are loaded on demand. Both are heavy, both are needed
 * on a minority of messages, and the mailbox poller should not pay for them on
 * every tick.
 */

const DOCX = /\.docx$/i;
const PDF = /\.pdf$/i;
const DOCX_TYPE = /officedocument\.wordprocessingml\.document/i;
const PDF_TYPE = /^application\/pdf$/i;

/** Word leaves runs of blank lines and non-breaking spaces everywhere. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return tidy(value ?? "");
}

/**
 * pdf-parse 2.x is a class, not the callable default the 1.x examples show.
 * Calling it as a function fails with "parse is not a function", which is how
 * the first run of the backfill lost the one PDF in the set.
 */
async function readPdf(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = (await parser.getText()) as { text?: string; pages?: { text?: string }[] };
    const text = result.text ?? (result.pages ?? []).map((p) => p.text ?? "").join("\n\n");
    return tidy(text);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export type ExtractedDocument = { filename: string; text: string };

/**
 * Which of several documents is the release.
 *
 * Longest-wins is wrong the moment collateral is attached beside it:
 * REC-2026-11262 carried both a release and an awards-ceremony leaflet, and
 * the leaflet was the longer file. So a filename that says what it is outranks
 * everything, then Word outranks PDF — agencies send the release as a document
 * and the brochure as a PDF — and length settles the rest.
 */
const NAMED_RELEASE = /(press|media|news)[\s_-]*release|^release\b|\bPR\b/i;

function rank(filename: string, isDocx: boolean, length: number): number {
  return (NAMED_RELEASE.test(filename) ? 2_000_000 : 0) + (isDocx ? 1_000_000 : 0) + length;
}

/**
 * The longest readable document on the message, or null.
 *
 * Never throws. A file that will not parse — a corrupt upload, a PDF that is
 * only scanned images — must not cost us the release, exactly as a picture
 * that will not upload does not. It is logged and skipped.
 */
export async function textFromAttachments(
  attachments: Attachment[] | undefined,
  log: (message: string) => void = () => {},
): Promise<ExtractedDocument | null> {
  let best: ExtractedDocument | null = null;
  let bestRank = -1;

  for (const a of attachments ?? []) {
    const name = String(a.filename ?? "");
    const type = String(a.contentType ?? "");
    const isDocx = DOCX.test(name) || DOCX_TYPE.test(type);
    const isPdf = PDF.test(name) || PDF_TYPE.test(type);
    if (!isDocx && !isPdf) continue;
    if (!a.content) continue;

    try {
      const buf = a.content as Buffer;
      const text = isDocx ? await readDocx(buf) : await readPdf(buf);
      if (!text) continue;
      const score = rank(name, isDocx, text.length);
      if (score > bestRank) { bestRank = score; best = { filename: name, text }; }
    } catch (e) {
      log(`could not read ${name || type}: ${(e as Error).message}`);
    }
  }

  return best;
}
