/**
 * Prompt library — the editor picks one of these from the dropdown next
 * to the Draft button. New prompts are added by appending an entry here;
 * each is keyed and exposes its kind so the calling action knows how to
 * interpret the model's reply.
 *
 * "commissioning" prompts produce free-form reporter briefs that go into
 * the brief textarea. "framing" prompts produce the structured P2 brief
 * (six Primary frames × three Geographic tiers × up to three category
 * tags) that travels with the article per spec sections B9 and C9.
 */

export type PromptKind = "commissioning" | "framing";

export type BriefContext = {
  candidate: {
    working_headline: string;
    summary: string | null;
    body_text: string | null;
    primary_url: string | null;
    author: string | null;
    published_at: string | null;
    tags: string[] | null;
  };
  article: {
    headline: string;
    sectors: string[] | null;
    geo_tier: string | null;
  } | null;
};

export type PromptTemplate = {
  key: string;
  label: string;
  description: string;
  kind: PromptKind;
  system: string;
  build: (ctx: BriefContext) => string;
};

export type FramingBrief = {
  geographic_tier: "scottish_origin" | "uk_origin" | "global_origin" | null;
  category_tags: string[];
  primary_frame: string | null;
  scottish_anchor: string | null;
  per_story_brief: string;
  disqualified: boolean;
  disqualified_reason: string | null;
};

const SOURCE_BLOCK = (ctx: BriefContext): string => {
  const cand = ctx.candidate;
  const article = ctx.article;
  const sectors = article?.sectors?.join(", ") || "—";
  const geo = article?.geo_tier ?? "—";
  const body = (cand.body_text ?? "").slice(0, 6000);
  const tags = cand.tags?.join(", ") || "—";
  return [
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
};

const COMMISSIONING_BRIEF: PromptTemplate = {
  key: "commissioning-brief",
  label: "Commissioning brief",
  description:
    "Reporter-facing brief: angle, why now, word count, key questions, sources to chase, risks.",
  kind: "commissioning",
  system:
    "You are the commissioning editor at Union Media, a UK editorial newsroom. You write tight, actionable commission briefs that reporters can act on without further clarification.",
  build: (ctx) =>
    [
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
      SOURCE_BLOCK(ctx),
    ].join("\n"),
};

const FRAMING_BRIEF: PromptTemplate = {
  key: "framing-brief-p2",
  label: "Framing brief (spec P2)",
  description:
    "Structured Geographic tier × Category tags × Primary frame × Scottish anchor × per-story brief. Travels with the article per spec B9.",
  kind: "framing",
  system:
    "You are the Framing Agent for Silicon Scotland — a sub-prompt of F1 Triage that writes the framing brief for a given candidate. You reply with strict JSON only — no markdown, no preamble, no code fences.",
  build: (ctx) =>
    [
      "Take the press release / candidate source below and write a complete framing brief in the three-axis model (Geographic tier × Category tags × Primary frame) plus a Scottish anchor and a 2-3-sentence per-story brief.",
      "",
      "Pick exactly ONE Primary frame:",
      "- Scottish Context — what this means specifically for Scotland: jobs, investment, sector impact, named operators",
      "- Wider Sector Picture — where this sits in the UK or global sector picture, what trend it's part of",
      "- Technical or Scientific Depth — what the technology, science or method actually is",
      "- Policy and Regulation — the policy, regulation, public-funding or regulatory-body context",
      "- Human Impact — real-world impact on workers, consumers, citizens, patients, students or operators on the ground",
      "- Comparison or Data Point — anchor on a credible comparator or a single compelling statistic from a public source",
      "",
      "Pick exactly ONE Geographic tier:",
      "- scottish_origin — story breaks from a Scottish company, university, agency, regulator or event",
      "- uk_origin — story breaks from a UK source outside Scotland (find the Scottish hook)",
      "- global_origin — story breaks internationally (anchor the Scottish stake)",
      "",
      "Pick UP TO THREE Category tags (primary first) from: AI, Cyber, Fintech, Biotech, Space, Robotics, Games, IT, Science, HealthTech, EdTech, CleanTech, Quantum, Semiconductor, GovTech, Data.",
      "",
      "If no credible Primary frame can be constructed — no identifiable tech, science, digital, AI, cyber, data, biotech or research angle — return disqualified=true with reason \"No identifiable tech angle (Tech Lens applied)\". Do not stretch a frame to fit.",
      "",
      "Reply with strict JSON only — no markdown, no code fences, no preamble. Use this exact shape:",
      `{"geographic_tier":"scottish_origin|uk_origin|global_origin","category_tags":["<primary>","<secondary>","<tertiary>"],"primary_frame":"<one of the six>","scottish_anchor":"<named company / institution / regulator / market / person>","per_story_brief":"<2-3 sentences telling the Writer what to lead with, what to subordinate, and what the central point is>","disqualified":false,"disqualified_reason":null}`,
      "",
      SOURCE_BLOCK(ctx),
    ].join("\n"),
};

export const PROMPT_LIBRARY: PromptTemplate[] = [COMMISSIONING_BRIEF, FRAMING_BRIEF];

export function getPrompt(key: string): PromptTemplate | null {
  return PROMPT_LIBRARY.find((p) => p.key === key) ?? null;
}

export const DEFAULT_PROMPT_KEY = COMMISSIONING_BRIEF.key;
