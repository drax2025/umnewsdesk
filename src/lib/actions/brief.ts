"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

/**
 * "Draft from source" — calls the Anthropic API to generate a structured
 * commission brief from the candidate the commission was created from.
 *
 * Runs in the Node runtime (declared on the route) using a single
 * messages.create call against the latest Claude Opus. Requires the
 * ANTHROPIC_API_KEY env var on the deployment.
 */

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1024;

export type BriefDraftResult =
  | { ok: true; draft: string }
  | { ok: false; error: string };

type CandidateContext = {
  working_headline: string;
  summary: string | null;
  body_text: string | null;
  primary_url: string | null;
  author: string | null;
  published_at: string | null;
  tags: string[] | null;
};

type ArticleContext = {
  headline: string;
  sectors: string[] | null;
  geo_tier: string | null;
};

export async function draftBriefFromSource(formData: FormData): Promise<BriefDraftResult> {
  const commissionId = String(formData.get("commission_id") ?? "");
  if (!commissionId) return { ok: false, error: "Missing commission id" };

  const supabase = await createClient();

  const { data: comm, error: commErr } = await supabase
    .from("commissions")
    .select("id, candidate_id, article_id")
    .eq("id", commissionId)
    .single();
  if (commErr || !comm) return { ok: false, error: "Commission not found" };
  if (!comm.candidate_id) {
    return { ok: false, error: "No source candidate linked — draft needs source context" };
  }

  const [candRes, artRes] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "working_headline, summary, body_text, primary_url, author, published_at, tags",
      )
      .eq("id", comm.candidate_id)
      .single(),
    supabase
      .from("articles")
      .select("headline, sectors, geo_tier")
      .eq("id", comm.article_id)
      .single(),
  ]);

  if (!candRes.data) return { ok: false, error: "Source candidate not found" };

  const prompt = buildPrompt(
    candRes.data as CandidateContext,
    (artRes.data ?? null) as ArticleContext | null,
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system:
        "You are the commissioning editor at Union Media, a UK editorial newsroom. You write tight, actionable commission briefs that reporters can act on without further clarification.",
      messages: [{ role: "user", content: prompt }],
    });

    const draft = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!draft) return { ok: false, error: "Claude returned empty output" };
    return { ok: true, draft };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Anthropic API call failed",
    };
  }
}

function buildPrompt(cand: CandidateContext, article: ArticleContext | null): string {
  const sectors = article?.sectors?.join(", ") || "—";
  const geo = article?.geo_tier ?? "—";
  const body = (cand.body_text ?? "").slice(0, 6000);
  const tags = cand.tags?.join(", ") || "—";

  return [
    "Write a tight commission brief for a reporter based on the source material below.",
    "",
    "Return ONLY the brief itself — no preamble, no markdown headings, no closing remarks. Use this exact structure with these labels:",
    "",
    "Angle: <one sentence — the specific story we want, not a topic>",
    "Why now: <one sentence — the news hook>",
    "Word count: <number + range, e.g. 600–800>",
    "Key questions:",
    "- <question>",
    "- <question>",
    "- <question>",
    "Sources to chase:",
    "- <named person, body, or document>",
    "- <named person, body, or document>",
    "Risks: <one line on legal/balance/exclusivity risk, or 'none flagged'>",
    "",
    "Source material:",
    "----------------",
    `Headline: ${cand.working_headline}`,
    article?.headline && article.headline !== cand.working_headline
      ? `Article headline (current): ${article.headline}`
      : "",
    cand.author ? `Byline: ${cand.author}` : "",
    cand.published_at ? `Published: ${cand.published_at}` : "",
    cand.primary_url ? `URL: ${cand.primary_url}` : "",
    `Sectors: ${sectors}`,
    `Geo tier: ${geo}`,
    `Tags: ${tags}`,
    "",
    cand.summary ? `Summary: ${cand.summary}` : "",
    body ? `Body excerpt:\n${body}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

