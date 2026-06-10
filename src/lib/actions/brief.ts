"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PROMPT_KEY,
  getPrompt,
  type BriefContext,
  type FramingBrief,
  type PromptTemplate,
} from "@/lib/prompts/registry";

/**
 * "Draft from source" — dispatches to a prompt from the library, calls
 * Anthropic, and returns a shape that depends on the prompt's kind.
 *
 *   commissioning  → { kind: "commissioning", text }    → goes in textarea
 *   framing        → { kind: "framing", framing }       → goes in the
 *                                                          structured panel
 *
 * The route runs in the Node runtime and needs ANTHROPIC_API_KEY set.
 */

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1024;

export type BriefDraftResult =
  | { ok: true; kind: "commissioning"; text: string }
  | { ok: true; kind: "framing"; framing: FramingBrief }
  | { ok: false; error: string };

const CATEGORY_WHITELIST = new Set([
  "AI",
  "Cyber",
  "Fintech",
  "Biotech",
  "Space",
  "Robotics",
  "Games",
  "IT",
  "Science",
  "HealthTech",
  "EdTech",
  "CleanTech",
  "Quantum",
  "Semiconductor",
  "GovTech",
  "Data",
]);

const GEO_TIERS = new Set(["scottish_origin", "uk_origin", "global_origin"]);

const PRIMARY_FRAMES = new Set([
  "Scottish Context",
  "Wider Sector Picture",
  "Technical or Scientific Depth",
  "Policy and Regulation",
  "Human Impact",
  "Comparison or Data Point",
]);

export async function draftBriefFromSource(formData: FormData): Promise<BriefDraftResult> {
  const commissionId = String(formData.get("commission_id") ?? "");
  const promptKey = String(formData.get("prompt_key") ?? DEFAULT_PROMPT_KEY);
  if (!commissionId) return { ok: false, error: "Missing commission id" };

  const template = getPrompt(promptKey);
  if (!template) return { ok: false, error: `Unknown prompt: ${promptKey}` };

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

  const ctx: BriefContext = {
    candidate: candRes.data as BriefContext["candidate"],
    article: (artRes.data ?? null) as BriefContext["article"],
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: template.system,
      messages: [{ role: "user", content: template.build(ctx) }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) return { ok: false, error: "Claude returned empty output" };

    if (template.kind === "commissioning") {
      return { ok: true, kind: "commissioning", text };
    }

    return parseFraming(text, template);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Anthropic API call failed",
    };
  }
}

function parseFraming(text: string, template: PromptTemplate): BriefDraftResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { ok: false, error: `${template.label}: model did not return JSON` };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `${template.label}: invalid JSON in model output` };
  }

  const geoRaw = String(parsed.geographic_tier ?? "").trim();
  const geo = GEO_TIERS.has(geoRaw) ? (geoRaw as FramingBrief["geographic_tier"]) : null;

  const frameRaw = String(parsed.primary_frame ?? "").trim();
  const primary = PRIMARY_FRAMES.has(frameRaw) ? frameRaw : null;

  const tagsRaw = Array.isArray(parsed.category_tags) ? parsed.category_tags : [];
  const category_tags = tagsRaw
    .map((t) => String(t).trim())
    .filter((t) => CATEGORY_WHITELIST.has(t))
    .slice(0, 3);

  const disqualified = parsed.disqualified === true;
  const framing: FramingBrief = {
    geographic_tier: geo,
    category_tags,
    primary_frame: primary,
    scottish_anchor: parsed.scottish_anchor ? String(parsed.scottish_anchor).slice(0, 200) : null,
    per_story_brief: String(parsed.per_story_brief ?? "").slice(0, 800),
    disqualified,
    disqualified_reason: disqualified
      ? String(parsed.disqualified_reason ?? "No identifiable tech angle").slice(0, 200)
      : null,
  };

  return { ok: true, kind: "framing", framing };
}
