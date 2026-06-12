/**
 * Shared HTML → markdown converter for inbound press releases.
 *
 * Used by:
 *   - attachment-extract.ts to turn mammoth's DOCX-as-HTML into structured
 *     markdown (preserving headings, bold/italic, lists).
 *   - The Postmark inbound email route to extract richer text from
 *     `HtmlBody` when `TextBody` is missing — the previous regex-based
 *     stripHtml lost paragraph structure, list bullets, and emphasis.
 *
 * Turndown is configured with the heading/code/emphasis rules journalists
 * actually want, and a couple of custom rules:
 *   - Strip MS Word's "mso-*" inline styles before conversion so they don't
 *     pollute markdown.
 *   - Convert <br> to a real newline (turndown default keeps it as `  \n`
 *     which renders inconsistently in our textarea preview).
 *   - Drop empty paragraphs entirely.
 */

import TurndownService from "turndown";

let cachedService: TurndownService | null = null;

function getService(): TurndownService {
  if (cachedService) return cachedService;
  const td = new TurndownService({
    headingStyle: "atx", // # Heading  rather than underlined
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  // Drop empty paragraphs so we don't get runs of blank lines from
  // mammoth/Word output.
  td.addRule("empty-p", {
    filter: (node) =>
      node.nodeName === "P" &&
      (node.textContent ?? "").replace(/\s+/g, "") === "",
    replacement: () => "",
  });

  // <br> → real newline (turndown's default trailing-spaces convention
  // doesn't survive our plain-text textarea).
  td.addRule("br", {
    filter: "br",
    replacement: () => "\n",
  });

  // Strip <style>, <script>, <meta>, <link>, <head> entirely.
  td.remove(["style", "script", "meta", "link", "head", "title"]);

  cachedService = td;
  return td;
}

export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return "";
  // Strip Office/Word mso-* attributes that bloat the markdown and never
  // carry meaningful structure.
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\sclass="MsoNormal"/gi, "")
    .replace(/\sstyle="[^"]*mso-[^"]*"/gi, "")
    .replace(/<o:p\s*\/?>(?:<\/o:p>)?/gi, "");

  const md = getService().turndown(cleaned);

  // Normalise whitespace: collapse 3+ newlines, trim each line's
  // trailing whitespace, trim overall.
  return md
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
