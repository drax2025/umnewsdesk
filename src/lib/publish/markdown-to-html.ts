/**
 * Shared markdown → HTML converter for the WordPress publish path.
 *
 * Why this exists: the article body editor stores markdown (DraftEditor +
 * the email ingest's html-to-markdown pipeline both feed `articles.body`
 * in markdown). WordPress' REST API treats `content` as HTML — anything
 * that isn't tagged renders as literal text. Without this converter, an
 * editor's "## Background" heading ships to the live site as the raw four
 * characters "## Background".
 *
 * Design:
 *   - Use the `marked` Marked class (not the singleton) so config doesn't
 *     leak between requests and we stay safe under concurrent publishes.
 *   - GFM on: editors lean on tables, task lists, autolinks, and ~~strike~~
 *     out of habit from GitHub/Notion. Tables in particular show up in
 *     funding-round stories ("Round details") and are pure pain without it.
 *   - `breaks: true`: WordPress' own block editor turns a single newline
 *     into a `<br>`, and editors muscle-memory that behaviour. Matching it
 *     prevents "where did my line breaks go" support tickets.
 *   - `async: false`: WP push is already async; nesting a Promise per
 *     parse adds latency without buying anything.
 *
 * Sanitisation: NOT applied. This input is editor-authored newsroom copy,
 * not user-generated content. Stripping HTML here would also defeat the
 * purpose — editors occasionally embed raw `<iframe>` players (e.g. for
 * Soundcloud or YouTube on tech episodes), and marked passes those
 * through as-is. WordPress handles its own kses filtering on the receiving
 * end if any role-based locking is needed there.
 */

import { Marked } from "marked";

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
});

/**
 * Convert a markdown string to HTML for WordPress' `content` field.
 *
 * Returns the trimmed HTML. Empty / whitespace-only input returns an empty
 * string — WP rejects posts with literally empty content, but the caller
 * is responsible for catching that earlier; we don't synthesise a
 * placeholder paragraph here because that would silently hide a bug.
 */
export function markdownToHtml(md: string | null | undefined): string {
  const src = (md ?? "").toString();
  if (!src.trim()) return "";
  const out = marked.parse(src);
  // `async: false` means `parse` is synchronous and returns a string, but
  // the union type from marked.d.ts still includes Promise. Narrow with a
  // runtime check so we never accidentally JSON-encode a Promise into the
  // WP payload.
  if (typeof out !== "string") {
    throw new Error("markdownToHtml: marked returned a non-string under async:false");
  }
  return out.trim();
}

/**
 * Inline-only variant for short strings (e.g. standfirst / excerpt) where
 * we don't want the outer `<p>` wrap that the block parser adds. Bold,
 * italic, links, code spans still work; headings and lists are flattened
 * to text because they don't belong in an excerpt anyway.
 */
export function markdownToInlineHtml(md: string | null | undefined): string {
  const src = (md ?? "").toString().trim();
  if (!src) return "";
  const out = marked.parseInline(src);
  if (typeof out !== "string") {
    throw new Error(
      "markdownToInlineHtml: marked returned a non-string under async:false",
    );
  }
  return out;
}
