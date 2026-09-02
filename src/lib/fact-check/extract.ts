import TurndownService from "turndown";

/** Anything past this is not read. Enough for the body of a news page. */
export const SOURCE_CHAR_CAP = 12_000;

/**
 * HTML → readable text for the model.
 *
 * Markdown rather than a flat tag-strip because the structure carries meaning
 * the check needs: a blockquote is a quote, bold is often the figure, and a
 * heading is not a sentence. Turndown is already a dependency and brings its
 * own DOM, so this needs nothing new.
 */
export function extractReadableText(
  html: string,
  /**
   * The candidate's headline. When it appears on the page, the window starts
   * there — a homepage-style sidebar of teaser links can push the actual
   * article thousands of characters down, and the budget is better spent on
   * the story than on the six other stories linked beside it.
   */
  anchor?: string,
): { text: string; truncated: boolean } {
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  // Furniture. A page's nav and footer repeat on every article and are the
  // fastest way to spend the character budget on nothing.
  td.remove([
    "script",
    "style",
    "nav",
    "footer",
    "aside",
    "noscript",
    "form",
    "iframe",
  ]);

  let text: string;
  try {
    text = td.turndown(html);
  } catch {
    // A page malformed enough to break the parser still has words in it.
    text = html.replace(/<[^>]*>/g, " ");
  }

  text = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

  text = keepProse(text);
  text = startAtArticle(text, anchor);

  const truncated = text.length > SOURCE_CHAR_CAP;
  return { text: truncated ? text.slice(0, SOURCE_CHAR_CAP) : text, truncated };
}

/**
 * Keep the prose, drop the furniture.
 *
 * Pages in the wild have no `<article>` to lean on — the first source tried
 * here had neither `<article>` nor `<main>` nor a recognisable content class,
 * and a straight conversion spent its whole character budget on social icons
 * and menu items before reaching a word of the story. Structure was not
 * available, so this uses shape instead.
 *
 * A block survives if it reads like a sentence: long enough, or punctuated
 * like prose. Menu items, image credits, share links and empty anchors are
 * none of those things. The test is deliberately loose — losing a real
 * sentence costs a finding, while keeping a menu costs the budget that would
 * have found it.
 */
function keepProse(markdown: string): string {
  const blocks = markdown.split(/\n{2,}/);
  const kept: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // Empty anchors and bare images: "[](url)", "![alt](url)". These are the
    // social bar and the lazy-loaded furniture, and there are dozens.
    const stripped = block
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, (m) => (/^\[\s*\]/.test(m) || m.startsWith("!") ? "" : m))
      .trim();
    if (!stripped) continue;

    // Headings are short by nature and worth keeping — a headline is a claim.
    if (/^#{1,6}\s/.test(stripped)) { kept.push(stripped); continue; }
    // Quotes carry the words a quote_not_found finding is about.
    if (stripped.startsWith(">")) { kept.push(stripped); continue; }

    // A teaser card: an image link wrapping another story's headline. These
    // are long enough to pass the prose test and are not this article.
    if (/^[*-]\s*\[!\[/.test(stripped)) continue;

    const words = stripped.split(/\s+/).length;
    const sentenceLike = /[.!?]["')\]]?$/.test(stripped) && words >= 6;
    if (stripped.length >= 120 || sentenceLike) kept.push(stripped);
  }

  return kept.join("\n\n");
}

/**
 * Move the window to where the article starts, when we can tell.
 *
 * Only trims on an unambiguous match, and keeps a little of what came before
 * so a standfirst above the headline is not lost. If the headline is not
 * found — a rewritten working headline, a paywall — nothing is trimmed and
 * the check reads the page from the top as before.
 */
function startAtArticle(text: string, anchor?: string): string {
  if (!anchor) return text;
  const needle = anchor.trim().toLowerCase();
  if (needle.length < 20) return text; // too short to match safely
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) return text;
  return text.slice(Math.max(0, at - 200));
}
