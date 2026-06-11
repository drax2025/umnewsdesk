"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CATEGORY_TAGS,
  EMPTY_FRAMING_BRIEF,
  GEOGRAPHIC_TIERS,
  MAX_CATEGORY_TAGS,
  PRIMARY_FRAMES,
  type CategoryTag,
  type DefamationTier,
  type FramingBrief,
  type GeographicTier,
  type PrimaryFrame,
  type ProductionOption,
} from "@/lib/spec/f1-triage";

/**
 * F1 Triage scorecard save action.
 *
 * Captures spec section B0 (production option), D-Tiers (defamation tier) and
 * B9.1/B9.2 (three-axis framing model + brief) on a candidate row. Editors
 * and senior editors may both file F1 triage — viewers may not.
 *
 * All fields are individually optional so editors can save a partial
 * scorecard and finish later (B9.2 brief in particular is the slowest field).
 * Downstream gates (F6 H11 for tier, F2 framing-feasibility for brief)
 * enforce completeness at their own stage.
 */

export type TriageActionResult =
  | { ok: true }
  | { ok: false; error: string };

const CATEGORY_SET = new Set<CategoryTag>(CATEGORY_TAGS);
const FRAME_SET = new Set<PrimaryFrame>(PRIMARY_FRAMES);
const GEO_SET = new Set<GeographicTier>(GEOGRAPHIC_TIERS.map((t) => t.value));

async function requireEditor(): Promise<TriageActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "editor" && me?.role !== "senior_editor") {
    return { ok: false, error: "Editors only" };
  }
  return null;
}

function parseOption(raw: unknown): ProductionOption | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return n === 1 || n === 2 || n === 3 ? (n as ProductionOption) : null;
}

function parseTier(raw: unknown): DefamationTier | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return n === 1 || n === 2 || n === 3 ? (n as DefamationTier) : null;
}

function parseGeo(raw: unknown): GeographicTier | null {
  const s = String(raw ?? "").trim();
  return GEO_SET.has(s as GeographicTier) ? (s as GeographicTier) : null;
}

function parseFrame(raw: unknown): PrimaryFrame | null {
  const s = String(raw ?? "").trim();
  return FRAME_SET.has(s as PrimaryFrame) ? (s as PrimaryFrame) : null;
}

function parseTags(raw: FormDataEntryValue[] | undefined): CategoryTag[] {
  if (!raw) return [];
  const out: CategoryTag[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const s = String(v).trim();
    if (CATEGORY_SET.has(s as CategoryTag) && !seen.has(s)) {
      out.push(s as CategoryTag);
      seen.add(s);
      if (out.length >= MAX_CATEGORY_TAGS) break;
    }
  }
  return out;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

export async function saveTriageScorecard(
  fd: FormData,
): Promise<TriageActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("candidate_id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing candidate_id" };

  const brief: FramingBrief = {
    ...EMPTY_FRAMING_BRIEF,
    geographic_tier: parseGeo(fd.get("geographic_tier")),
    category_tags: parseTags(fd.getAll("category_tags")),
    primary_frame: parseFrame(fd.get("primary_frame")),
    scottish_anchor: trimOrNull(fd.get("scottish_anchor"), 240),
    per_story_brief: trimOrNull(fd.get("per_story_brief"), 1200),
  };

  const briefHasAnyField =
    brief.geographic_tier !== null ||
    brief.category_tags.length > 0 ||
    brief.primary_frame !== null ||
    brief.scottish_anchor !== null ||
    brief.per_story_brief !== null;

  const admin = createServiceClient();
  const { error } = await admin
    .from("candidates")
    .update({
      production_option: parseOption(fd.get("production_option")),
      defamation_tier: parseTier(fd.get("defamation_tier")),
      framing_brief: briefHasAnyField ? brief : null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/discovery/inbox");
  return { ok: true };
}
