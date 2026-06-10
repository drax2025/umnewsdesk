"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

/**
 * Triage scorecard (spec section C0). Scores every unscored candidate
 * against the 22-point rubric via a single Anthropic messages.create
 * per row. Runs candidates in parallel and persists the per-factor
 * breakdown as JSON so the inbox tooltip can show Claude's reasoning.
 *
 * Capped at BATCH_SIZE per click to keep request latency well inside
 * the Vercel serverless function ceiling. The button label exposes
 * how many remain so operators can click again until the queue clears.
 */

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 600;
const BATCH_SIZE = 20;

export type ScoreBreakdown = {
  scottish_relevance: number;
  sector_relevance: number;
  recency: number;
  multi_source: number;
  audience_impact: number;
  editorial_angle: number;
  press_release_quality: number;
  rationale: string;
};

export type ScoreRunResult =
  | { ok: true; scored: number; remaining: number; failed: number }
  | { ok: false; error: string };

type CandidateForScoring = {
  id: string;
  working_headline: string;
  summary: string | null;
  body_text: string | null;
  primary_url: string | null;
  author: string | null;
  published_at: string | null;
  tags: string[] | null;
};

export async function scoreUnscoredCandidates(): Promise<ScoreRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY is not configured" };

  const supabase = await createClient();

  const { data: batch, error } = await supabase
    .from("candidates")
    .select(
      "id, working_headline, summary, body_text, primary_url, author, published_at, tags",
    )
    .is("score", null)
    .order("surfaced_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (error) return { ok: false, error: error.message };
  if (!batch || batch.length === 0) {
    return { ok: true, scored: 0, remaining: 0, failed: 0 };
  }

  const client = new Anthropic({ apiKey });
  const cands = batch as CandidateForScoring[];

  const results = await Promise.allSettled(cands.map((c) => scoreOne(client, c)));

  let scored = 0;
  let failed = 0;
  await Promise.all(
    results.map(async (r, i) => {
      if (r.status !== "fulfilled") {
        failed++;
        return;
      }
      const { total, breakdown } = r.value;
      const { error: updErr } = await supabase
        .from("candidates")
        .update({ score: total, score_breakdown: breakdown })
        .eq("id", cands[i].id);
      if (updErr) failed++;
      else scored++;
    }),
  );

  const { count: remaining } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .is("score", null);

  revalidatePath("/discovery/inbox");
  return { ok: true, scored, remaining: remaining ?? 0, failed };
}

async function scoreOne(
  client: Anthropic,
  c: CandidateForScoring,
): Promise<{ total: number; breakdown: ScoreBreakdown }> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system:
      "You are the triage editor at Union Media, a UK editorial newsroom covering Scottish tech. You score candidate stories against a fixed rubric and reply with strict JSON only — no preamble, no markdown fences.",
    messages: [{ role: "user", content: buildScorePrompt(c) }],
  });

  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

  const breakdown: ScoreBreakdown = {
    scottish_relevance: clampInt(parsed.scottish_relevance, 0, 5),
    sector_relevance: clampInt(parsed.sector_relevance, 0, 4),
    recency: clampInt(parsed.recency, 0, 4),
    multi_source: clampInt(parsed.multi_source, 0, 3),
    audience_impact: clampInt(parsed.audience_impact, 0, 3),
    editorial_angle: clampInt(parsed.editorial_angle, 0, 2),
    press_release_quality: clampInt(parsed.press_release_quality, 0, 1),
    rationale: String(parsed.rationale ?? "").slice(0, 500),
  };

  const total =
    breakdown.scottish_relevance +
    breakdown.sector_relevance +
    breakdown.recency +
    breakdown.multi_source +
    breakdown.audience_impact +
    breakdown.editorial_angle +
    breakdown.press_release_quality;

  return { total, breakdown };
}

function clampInt(n: unknown, min: number, max: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function buildScorePrompt(c: CandidateForScoring): string {
  const ageHours = c.published_at
    ? Math.floor((Date.now() - new Date(c.published_at).getTime()) / 3_600_000)
    : null;
  const ageBucket =
    ageHours === null
      ? "unknown"
      : ageHours < 24
        ? "today (<24h)"
        : ageHours < 48
          ? "yesterday (24–48h)"
          : `${ageHours}h old (>48h)`;

  const body = (c.body_text ?? "").slice(0, 3000);
  const tags = c.tags?.join(", ") || "—";

  return [
    "Score this candidate against the Union Media Triage Scorecard (max 22 points). Be conservative — if a signal is genuinely absent, score 0. Multi-source is worth 0 unless the candidate itself names a second outlet covering the same story.",
    "",
    "Factors and max points:",
    "- scottish_relevance (0,2,5): 5=directly about Scotland or a Scottish company. 2=some Scottish connection. 0=none.",
    "- sector_relevance (0,2,4): 4=core sector (Space, Science, Fintech, AI, Cyber, Robotics, Games, Biotech, IT, or a clear tech angle in govt/health/sport). 2=adjacent. 0=outside.",
    "- recency (0,1,2,4): 4=today. 2=yesterday. 1=>48h with ongoing value. 0=>48h with no value.",
    "- multi_source (0,3): 3=two or more outlets covering. 0=single source or unknown.",
    "- audience_impact (0,1,3): 3=directly affects tech professionals or business owners. 1=some interest. 0=none.",
    "- editorial_angle (0,1,2): 2=distinctive angle available. 1=limited. 0=none.",
    "- press_release_quality (0,1): 1=credible source with verifiable claims (press releases only). 0=otherwise or not applicable.",
    "",
    "Reply with strict JSON only — no markdown, no code fences, no preamble. Use this exact shape:",
    `{"scottish_relevance":N,"sector_relevance":N,"recency":N,"multi_source":N,"audience_impact":N,"editorial_angle":N,"press_release_quality":N,"rationale":"<one short sentence covering the strongest factor and any disqualifier risk>"}`,
    "",
    "Candidate:",
    "----------",
    `Headline: ${c.working_headline}`,
    `Age: ${ageBucket}`,
    c.author ? `Byline: ${c.author}` : "",
    c.primary_url ? `URL: ${c.primary_url}` : "",
    `Tags: ${tags}`,
    c.summary ? `Summary: ${c.summary}` : "",
    body ? `Body excerpt:\n${body}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
