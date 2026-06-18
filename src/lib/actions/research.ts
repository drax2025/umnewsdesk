"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isSignalOnlyUrl,
  MAX_CONTEXT_SOURCES,
  type DependencyStatus,
  type F2Verdict,
  type FramingFeasibility,
  type OpportunityPriority,
  type SourceKind,
} from "@/lib/spec/f2-research";

/**
 * F2 Researcher server actions.
 *
 * Covers the spec's F2 operational sequence: primary identification,
 * signal-only gate (B2), independent confirmation, Tier 2 right-of-reply,
 * framing-feasibility verdict, NFP footer draft (B8/C9), B7 pipeline
 * opportunities, and the final F2 verdict (hand to F3 / back to F1 / reject).
 *
 * All write paths are gated to editor + admin. The verbatim ledger
 * (article_quotes.quote_text) preserves paragraph structure with \n\n —
 * the C1 / C3 / F7 audit chain depends on byte-exact retention.
 */

/* -------------------------------------------------------------------------- */
/*  Result type + auth gate                                                   */
/* -------------------------------------------------------------------------- */

export type ResearchActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function requireEditor(): Promise<ResearchActionResult | null> {
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

  if (me?.role !== "editor" && me?.role !== "admin") {
    return { ok: false, error: "Editors only" };
  }
  return null;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Parse helpers                                                             */
/* -------------------------------------------------------------------------- */

const SOURCE_KIND_SET = new Set<SourceKind>([
  "primary",
  "independent",
  "subject_response",
  "context",
]);
const FEASIBILITY_SET = new Set<FramingFeasibility>([
  "supported",
  "weak",
  "unsupported",
]);
const DEPENDENCY_SET = new Set<DependencyStatus>([
  "clean",
  "digit_exposed",
  "futurescot_exposed",
  "sfn_exposed",
]);
const VERDICT_SET = new Set<F2Verdict>([
  "hand_to_f3",
  "hand_back_to_f1",
  "route_to_reject",
]);

function parseKind(raw: unknown): SourceKind | null {
  const s = String(raw ?? "").trim();
  return SOURCE_KIND_SET.has(s as SourceKind) ? (s as SourceKind) : null;
}

function parseFeasibility(raw: unknown): FramingFeasibility | null {
  const s = String(raw ?? "").trim();
  return FEASIBILITY_SET.has(s as FramingFeasibility)
    ? (s as FramingFeasibility)
    : null;
}

function parseDependency(raw: unknown): DependencyStatus | null {
  const s = String(raw ?? "").trim();
  return DEPENDENCY_SET.has(s as DependencyStatus)
    ? (s as DependencyStatus)
    : null;
}

function parseVerdict(raw: unknown): F2Verdict | null {
  const s = String(raw ?? "").trim();
  return VERDICT_SET.has(s as F2Verdict) ? (s as F2Verdict) : null;
}

function parsePriority(raw: unknown): OpportunityPriority | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return n === 1 || n === 2 || n === 3 ? (n as OpportunityPriority) : null;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseBool(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function revalidate(articleId: string) {
  revalidatePath(`/articles/${articleId}/research`);
  revalidatePath(`/articles/${articleId}`);
  revalidatePath(`/articles/${articleId}/pre-flight`);
}

/* -------------------------------------------------------------------------- */
/*  Sources — add / update / delete                                           */
/* -------------------------------------------------------------------------- */

export async function addSource(fd: FormData): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const kind = parseKind(fd.get("kind"));
  const url = trimOrNull(fd.get("url"), 2048);
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!kind) return { ok: false, error: "Pick a source kind" };
  if (!url) return { ok: false, error: "URL required" };

  // B7-ish guard — limit context sources to MAX_CONTEXT_SOURCES.
  const admin = createServiceClient();
  if (kind === "context") {
    const { count } = await admin
      .from("article_sources")
      .select("id", { count: "exact", head: true })
      .eq("article_id", article_id)
      .eq("kind", "context");
    if ((count ?? 0) >= MAX_CONTEXT_SOURCES) {
      return {
        ok: false,
        error: `Maximum ${MAX_CONTEXT_SOURCES} context sources per article (spec F2 step 5).`,
      };
    }
  }

  const uid = await currentUserId();
  const { data, error } = await admin
    .from("article_sources")
    .insert({
      article_id,
      kind,
      url,
      title: trimOrNull(fd.get("title"), 500),
      publisher: trimOrNull(fd.get("publisher"), 240),
      published_at: trimOrNull(fd.get("published_at"), 64),
      author: trimOrNull(fd.get("author"), 240),
      content: trimOrNull(fd.get("content"), 200_000),
      is_signal_only: isSignalOnlyUrl(url) || parseBool(fd.get("is_signal_only")),
      is_paywalled: parseBool(fd.get("is_paywalled")),
      notes: trimOrNull(fd.get("notes"), 1200),
      fetched_by: uid,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true, id: data?.id };
}

export async function updateSource(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const kind = parseKind(fd.get("kind"));
  const url = trimOrNull(fd.get("url"), 2048);
  if (!kind) return { ok: false, error: "Pick a source kind" };
  if (!url) return { ok: false, error: "URL required" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_sources")
    .update({
      kind,
      url,
      title: trimOrNull(fd.get("title"), 500),
      publisher: trimOrNull(fd.get("publisher"), 240),
      published_at: trimOrNull(fd.get("published_at"), 64),
      author: trimOrNull(fd.get("author"), 240),
      content: trimOrNull(fd.get("content"), 200_000),
      is_signal_only: isSignalOnlyUrl(url) || parseBool(fd.get("is_signal_only")),
      is_paywalled: parseBool(fd.get("is_paywalled")),
      notes: trimOrNull(fd.get("notes"), 1200),
    })
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

export async function deleteSource(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_sources")
    .delete()
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Quotes — verbatim ledger (B1/C1/C3 substrate)                             */
/* -------------------------------------------------------------------------- */

export async function addQuote(fd: FormData): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const quote_text = String(fd.get("quote_text") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!quote_text) return { ok: false, error: "Quote text required" };

  const source_id = String(fd.get("source_id") ?? "").trim() || null;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("article_quotes")
    .insert({
      article_id,
      source_id,
      // C3 paragraph-break preservation: store as-is, do NOT collapse whitespace.
      quote_text,
      speaker: trimOrNull(fd.get("speaker"), 240),
      role: trimOrNull(fd.get("role"), 240),
      institution: trimOrNull(fd.get("institution"), 240),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true, id: data?.id };
}

export async function updateQuote(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const quote_text = String(fd.get("quote_text") ?? "").trim();
  if (!quote_text) return { ok: false, error: "Quote text required" };
  const source_id = String(fd.get("source_id") ?? "").trim() || null;

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_quotes")
    .update({
      source_id,
      quote_text,
      speaker: trimOrNull(fd.get("speaker"), 240),
      role: trimOrNull(fd.get("role"), 240),
      institution: trimOrNull(fd.get("institution"), 240),
    })
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

export async function deleteQuote(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_quotes")
    .delete()
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Research record — feasibility, dependency, NFP, partial save              */
/* -------------------------------------------------------------------------- */

export async function saveResearchRecord(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const admin = createServiceClient();
  const { error } = await admin.from("article_research").upsert(
    {
      article_id,
      framing_feasibility: parseFeasibility(fd.get("framing_feasibility")),
      feasibility_evidence: trimOrNull(fd.get("feasibility_evidence"), 2400),
      dependency_status: parseDependency(fd.get("dependency_status")),
      primary_paywalled: parseBool(fd.get("primary_paywalled")),
      nfp_footer_draft: trimOrNull(fd.get("nfp_footer_draft"), 2400),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "article_id" },
  );

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Verdict transition — hand to F3, back to F1, or route to reject           */
/* -------------------------------------------------------------------------- */

export async function setResearchVerdict(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const verdict = parseVerdict(fd.get("verdict"));
  if (!verdict) return { ok: false, error: "Pick a verdict" };

  const rationale = trimOrNull(fd.get("verdict_rationale"), 2400);
  const uid = await currentUserId();
  const now = new Date().toISOString();

  const admin = createServiceClient();

  // Upsert the verdict on the research record.
  const { error: upsertErr } = await admin.from("article_research").upsert(
    {
      article_id,
      verdict,
      verdict_at: now,
      verdict_by: uid,
      verdict_rationale: rationale,
      updated_at: now,
    },
    { onConflict: "article_id" },
  );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  // Optionally update the parent article.state when handing back / rejecting.
  // F3 hand-off is informational here — the actual state transition happens
  // when the Writer accepts via the writing surface.
  if (verdict === "route_to_reject") {
    await admin
      .from("articles")
      .update({ state: "rejected" })
      .eq("id", article_id);
  }

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  B7 pipeline opportunities                                                 */
/* -------------------------------------------------------------------------- */

export async function addOpportunity(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const title = trimOrNull(fd.get("title"), 240);
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!title) return { ok: false, error: "Title required" };

  const uid = await currentUserId();
  const admin = createServiceClient();

  // Denormalise title_id from the parent article so the A3 K5 view is
  // title-scoped without an extra join.
  const { data: art } = await admin
    .from("articles")
    .select("title_id")
    .eq("id", article_id)
    .maybeSingle<{ title_id: string }>();

  const sectionRaw = String(fd.get("section") ?? "").trim();
  const section =
    sectionRaw === "a_profile" ||
    sectionRaw === "b_followup" ||
    sectionRaw === "c_cluster_build" ||
    sectionRaw === "d_cross_pub" ||
    sectionRaw === "e_recurring_beat"
      ? sectionRaw
      : "b_followup";

  const { data, error } = await admin
    .from("article_pipeline_opportunities")
    .insert({
      article_id,
      title_id: art?.title_id ?? null,
      section,
      title,
      category: trimOrNull(fd.get("category"), 120),
      priority: parsePriority(fd.get("priority")),
      notes: trimOrNull(fd.get("notes"), 1200),
      created_by: uid,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true, id: data?.id };
}

export async function deleteOpportunity(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_pipeline_opportunities")
    .delete()
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Structured NFP footer (B7 / B8 / C9 / H9 / A9)                            */
/* -------------------------------------------------------------------------- */

/**
 * Persist the structured NFP footer (companion to the free-text draft).
 *
 * Accepts one form field `nfp_footer_fields` carrying a JSON string of the
 * full NFPFooterFields shape. The JSON is round-tripped through
 * normaliseNFPFooter on the way out (read side), so we trust-but-trim here.
 *
 * Keeps the free-text draft untouched — paragraph notes still belong there.
 */
export async function saveNFPFooter(
  fd: FormData,
): Promise<ResearchActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const raw = String(fd.get("nfp_footer_fields") ?? "");
  if (!raw.trim()) {
    return { ok: false, error: "Missing nfp_footer_fields JSON payload." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "nfp_footer_fields is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "nfp_footer_fields must be an object." };
  }

  const uid = await currentUserId();
  const now = new Date().toISOString();
  const admin = createServiceClient();
  const { error } = await admin.from("article_research").upsert(
    {
      article_id,
      nfp_footer_fields: parsed,
      nfp_footer_updated_at: now,
      nfp_footer_updated_by: uid,
      updated_at: now,
    },
    { onConflict: "article_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}
