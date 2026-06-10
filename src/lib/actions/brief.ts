"use server";

import { spawn } from "node:child_process";
import { createClient } from "@/lib/supabase/server";

/**
 * "Draft from source" — shells out to the Claude CLI in print mode to
 * generate a commission brief from the candidate the commission was
 * created from. Prompt goes in via stdin so we don't have to worry
 * about shell-quoting the source body.
 *
 * Runtime note: this requires the `claude` binary to be on PATH and
 * already authenticated where the Next.js server process runs. That
 * means local dev or a self-hosted node, NOT Vercel's serverless
 * runtime. Swap to the Anthropic SDK if/when we need that.
 */

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

  try {
    const text = await runClaude(prompt);
    const draft = text.trim();
    if (!draft) return { ok: false, error: "Claude returned empty output" };
    return { ok: true, draft };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Claude CLI failed",
    };
  }
}

function buildPrompt(cand: CandidateContext, article: ArticleContext | null): string {
  const sectors = article?.sectors?.join(", ") || "—";
  const geo = article?.geo_tier ?? "—";
  const body = (cand.body_text ?? "").slice(0, 6000);
  const tags = cand.tags?.join(", ") || "—";

  return [
    "You are the commissioning editor at Union Media. Write a tight commission brief for a reporter based on the source material below.",
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

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("claude", ["-p"], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      reject(e);
      return;
    }

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Claude CLI timed out after 90s"));
    }, 90_000);

    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.trim() || `Claude CLI exited with code ${code}`));
        return;
      }
      resolve(out);
    });

    child.stdin.end(prompt);
  });
}
