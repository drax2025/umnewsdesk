import Anthropic from "@anthropic-ai/sdk";
import { assertSafeUrl } from "@/lib/fetch/safe-url";
import { extractReadableText } from "@/lib/fact-check/extract";
import {
  unavailable,
  type FactCheck,
  type FactCheckFinding,
} from "@/lib/fact-check/types";

export const MODEL = "claude-opus-5";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4_000_000;

const SYSTEM = `You compare a news candidate against the page it was taken from.

You report only three things:
- differing_figure: the candidate states a number, date, percentage or amount that the source states differently.
- quote_not_found: the candidate presents words in quotation marks that do not appear in the source.
- unsupported_claim: the candidate asserts a fact of substance that the source does not contain.

Rules that matter more than thoroughness:
- Quote the candidate verbatim in "claim" so a human can find it on the page.
- Put what the source actually says in "source", or null if the source says nothing on the point.
- Report nothing you are not confident about. An empty list is the correct and common answer, and a wrong finding costs a person more time than a missed one.
- Rewording, summarising, compression and changed sentence order are not findings. Only a difference in fact is.
- The source text may be truncated. Do not report an unsupported_claim for something that could plausibly appear in the part you cannot see; a differing figure is still a finding, because the numbers you can see disagree.
- Ignore navigation, cookie notices, related-article lists and advertising.`;

const TOOL: Anthropic.Tool = {
  name: "report",
  description: "Report the differences found, if any.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["unsupported_claim", "differing_figure", "quote_not_found"],
            },
            claim: { type: "string", description: "Verbatim from the candidate." },
            source: {
              type: ["string", "null"],
              description: "What the source says, or null if it says nothing.",
            },
            confidence: { type: "string", enum: ["high", "med", "low"] },
          },
          required: ["kind", "claim", "source", "confidence"],
        },
      },
    },
    required: ["findings"],
  },
};

/**
 * Fetch the source page and compare the candidate against it.
 *
 * Never throws. Every failure path — no key, bad URL, a host that resolves
 * somewhere private, a timeout, a model that returns nonsense — comes back as
 * `state: "unavailable"` carrying the reason. The caller is the send action,
 * and a fact-check is not a reason to fail a send.
 */
export async function factCheckCandidate(args: {
  sourceUrl: string;
  title: string;
  body: string;
}): Promise<FactCheck> {
  const { sourceUrl, title, body } = args;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return unavailable(sourceUrl, "ANTHROPIC_API_KEY is not set", MODEL);

  try {
    await assertSafeUrl(sourceUrl);
  } catch (e) {
    return unavailable(sourceUrl, (e as Error).message, MODEL);
  }

  let html: string;
  try {
    const res = await fetch(sourceUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // Some publishers serve a consent wall to an unrecognised agent. This
        // says who we are rather than pretending to be a browser.
        "User-Agent": "UnionMediaNewsDesk/1.0 (+https://desk.unionmedia.news)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return unavailable(sourceUrl, `Source returned ${res.status}`, MODEL);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) {
      return unavailable(sourceUrl, `Source is ${type || "an unknown type"}, not HTML`, MODEL);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return unavailable(sourceUrl, "Source page is too large to read", MODEL);
    }
    html = new TextDecoder("utf-8").decode(buf);
  } catch (e) {
    const err = e as Error;
    return unavailable(
      sourceUrl,
      err.name === "TimeoutError" ? "Source did not respond in time" : err.message,
      MODEL,
    );
  }

  const { text, truncated } = extractReadableText(html, title);
  // A near-empty extraction means a JavaScript-rendered page or a paywall.
  // Reporting "no support found" against 200 characters of cookie notice would
  // be worse than saying the check could not run.
  if (text.length < 400) {
    return unavailable(sourceUrl, "Source page had too little readable text", MODEL);
  }

  let findings: FactCheckFinding[];
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "report" },
      messages: [
        {
          role: "user",
          content: [
            `CANDIDATE HEADLINE:\n${title}`,
            `CANDIDATE BODY:\n${body.slice(0, 20_000)}`,
            `SOURCE PAGE${truncated ? " (truncated — you cannot see the end)" : ""}:\n${text}`,
          ].join("\n\n---\n\n"),
        },
      ],
    });
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report",
    );
    if (!block) return unavailable(sourceUrl, "Model returned no report", MODEL);
    const raw = (block.input as { findings?: unknown }).findings;
    findings = Array.isArray(raw) ? (raw as FactCheckFinding[]) : [];
  } catch (e) {
    return unavailable(sourceUrl, `Model call failed: ${(e as Error).message}`, MODEL);
  }

  return {
    state: findings.length > 0 ? "notes" : "clean",
    findings,
    sourceUrl,
    sourceChars: text.length,
    truncated,
    model: MODEL,
    checkedAt: new Date().toISOString(),
  };
}
