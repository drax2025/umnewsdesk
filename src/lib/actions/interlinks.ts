"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  failsB4,
  isBannedDomainUrl,
  passesB4,
  type F4Verdict,
  type LinkDecision,
  type LinkKind,
  type LinkResolution,
} from "@/lib/spec/f4-interlinks";

/**
 * F4 Interlinker server actions.
 *
 * Five write paths:
 *
 *   - addInterlink(fd)     — surface a candidate (internal or outbound)
 *   - updateInterlink(fd)  — edit URL / anchor / paragraph / B4 answers / notes
 *   - resolveInterlink(fd) — run the C7 URL resolution check against the target
 *   - decideInterlink(fd)  — set decision: candidate / placed / rejected
 *   - deleteInterlink(fd)  — remove a candidate
 *   - setInterlinkerVerdict(fd) — stamp the F4 verdict (hand to F5 / back to F3 / escalate)
 *
 * All gated to editor + senior_editor. C7 banned-domain detection runs on
 * insert and update. Verdict HAND-TO-F5 server-side re-checks the C7 counts.
 */

/* -------------------------------------------------------------------------- */
/*  Result + auth                                                             */
/* -------------------------------------------------------------------------- */

export type InterlinkActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function requireEditor(): Promise<InterlinkActionResult | null> {
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

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Parsers                                                                   */
/* -------------------------------------------------------------------------- */

const KIND_SET = new Set<LinkKind>(["internal", "outbound"]);
const DECISION_SET = new Set<LinkDecision>([
  "candidate",
  "placed",
  "rejected",
]);
const VERDICT_SET = new Set<F4Verdict>([
  "hand_to_f5",
  "hand_back_to_f3",
  "escalate",
]);

function parseKind(raw: unknown): LinkKind | null {
  const s = String(raw ?? "").trim();
  return KIND_SET.has(s as LinkKind) ? (s as LinkKind) : null;
}

function parseDecision(raw: unknown): LinkDecision | null {
  const s = String(raw ?? "").trim();
  return DECISION_SET.has(s as LinkDecision) ? (s as LinkDecision) : null;
}

function parseVerdict(raw: unknown): F4Verdict | null {
  const s = String(raw ?? "").trim();
  return VERDICT_SET.has(s as F4Verdict) ? (s as F4Verdict) : null;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseBoolOrNull(raw: unknown): boolean | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "" || s === "null" || s === "unset") return null;
  if (s === "yes" || s === "true" || s === "1" || s === "on") return true;
  if (s === "no" || s === "false" || s === "0") return false;
  return null;
}

function parseIntOrNull(raw: unknown): number | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

function revalidate(articleId: string) {
  revalidatePath(`/articles/${articleId}/interlinks`);
  revalidatePath(`/articles/${articleId}`);
}

/* -------------------------------------------------------------------------- */
/*  Add candidate                                                             */
/* -------------------------------------------------------------------------- */

export async function addInterlink(
  fd: FormData,
): Promise<InterlinkActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const kind = parseKind(fd.get("kind"));
  const target_url = trimOrNull(fd.get("target_url"), 2048);
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!kind) return { ok: false, error: "Pick a link kind" };
  if (!target_url) return { ok: false, error: "Target URL required" };

  // Quick URL sanity check.
  try {
    new URL(target_url);
  } catch {
    return { ok: false, error: "Target URL is not a valid URL" };
  }

  const is_banned_domain = isBannedDomainUrl(target_url);

  const uid = await currentUserId();
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("article_interlinks")
    .insert({
      article_id,
      kind,
      target_url,
      target_article_id:
        trimOrNull(fd.get("target_article_id"), 64) ?? null,
      target_title: trimOrNull(fd.get("target_title"), 500),
      target_published_at: trimOrNull(fd.get("target_published_at"), 32),
      anchor_text: trimOrNull(fd.get("anchor_text"), 240),
      placement_paragraph: parseIntOrNull(fd.get("placement_paragraph")),
      is_banned_domain,
      notes: trimOrNull(fd.get("notes"), 1200),
      created_by: uid,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true, id: data?.id };
}

/* -------------------------------------------------------------------------- */
/*  Update candidate                                                          */
/* -------------------------------------------------------------------------- */

export async function updateInterlink(
  fd: FormData,
): Promise<InterlinkActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const kind = parseKind(fd.get("kind"));
  const target_url = trimOrNull(fd.get("target_url"), 2048);
  if (!kind) return { ok: false, error: "Pick a link kind" };
  if (!target_url) return { ok: false, error: "Target URL required" };
  try {
    new URL(target_url);
  } catch {
    return { ok: false, error: "Target URL is not a valid URL" };
  }

  const is_banned_domain = isBannedDomainUrl(target_url);

  // B4 answers — internal only. For outbound, null them.
  const b4: Record<string, boolean | null> =
    kind === "internal"
      ? {
          b4_q1_useful_context: parseBoolOrNull(fd.get("b4_q1_useful_context")),
          b4_q2_topically_related: parseBoolOrNull(fd.get("b4_q2_topically_related")),
          b4_q3_anchor_descriptive: parseBoolOrNull(fd.get("b4_q3_anchor_descriptive")),
        }
      : {
          b4_q1_useful_context: null,
          b4_q2_topically_related: null,
          b4_q3_anchor_descriptive: null,
        };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_interlinks")
    .update({
      kind,
      target_url,
      target_article_id:
        trimOrNull(fd.get("target_article_id"), 64) ?? null,
      target_title: trimOrNull(fd.get("target_title"), 500),
      target_published_at: trimOrNull(fd.get("target_published_at"), 32),
      anchor_text: trimOrNull(fd.get("anchor_text"), 240),
      placement_paragraph: parseIntOrNull(fd.get("placement_paragraph")),
      is_banned_domain,
      notes: trimOrNull(fd.get("notes"), 1200),
      ...b4,
    })
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Resolve URL (F4 step 2 — C7 URL resolution check)                         */
/* -------------------------------------------------------------------------- */

export async function resolveInterlink(
  fd: FormData,
): Promise<InterlinkActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { data: row, error: readErr } = await admin
    .from("article_interlinks")
    .select("target_url, is_banned_domain")
    .eq("id", id)
    .eq("article_id", article_id)
    .maybeSingle<{ target_url: string; is_banned_domain: boolean }>();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Interlink not found" };

  // C7: banned domains never resolve.
  if (row.is_banned_domain) {
    const { error: upErr } = await admin
      .from("article_interlinks")
      .update({
        resolution_status: "failed",
        http_status: null,
        resolution_checked_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
    revalidate(article_id);
    return { ok: true };
  }

  // Fire the request — manual redirect so we can distinguish redirect vs ok.
  let status: LinkResolution = "failed";
  let httpStatus: number | null = null;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(row.target_url, {
      method: "HEAD",
      redirect: "manual",
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; UnionMediaNewsroom/1.0; +https://unionmedia.news)",
      },
    });
    clearTimeout(timeout);
    httpStatus = res.status;
    if (res.status >= 200 && res.status < 300) status = "ok";
    else if (res.status >= 300 && res.status < 400) status = "redirect";
    else status = "failed";
  } catch {
    // Fallback: some servers refuse HEAD. Try GET.
    try {
      const ctrl2 = new AbortController();
      const timeout2 = setTimeout(() => ctrl2.abort(), 8000);
      const res2 = await fetch(row.target_url, {
        method: "GET",
        redirect: "manual",
        signal: ctrl2.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; UnionMediaNewsroom/1.0; +https://unionmedia.news)",
        },
      });
      clearTimeout(timeout2);
      httpStatus = res2.status;
      if (res2.status >= 200 && res2.status < 300) status = "ok";
      else if (res2.status >= 300 && res2.status < 400) status = "redirect";
      else status = "failed";
    } catch {
      status = "failed";
      httpStatus = null;
    }
  }

  const { error: upErr } = await admin
    .from("article_interlinks")
    .update({
      resolution_status: status,
      http_status: httpStatus,
      resolution_checked_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("article_id", article_id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Decide (candidate / placed / rejected)                                    */
/* -------------------------------------------------------------------------- */

export async function decideInterlink(
  fd: FormData,
): Promise<InterlinkActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  const decision = parseDecision(fd.get("decision"));
  if (!id || !article_id) return { ok: false, error: "Missing id" };
  if (!decision) return { ok: false, error: "Pick a decision" };

  const admin = createServiceClient();

  // Pull the row to enforce B4 + C7 server-side when promoting to 'placed'.
  const { data: row, error: readErr } = await admin
    .from("article_interlinks")
    .select(
      "kind, is_banned_domain, resolution_status, anchor_text, placement_paragraph, b4_q1_useful_context, b4_q2_topically_related, b4_q3_anchor_descriptive",
    )
    .eq("id", id)
    .eq("article_id", article_id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Interlink not found" };

  if (decision === "placed") {
    if (row.is_banned_domain) {
      return {
        ok: false,
        error:
          "Banned domain (C7: DIGIT / Futurescot / SFN). Cannot place — reject instead.",
      };
    }
    if (row.resolution_status === "failed") {
      return {
        ok: false,
        error: "URL resolution failed. Re-check or pick a different target.",
      };
    }
    if (row.resolution_status === "unchecked") {
      return {
        ok: false,
        error: "Run the URL resolution check before placing this link.",
      };
    }
    if (!row.anchor_text || !String(row.anchor_text).trim()) {
      return { ok: false, error: "Anchor text required before placing." };
    }
    if (!row.placement_paragraph) {
      return {
        ok: false,
        error: "Placement paragraph required before placing.",
      };
    }
    if (row.kind === "internal" && !passesB4(row)) {
      return {
        ok: false,
        error:
          "B4 placement test failed — all three reader-first questions must be YES to place an internal link.",
      };
    }

    // Enforce max-3 internal cap.
    if (row.kind === "internal") {
      const { count } = await admin
        .from("article_interlinks")
        .select("id", { count: "exact", head: true })
        .eq("article_id", article_id)
        .eq("kind", "internal")
        .eq("decision", "placed");
      if ((count ?? 0) >= 3) {
        return {
          ok: false,
          error:
            "Hard ceiling: max 3 internal links per article (B4). Reject one before placing another.",
        };
      }
    }
  }

  if (decision === "rejected" && row.kind === "internal" && failsB4(row)) {
    // Pure bookkeeping — fine. Just here to make intent legible.
  }

  const decision_reason = trimOrNull(fd.get("decision_reason"), 1200);
  const { error } = await admin
    .from("article_interlinks")
    .update({
      decision,
      decision_reason,
    })
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Delete                                                                    */
/* -------------------------------------------------------------------------- */

export async function deleteInterlink(
  fd: FormData,
): Promise<InterlinkActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_interlinks")
    .delete()
    .eq("id", id)
    .eq("article_id", article_id);

  if (error) return { ok: false, error: error.message };
  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Verdict                                                                   */
/* -------------------------------------------------------------------------- */

export async function setInterlinkerVerdict(
  fd: FormData,
): Promise<InterlinkActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const verdict = parseVerdict(fd.get("verdict"));
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!verdict) return { ok: false, error: "Pick a verdict" };

  const rationale = trimOrNull(fd.get("verdict_rationale"), 2400);
  if (!rationale) {
    return { ok: false, error: "Rationale is required to stamp a verdict." };
  }

  const admin = createServiceClient();

  // Re-check the C7 invariants server-side for HAND TO F5.
  if (verdict === "hand_to_f5") {
    const { data: rows } = await admin
      .from("article_interlinks")
      .select(
        "kind, decision, resolution_status, is_banned_domain",
      )
      .eq("article_id", article_id);
    const placed = (rows ?? []).filter((r) => r.decision === "placed");
    const internalCount = placed.filter((r) => r.kind === "internal").length;
    const outboundCount = placed.filter((r) => r.kind === "outbound").length;
    const bannedPlaced = placed.filter((r) => r.is_banned_domain).length;
    const brokenPlaced = placed.filter(
      (r) =>
        r.resolution_status !== "ok" && r.resolution_status !== "redirect",
    ).length;

    if (internalCount > 3) {
      return {
        ok: false,
        error: `Cannot HAND TO F5 — ${internalCount} internal links placed; cap is 3 (B4).`,
      };
    }
    if (outboundCount < 3) {
      return {
        ok: false,
        error: `Cannot HAND TO F5 — ${outboundCount}/3 outbound links placed; floor is 3 (B4).`,
      };
    }
    if (outboundCount > 5) {
      return {
        ok: false,
        error: `Cannot HAND TO F5 — ${outboundCount} outbound links placed; ceiling is 5 (B4).`,
      };
    }
    if (bannedPlaced > 0) {
      return {
        ok: false,
        error: `Cannot HAND TO F5 — ${bannedPlaced} placed link${bannedPlaced === 1 ? "" : "s"} on banned domain (C7).`,
      };
    }
    if (brokenPlaced > 0) {
      return {
        ok: false,
        error: `Cannot HAND TO F5 — ${brokenPlaced} placed link${brokenPlaced === 1 ? "" : "s"} fail${brokenPlaced === 1 ? "s" : ""} URL resolution (C7).`,
      };
    }
  }

  const uid = await currentUserId();
  const now = new Date().toISOString();

  const { error: upErr } = await admin.from("article_interlinker").upsert(
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
  if (upErr) return { ok: false, error: upErr.message };

  // F4 → F5 transition is informational; F5 is the next desk and the
  // article remains in its current state until F5 acts. F4 does not
  // mutate articles.state.

  revalidate(article_id);
  return { ok: true };
}
