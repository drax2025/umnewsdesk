"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  BACKDATE_KINDS,
  validateBackdate,
  type BackdateKind,
} from "@/lib/spec/f5-backdate";

/**
 * F5 step 2 — backdate selection.
 *
 * One write path:
 *   - saveBackdate(fd)  — persist backdate, kind, rationale on the article
 *   - clearBackdate(fd) — unset backdate (e.g. when reclassified to Tier 3)
 *
 * Honours the spec:
 *   - Tier 3 hard rule: backdate must be NULL.
 *   - Custom kind requires rationale.
 *   - D4 (friday-after > 6 weeks) raises a soft warning, not a block.
 *   - Future-dated backdate blocks.
 *
 * Gated on editor + admin. Defamation tier is resolved by the
 * commission → candidate join (the canonical pattern in this codebase).
 */

export type BackdateActionResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string };

const KIND_SET = new Set<BackdateKind>(BACKDATE_KINDS.map((k) => k.value));

const WRITE_PATHS = (id: string) => [
  `/articles/${id}`,
  `/articles/${id}/edit`,
  `/articles/${id}/pre-flight`,
  `/articles/${id}/review`,
  "/pipeline",
  "/board",
];

function revalidate(id: string) {
  for (const p of WRITE_PATHS(id)) revalidatePath(p);
}

async function requireEditor(): Promise<BackdateActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
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

function parseKind(raw: unknown): BackdateKind | null {
  const s = String(raw ?? "").trim();
  return KIND_SET.has(s as BackdateKind) ? (s as BackdateKind) : null;
}

function parseDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Resolve the defamation tier for an article via commissions → candidates.
 * Returns null if the chain breaks (article has no commission, etc.).
 */
async function resolveTier(
  articleId: string,
): Promise<1 | 2 | 3 | null> {
  const admin = createServiceClient();
  type Row = { candidate_id: string | null };
  const { data: comm } = await admin
    .from("commissions")
    .select("candidate_id")
    .eq("article_id", articleId)
    .maybeSingle<Row>();
  if (!comm?.candidate_id) return null;

  type CandRow = { defamation_tier: number | null };
  const { data: cand } = await admin
    .from("candidates")
    .select("defamation_tier")
    .eq("id", comm.candidate_id)
    .maybeSingle<CandRow>();
  const t = cand?.defamation_tier ?? null;
  if (t === 1 || t === 2 || t === 3) return t;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  saveBackdate                                                              */
/* -------------------------------------------------------------------------- */

export async function saveBackdate(
  fd: FormData,
): Promise<BackdateActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const articleId = String(fd.get("article_id") ?? "").trim();
  if (!articleId) return { ok: false, error: "Missing article_id" };

  const kind = parseKind(fd.get("kind"));
  if (!kind) return { ok: false, error: "Pick a backdate rule" };

  const backdate = parseDate(fd.get("backdate"));
  if (!backdate) return { ok: false, error: "Pick a backdate" };

  const rationale = trimOrNull(fd.get("rationale"), 1200);
  const eventDate = parseDate(fd.get("event_date"));

  const tier = await resolveTier(articleId);

  const validation = validateBackdate({
    backdate,
    kind,
    rationale,
    defamationTier: tier,
    eventDate,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join(" · ") };
  }

  const uid = await currentUserId();
  const isoDate = backdate.toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const admin = createServiceClient();

  const { error } = await admin
    .from("articles")
    .update({
      backdate: isoDate,
      backdate_kind: kind,
      backdate_rationale: rationale,
      backdate_set_at: now,
      backdate_set_by: uid,
      updated_by: uid,
    })
    .eq("id", articleId);
  if (error) return { ok: false, error: error.message };

  revalidate(articleId);
  return { ok: true, warnings: validation.warnings };
}

/* -------------------------------------------------------------------------- */
/*  clearBackdate                                                             */
/* -------------------------------------------------------------------------- */

export async function clearBackdate(
  fd: FormData,
): Promise<BackdateActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const articleId = String(fd.get("article_id") ?? "").trim();
  if (!articleId) return { ok: false, error: "Missing article_id" };

  const uid = await currentUserId();
  const admin = createServiceClient();
  const { error } = await admin
    .from("articles")
    .update({
      backdate: null,
      backdate_kind: null,
      backdate_rationale: null,
      backdate_set_at: null,
      backdate_set_by: null,
      updated_by: uid,
    })
    .eq("id", articleId);
  if (error) return { ok: false, error: error.message };

  revalidate(articleId);
  return { ok: true, warnings: [] };
}
