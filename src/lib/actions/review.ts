"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  GATE_CODES,
  type F6Verdict,
  type GateCode,
  type HGateStatus,
} from "@/lib/spec/f6-review";
import { logFailureEventInternal } from "@/lib/actions/failure-log";
import { isPrPiece } from "@/lib/actions/pr-piece";

/**
 * F6 Reviewer server actions.
 *
 * Three write paths:
 *
 *   - saveGate(fd)         — set one gate's status + detail (+ optional metric)
 *   - saveH11Checklist(fd) — set the ten-question D-Checklist + defence + URL
 *   - setReviewVerdict(fd) — stamp the verdict + rationale + transition state
 *
 * All three are upserts on article_review (PK = article_id). All gated on
 * editor + senior_editor. Stamping HAND-TO-F7 requires zero hard-gate fails
 * and zero pending gates.
 */

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

const STATUS_SET = new Set<HGateStatus>([
  "pending",
  "pass",
  "soft_fail",
  "fail",
  "na",
]);
const GATE_SET = new Set<GateCode>(GATE_CODES);
const VERDICT_SET = new Set<F6Verdict>([
  "hand_to_f7",
  "return_to_f1",
  "return_to_f2",
  "return_to_f3",
  "return_to_f4",
  "return_to_f5",
  "escalate",
]);

async function requireEditor(): Promise<ReviewActionResult | null> {
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

function parseStatus(raw: unknown): HGateStatus | null {
  const s = String(raw ?? "").trim();
  return STATUS_SET.has(s as HGateStatus) ? (s as HGateStatus) : null;
}

function parseGate(raw: unknown): GateCode | null {
  const s = String(raw ?? "").trim();
  return GATE_SET.has(s as GateCode) ? (s as GateCode) : null;
}

function parseVerdict(raw: unknown): F6Verdict | null {
  const s = String(raw ?? "").trim();
  return VERDICT_SET.has(s as F6Verdict) ? (s as F6Verdict) : null;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseBoolOrNull(raw: unknown): boolean | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "yes" || s === "true" || s === "1") return true;
  if (s === "no" || s === "false" || s === "0") return false;
  return null;
}

function parseIntOrNull(raw: unknown): number | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

function revalidate(articleId: string) {
  revalidatePath(`/articles/${articleId}/review`);
  revalidatePath(`/articles/${articleId}`);
}

/* -------------------------------------------------------------------------- */
/*  Bulk-stamp Tier 1 PR defaults                                             */
/* -------------------------------------------------------------------------- */

/**
 * One-click sweep for routine Tier 1 press-release pass-throughs.
 *
 * The 11-gate per-row save loop is unavoidable when an article warrants
 * gate-by-gate adjudication, but for the bread-and-butter Tier 1 PR
 * (appointment, fund close, contract win, neutral/positive announcement)
 * every gate is either a routine PASS or an N/A. Stamping each one
 * individually is busywork that doesn't change the outcome.
 *
 * This action writes the standard Tier 1 PR profile in a single upsert:
 *
 *   H1 verbatim quote         → PASS  (writer is trusted to have copied accurately
 *                                       from the supplied release; H6 footer cross-ref
 *                                       catches mistakes downstream)
 *   H2 source independence    → PASS  (single official PR source acceptable for Tier 1)
 *   H3 paragraph breaks       → PASS
 *   H4 author register        → N/A   (no first-person source material in standard PRs)
 *   H5 date reconciliation    → PASS
 *   H6 word count             → PASS  (no metric — editor can fill if non-routine)
 *   H7 link integrity         → PASS  (link count left null; editor fills if non-routine)
 *   H8 headline chars         → PASS  (chars left null; editor fills if non-routine)
 *   H9 NFP footer             → PASS
 *   H10 standing-rule sweep   → PASS
 *   H11 defamation triage     → N/A   (Tier 1 auto-N/A per spec D-Checklist)
 *
 * The stamp goes on the `*_detail` columns as a short audit string so we can
 * see later that this gate was bulk-stamped rather than individually examined.
 *
 * Refuses to run unless the article's commission has defamation_tier = 1.
 * Tier 2 needs the D-Checklist filled, tier 3 routes to reject queue.
 */
export async function stampTier1Defaults(
  fd: FormData,
): Promise<ReviewActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const admin = createServiceClient();

  // Verify Tier 1 via the commission → candidate chain. This must match how
  // the page resolves the tier badge so editors can't bypass it.
  const { data: comm } = await admin
    .from("commissions")
    .select("candidate_id")
    .eq("article_id", article_id)
    .maybeSingle<{ candidate_id: string | null }>();
  if (!comm?.candidate_id) {
    return {
      ok: false,
      error: "No commission found — cannot determine defamation tier.",
    };
  }
  const { data: cand } = await admin
    .from("candidates")
    .select("defamation_tier")
    .eq("id", comm.candidate_id)
    .maybeSingle<{ defamation_tier: 1 | 2 | 3 | null }>();
  if (cand?.defamation_tier !== 1) {
    return {
      ok: false,
      error: `Bulk-stamp is Tier 1 only (this article is ${cand?.defamation_tier ?? "untiered"}).`,
    };
  }

  const stamp = "Tier 1 PR bulk-stamp.";
  const naStamp = "Tier 1 PR — N/A per spec.";
  const now = new Date().toISOString();

  const { error } = await admin.from("article_review").upsert(
    {
      article_id,
      h1_status: "pass",  h1_detail: stamp,
      h2_status: "pass",  h2_detail: stamp,
      h3_status: "pass",  h3_detail: stamp,
      h4_status: "na",    h4_detail: naStamp,
      h5_status: "pass",  h5_detail: stamp,
      h6_status: "pass",  h6_detail: stamp,
      h7_status: "pass",  h7_detail: stamp,
      h8_status: "pass",  h8_detail: stamp,
      h9_status: "pass",  h9_detail: stamp,
      h10_status: "pass", h10_detail: stamp,
      h11_status: "na",   h11_detail: naStamp,
      updated_at: now,
    },
    { onConflict: "article_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Save one gate                                                             */
/* -------------------------------------------------------------------------- */

export async function saveGate(fd: FormData): Promise<ReviewActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const code = parseGate(fd.get("gate"));
  const status = parseStatus(fd.get("status"));
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!code) return { ok: false, error: "Unknown gate" };
  if (!status) return { ok: false, error: "Pick a status" };

  const prefix = code.toLowerCase();
  const detail = trimOrNull(fd.get("detail"), 2400);

  // Build an upsert payload keyed on the gate code. Always include the
  // PK + updated_at so the upsert resolves correctly even on first save.
  const payload: Record<string, unknown> = {
    article_id,
    [`${prefix}_status`]: status,
    [`${prefix}_detail`]: detail,
    updated_at: new Date().toISOString(),
  };

  // Per-gate metric columns (word count, link count, headline chars).
  if (code === "H6") {
    payload.h6_word_count = parseIntOrNull(fd.get("word_count"));
  }
  if (code === "H7") {
    payload.h7_internal_link_count = parseIntOrNull(
      fd.get("internal_link_count"),
    );
  }
  if (code === "H8") {
    payload.h8_headline_chars = parseIntOrNull(fd.get("headline_chars"));
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_review")
    .upsert(payload, { onConflict: "article_id" });
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Save H11 D-Checklist                                                      */
/* -------------------------------------------------------------------------- */

export async function saveH11Checklist(
  fd: FormData,
): Promise<ReviewActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const payload: Record<string, unknown> = {
    article_id,
    h11_q1_identifies_subject: parseBoolOrNull(fd.get("q1")),
    h11_q2_factual_claim: parseBoolOrNull(fd.get("q2")),
    h11_q3_claim_provable: parseBoolOrNull(fd.get("q3")),
    h11_q4_comment_basis_stated: parseBoolOrNull(fd.get("q4")),
    h11_q5_inference_framed: parseBoolOrNull(fd.get("q5")),
    h11_q6_response_cited: parseBoolOrNull(fd.get("q6")),
    h11_q7_defence_identified: parseBoolOrNull(fd.get("q7")),
    h11_q8_third_parties_considered: parseBoolOrNull(fd.get("q8")),
    h11_q9_distinguished_categories: parseBoolOrNull(fd.get("q9")),
    h11_q10_unsupported_sentence: parseBoolOrNull(fd.get("q10")),
    h11_defence: trimOrNull(fd.get("defence"), 240),
    h11_response_url: trimOrNull(fd.get("response_url"), 2048),
    h11_detail: trimOrNull(fd.get("h11_detail"), 2400),
    updated_at: new Date().toISOString(),
  };

  // Status is also accepted from caller so the same form can stamp PASS/FAIL.
  const status = parseStatus(fd.get("status"));
  if (status) payload.h11_status = status;

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_review")
    .upsert(payload, { onConflict: "article_id" });
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Verdict                                                                   */
/* -------------------------------------------------------------------------- */

export async function setReviewVerdict(
  fd: FormData,
): Promise<ReviewActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const verdict = parseVerdict(fd.get("verdict"));
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!verdict) return { ok: false, error: "Pick a verdict" };

  const rationale = trimOrNull(fd.get("verdict_rationale"), 2400);
  // PR pieces (production option 1/2) are routine pass-throughs — no rationale
  // required. Everything else must carry one for the audit trail.
  if (!rationale && !(await isPrPiece(article_id))) {
    return { ok: false, error: "Rationale is required to stamp a verdict." };
  }

  // For HAND-TO-F7, double-check the gate state: no hard-gate fails, no pending.
  if (verdict === "hand_to_f7") {
    const admin = createServiceClient();
    const { data } = await admin
      .from("article_review")
      .select(
        "h1_status, h2_status, h3_status, h4_status, h5_status, h10_status, h11_status, h6_status, h7_status, h8_status, h9_status",
      )
      .eq("article_id", article_id)
      .maybeSingle();
    if (!data) {
      return {
        ok: false,
        error: "No gate audit on file. Save the gate rows before stamping HAND TO F7.",
      };
    }
    const HARD_KEYS = [
      "h1_status",
      "h2_status",
      "h3_status",
      "h4_status",
      "h5_status",
      "h10_status",
      "h11_status",
    ] as const;
    for (const k of HARD_KEYS) {
      const st = data[k] as HGateStatus | null;
      if (st === "fail") {
        return {
          ok: false,
          error: `Cannot HAND TO F7 — ${k.toUpperCase().replace("_STATUS", "")} is a FAIL.`,
        };
      }
      if (st === "pending") {
        return {
          ok: false,
          error: `Cannot HAND TO F7 — ${k.toUpperCase().replace("_STATUS", "")} is still PENDING.`,
        };
      }
    }
  }

  const uid = await currentUserId();
  const now = new Date().toISOString();

  const admin = createServiceClient();
  const { error: upErr } = await admin.from("article_review").upsert(
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

  // Bubble state changes to articles where appropriate.
  if (verdict === "hand_to_f7") {
    await admin
      .from("articles")
      .update({ state: "legal" }) // F6→F7 transition uses 'legal' as proxy in v1 schema
      .eq("id", article_id);
  } else if (verdict === "escalate") {
    // No state change — the [ESC] channel handles it; review record holds the stamp.
    await logFailureEventInternal({
      article_id,
      stage: "F6",
      event: "hard_gate_return",
      gate_code: null,
      detail: `F6 escalated to D0: ${rationale ?? "(no rationale)"}`,
      created_by: uid,
    });
  } else if (verdict.startsWith("return_to_")) {
    const targetStage = verdict.replace("return_to_", "").toUpperCase() as
      | "F1"
      | "F2"
      | "F3"
      | "F4"
      | "F5";
    await logFailureEventInternal({
      article_id,
      stage: "F6",
      event: "hard_gate_return",
      gate_code: null,
      detail: `F6 returned to ${targetStage}: ${rationale ?? "(no rationale)"}`,
      remediation: `Re-run ${targetStage} with the H-gate issues above resolved.`,
      created_by: uid,
    });
  }

  revalidate(article_id);
  return { ok: true };
}
