import "server-only";

/**
 * Reading an article off the web, for a story filed by hand.
 *
 * Deliberately not jsdom + Readability: that is a large dependency and a slow
 * cold start for something used a few times a day, and news articles are a
 * narrow enough shape to handle directly. Same approach as bodyOf() in
 * email-candidate.ts, which has stripped agency HTML for months.
 *
 * It will not beat Readability on a hostile page. It does not need to — a
 * person is looking at the result before it is filed, and can paste the text
 * themselves when a site defeats it.
 */

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 3 * 1024 * 1024;

export type FetchedArticle = { title: string | null; text: string; host: string };

/**
 * A user supplies this URL, so the fetch must not become a way to reach things
 * only the server can see. Public http(s) only, no credentials, and no address
 * that resolves inside the network this runs in.
 */
function assertFetchable(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("That does not look like a link");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http and https links can be fetched");
  }
  if (u.username || u.password) throw new Error("Links with credentials are refused");

  const host = u.hostname.toLowerCase();
  const private_ = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|::1$|\[::1\]$|0\.0\.0\.0$)/;
  const rfc1918_172 = /^172\.(1[6-9]|2\d|3[01])\./;
  if (private_.test(host) || rfc1918_172.test(host) || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("That address is inside the network, not on the web");
  }
  return u;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", reg: "®", copy: "©",
  trade: "™", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", pound: "£", euro: "€", deg: "°",
};

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Everything that is on the page but is not the story. */
function stripFurniture(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|iframe|form|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function titleFrom(html: string): string | null {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) return decode(og[1]).trim();
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1?.[1]) return decode(h1[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  // Page titles trail the masthead: "Headline | The Herald".
  if (t?.[1]) return decode(t[1]).replace(/\s*[|–—-]\s*[^|–—-]{2,40}$/, "").replace(/\s+/g, " ").trim();
  return null;
}

/** Paragraphs, in order, from the narrowest container that looks like the story. */
function articleText(html: string): string {
  const scoped =
    /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ??
    /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ??
    html;

  const blocks = [...scoped.matchAll(/<(p|h2|h3|h4|li)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) =>
    decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
  );

  return blocks
    // Nav crumbs, share prompts and cookie lines are all short; real paragraphs
    // are not. Headings are kept because they carry the structure.
    .filter((b) => b.length > 40)
    .filter((b, i, all) => all.indexOf(b) === i)
    .join("\n\n")
    .slice(0, 100_000);
}

export async function fetchArticle(rawUrl: string): Promise<FetchedArticle> {
  const url = assertFetchable(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Named honestly. A masthead blocking the desk should be able to see
        // who is asking rather than having to guess from a forged Chrome.
        "user-agent": "UnionMediaNewsDesk/1.0 (+https://desk.unionmedia.news)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (e) {
    throw new Error(
      (e as Error)?.name === "AbortError" ? "The site took too long to answer" : "Could not reach that link",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`The site answered ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(type)) {
    throw new Error(`That link is ${type.split(";")[0] || "not a web page"}, not an article`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error("That page is too large to read");
  const html = new TextDecoder("utf-8").decode(buf);

  const cleaned = stripFurniture(html);
  const text = articleText(cleaned);
  if (text.length < 50) {
    throw new Error("No article text found on that page — paste it in instead");
  }
  return { title: titleFrom(html), text, host: url.hostname.replace(/^www\./, "") };
}
