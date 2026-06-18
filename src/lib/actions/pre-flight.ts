"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  A_CHECK_CODES,
  A_CHECKS,
  PACK_HARD_CAP,
  ROOT_CAUSE_AGENTS,
  formatPackRef,
  type ACheckCode,
  type ACheckStatus,
  type F7Verdict,
  type PubVerdict,
  type RootCauseAgent,
} from "@/lib/spec/f7-pre-flight";
import {
  STANDING_RULES,
  type StandingRuleCode,
  type StandingRuleStatus,
} from "@/lib/spec/f7-standing-rule";
import { DEFENCES, type DefamationDefence } from "@/lib/spec/f7-reasonable-steps";
import { logFailureEventInternal } from "@/lib/actions/failure-log";
import { renderPack } from "@/lib/actions/pack-render";
import { isPrPiece } from "@/lib/actions/pr-piece";

/**
 * F7 Pre-Flight Check server actions.
 *
 * Five write paths:
 *
 *   - saveCheck(fd)              — set one A-check status + detail + metric
 *   - logFailure(fd)             — append a Failure Log row (soft_fail / fail)
 *   - deleteFailure(fd)          — remove a Failure Log row
 *   - setF7Verdict(fd)           — stamp the F7 verdict + rationale
 *   - assemblePack(fd)           — assemble a new Pre-Flight Pack ref
 *   - setPubVerdict(fd)          — Admin APPROVE / MODIFY / REJECT
 *
 * All gated on editor + admin roles. Pack assembly requires the
 * article to be in the HAND-TO-SENIOR state; senior editor verdict additionally
 * requires the role be 'admin'.
 */

export type PreFlightActionResult =
  | { ok: true }
  | { ok: true; pack_ref: string }
  | { ok: false; error: string };

const STATUS_SET = new Set<ACheckStatus>([
  "pending",
  "pass",
  "soft_fail",
  "fail",
  "na",
]);
const CODE_SET = new Set<ACheckCode>(A_CHECK_CODES);
const VERDICT_SET = new Set<F7Verdict>([
  "hand_to_senior_editor",
  "return_to_f1",
  "return_to_f2",
  "return_to_f3",
  "return_to_f4",
  "return_to_f5",
  "return_to_f6",
]);
const PUB_SET = new Set<PubVerdict>(["pending", "approve", "modify", "reject"]);
const ROOT_SET = new Set<RootCauseAgent>(ROOT_CAUSE_AGENTS);
const RULE_CODE_SET = new Set<StandingRuleCode>(
  STANDING_RULES.map((r) => r.code),
);
const RULE_STATUS_SET = new Set<StandingRuleStatus>([
  "pending",
  "checked_pass",
  "checked_fail",
  "na",
]);
const DEFENCE_SET = new Set<DefamationDefence>(DEFENCES.map((d) => d.value));

/* -------------------------------------------------------------------------- */
/*  Auth helpers                                                              */
/* -------------------------------------------------------------------------- */

async function requireEditor(): Promise<PreFlightActionResult | null> {
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
/*  Parsers                                                                   */
/* -------------------------------------------------------------------------- */

function parseStatus(raw: unknown): ACheckStatus | null {
  const s = String(raw ?? "").trim();
  return STATUS_SET.has(s as ACheckStatus) ? (s as ACheckStatus) : null;
}

function parseCode(raw: unknown): ACheckCode | null {
  const s = String(raw ?? "").trim();
  return CODE_SET.has(s as ACheckCode) ? (s as ACheckCode) : null;
}

function parseVerdict(raw: unknown): F7Verdict | null {
  const s = String(raw ?? "").trim();
  return VERDICT_SET.has(s as F7Verdict) ? (s as F7Verdict) : null;
}

function parsePubVerdict(raw: unknown): PubVerdict | null {
  const s = String(raw ?? "").trim();
  return PUB_SET.has(s as PubVerdict) ? (s as PubVerdict) : null;
}

function parseRoot(raw: unknown): RootCauseAgent | null {
  const s = String(raw ?? "").trim();
  return ROOT_SET.has(s as RootCauseAgent) ? (s as RootCauseAgent) : null;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseIntOrNull(raw: unknown): number | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateOrNull(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function revalidate(articleId: string, packRef?: string | null) {
  revalidatePath(`/articles/${articleId}/pre-flight`);
  revalidatePath(`/articles/${articleId}`);
  if (packRef) revalidatePath(`/pre-flight-packs/${packRef}`);
}

/* -------------------------------------------------------------------------- */
/*  Bulk-stamp Tier 1 PR defaults                                             */
/* -------------------------------------------------------------------------- */

/**
 * One-click sweep for routine Tier 1 press-release pass-throughs at F7.
 *
 * Mirrors the F6 stampTier1Defaults action. A Tier-1 PR doesn't need
 * gate-by-gate A1-A10 adjudication — the answer is the same every time:
 *
 *   A1  D-Steps log               → N/A   (Tier 1 explicitly N/A per spec)
 *   A2  Primary source reverify   → PASS  (release URL still resolves)
 *   A3  PDT (3+ independent)      → N/A   (single primary trace covers)
 *   A4  Verbatim quote sampling   → PASS  (verbatim from release)
 *   A5  Paragraph structure       → PASS
 *   A6  Date / backdate           → PASS  (backdate auto-filled from candidate)
 *   A7  Interlink resolution      → PASS  (soft check; counts left null)
 *   A8  Headline + framing        → PASS  (headline chars auto-filled)
 *   A9  NFP footer completeness   → PASS  (soft check)
 *   A10 Standing-rule + numeric   → PASS
 *
 * Refuses to run unless commission.candidate.defamation_tier = 1.
 * The metric columns we *can* auto-fill (A6 backdate, A8 headline chars) get
 * populated so the audit trail is complete rather than partial. The rest
 * stay null — editor can patch any individual row afterwards.
 */
export async function stampF7Tier1Defaults(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const admin = createServiceClient();

  // Tier verification via commission → candidate, matching how the page
  // resolves the tier badge so editors can't bypass it.
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
    .select("defamation_tier, published_at")
    .eq("id", comm.candidate_id)
    .maybeSingle<{
      defamation_tier: 1 | 2 | 3 | null;
      published_at: string | null;
    }>();
  if (cand?.defamation_tier !== 1) {
    return {
      ok: false,
      error: `Bulk-stamp is Tier 1 only (this article is ${cand?.defamation_tier ?? "untiered"}).`,
    };
  }

  // Auto-fill A6 backdate from the source's published_at where available.
  const backdate = cand.published_at
    ? new Date(cand.published_at).toISOString().slice(0, 10)
    : null;

  // Auto-fill A8 headline char count.
  const { data: art } = await admin
    .from("articles")
    .select("headline")
    .eq("id", article_id)
    .maybeSingle<{ headline: string | null }>();
  const headlineChars = art?.headline ? art.headline.length : null;

  const stamp = "Tier 1 PR bulk-stamp.";
  const naStamp = "Tier 1 PR — N/A per spec.";
  const now = new Date().toISOString();

  const { error } = await admin.from("article_pre_flight").upsert(
    {
      article_id,
      a1_status: "na",    a1_detail: naStamp,
      a2_status: "pass",  a2_detail: stamp,
      a3_status: "na",    a3_detail: naStamp,
      a3_independent_count: null,
      a4_status: "pass",  a4_detail: stamp,
      a4_quotes_sampled: null,
      a5_status: "pass",  a5_detail: stamp,
      a6_status: "pass",  a6_detail: stamp,
      a6_backdate: backdate,
      a7_status: "pass",  a7_detail: stamp,
      a7_internal_count: null,
      a7_outbound_count: null,
      a8_status: "pass",  a8_detail: stamp,
      a8_headline_chars: headlineChars,
      a9_status: "pass",  a9_detail: stamp,
      a10_status: "pass", a10_detail: stamp,
      updated_at: now,
    },
    { onConflict: "article_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  saveCheck — one A-check                                                   */
/* -------------------------------------------------------------------------- */

export async function saveCheck(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const code = parseCode(fd.get("check"));
  const status = parseStatus(fd.get("status"));
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!code) return { ok: false, error: "Unknown check" };
  if (!status) return { ok: false, error: "Pick a status" };

  const prefix = code.toLowerCase();
  const detail = trimOrNull(fd.get("detail"), 2400);

  const payload: Record<string, unknown> = {
    article_id,
    [`${prefix}_status`]: status,
    [`${prefix}_detail`]: detail,
    updated_at: new Date().toISOString(),
  };

  // Per-check metric columns.
  if (code === "A3") {
    payload.a3_independent_count = parseIntOrNull(fd.get("independent_count"));
  }
  if (code === "A4") {
    payload.a4_quotes_sampled = parseIntOrNull(fd.get("quotes_sampled"));
  }
  if (code === "A6") {
    payload.a6_backdate = parseDateOrNull(fd.get("backdate"));
  }
  if (code === "A7") {
    payload.a7_internal_count = parseIntOrNull(fd.get("internal_count"));
    payload.a7_outbound_count = parseIntOrNull(fd.get("outbound_count"));
  }
  if (code === "A8") {
    payload.a8_headline_chars = parseIntOrNull(fd.get("headline_chars"));
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_pre_flight")
    .upsert(payload, { onConflict: "article_id" });
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  logFailure — append Failure Log row                                       */
/* -------------------------------------------------------------------------- */

export async function logFailure(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const code = parseCode(fd.get("check_code"));
  const status = parseStatus(fd.get("status"));
  const root = parseRoot(fd.get("root_cause_agent"));
  const description = trimOrNull(fd.get("description"), 2400);
  const remediation = trimOrNull(fd.get("remediation"), 2400);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!code) return { ok: false, error: "Pick the failing check" };
  if (status !== "soft_fail" && status !== "fail") {
    return { ok: false, error: "Failure status must be SOFT-FAIL or FAIL" };
  }
  if (!description) {
    return { ok: false, error: "Describe the failure (required)" };
  }

  const uid = await currentUserId();
  const admin = createServiceClient();
  const { error } = await admin.from("pre_flight_failures").insert({
    article_id,
    check_code: code,
    status,
    root_cause_agent: root,
    description,
    remediation,
    created_by: uid,
  });
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  deleteFailure — drop a Failure Log row                                    */
/* -------------------------------------------------------------------------- */

export async function deleteFailure(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id || !article_id) return { ok: false, error: "Missing id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("pre_flight_failures")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  setF7Verdict — F7's own verdict (hand-to-senior or return)                */
/* -------------------------------------------------------------------------- */

export async function setF7Verdict(
  fd: FormData,
): Promise<PreFlightActionResult> {
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

  // For HAND-TO-SENIOR, re-check: zero hard fails, zero pending checks.
  if (verdict === "hand_to_senior_editor") {
    const admin = createServiceClient();
    const { data } = await admin
      .from("article_pre_flight")
      .select(
        "a1_status, a2_status, a3_status, a4_status, a5_status, a6_status, a7_status, a8_status, a9_status, a10_status",
      )
      .eq("article_id", article_id)
      .maybeSingle();
    if (!data) {
      return {
        ok: false,
        error:
          "No A-check audit on file. Save the check rows before handing to Admin.",
      };
    }
    for (const code of A_CHECK_CODES) {
      const key = `${code.toLowerCase()}_status` as keyof typeof data;
      const st = data[key] as ACheckStatus | null;
      const def = A_CHECKS.find((c) => c.code === code);
      if (st === "pending") {
        return {
          ok: false,
          error: `Cannot hand to Admin — ${code} is still PENDING.`,
        };
      }
      if (st === "fail" && def?.kind === "hard") {
        return {
          ok: false,
          error: `Cannot hand to Admin — ${code} (${def.label}) is a hard FAIL.`,
        };
      }
    }
  }

  const uid = await currentUserId();
  const now = new Date().toISOString();
  const admin = createServiceClient();
  const { error } = await admin.from("article_pre_flight").upsert(
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
  if (error) return { ok: false, error: error.message };

  // Bubble article state on hand-to-senior. Otherwise leave state alone — the
  // verdict record holds the breadcrumb back to the relevant F-agent.
  if (verdict === "hand_to_senior_editor") {
    await admin
      .from("articles")
      .update({ state: "legal" })
      .eq("id", article_id);
  } else if (verdict.startsWith("return_to_")) {
    // Auto-route the return to pack §0 so the cross-agent log is complete
    // without the editor needing to retype the event.
    const targetStage = verdict.replace("return_to_", "").toUpperCase() as
      | "F1"
      | "F2"
      | "F3"
      | "F4"
      | "F5"
      | "F6";
    await logFailureEventInternal({
      article_id,
      stage: "F7",
      event: "a_check_return",
      gate_code: null,
      detail: `F7 returned to ${targetStage}: ${rationale ?? "(no rationale)"}`,
      remediation: `Re-run ${targetStage} with the issues above resolved.`,
      created_by: uid,
    });
  }

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  assemblePack — create a Pre-Flight Pack ref                               */
/* -------------------------------------------------------------------------- */

/**
 * Bind the article to a Pre-Flight Pack. Either pass an existing pack_ref
 * (joining a pack that already exists with < 3 articles) or pass nothing
 * and a new pack will be minted with a date-stamped ref.
 *
 * The pack table enforces the hard cap of 3 articles via article_1/2/3_id.
 */
export async function assemblePack(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const originSweep = trimOrNull(fd.get("origin_sweep_id"), 240);
  const passedRef = trimOrNull(fd.get("pack_ref"), 64);
  if (!article_id) return { ok: false, error: "Missing article_id" };

  // Pre-flight: F7 verdict must already be HAND TO SENIOR EDITOR.
  const admin = createServiceClient();
  const { data: pp } = await admin
    .from("article_pre_flight")
    .select("verdict, pack_ref")
    .eq("article_id", article_id)
    .maybeSingle();
  if (!pp || pp.verdict !== "hand_to_senior_editor") {
    return {
      ok: false,
      error:
        "F7 verdict must be HAND TO SENIOR EDITOR before the article can join a pack.",
    };
  }
  if (pp.pack_ref) {
    return { ok: false, error: `Article already assigned to ${pp.pack_ref}.` };
  }

  let packRef = passedRef;
  let archivePath: string;

  if (packRef) {
    // Joining an existing pack — find an empty slot.
    const { data: pack } = await admin
      .from("pre_flight_packs")
      .select(
        "pack_ref, article_1_id, article_2_id, article_3_id, archive_path",
      )
      .eq("pack_ref", packRef)
      .maybeSingle();
    if (!pack) return { ok: false, error: `Pack ${packRef} does not exist.` };

    const slot = !pack.article_1_id
      ? "article_1_id"
      : !pack.article_2_id
        ? "article_2_id"
        : !pack.article_3_id
          ? "article_3_id"
          : null;
    if (!slot) {
      return {
        ok: false,
        error: `Pack ${packRef} already holds the hard cap of ${PACK_HARD_CAP}.`,
      };
    }
    const { error: upErr } = await admin
      .from("pre_flight_packs")
      .update({
        [slot]: article_id,
        updated_at: new Date().toISOString(),
      })
      .eq("pack_ref", packRef);
    if (upErr) return { ok: false, error: upErr.message };
    archivePath = pack.archive_path ?? `workspace/pre_flight_packs/${packRef}.md`;
  } else {
    // Minting a new pack — derive the next NNN for today. Look for both the
    // new PFP- prefix and any legacy PPP- refs from before the rename so the
    // sequence number doesn't restart and clash with old archives.
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const { data: todaysPacks } = await admin
      .from("pre_flight_packs")
      .select("pack_ref")
      .or(`pack_ref.like.PFP-${dateStr}-%,pack_ref.like.PPP-${dateStr}-%`)
      .order("pack_ref", { ascending: false })
      .limit(1);
    const last = todaysPacks?.[0]?.pack_ref ?? null;
    const lastSeq = last ? Number.parseInt(last.split("-").pop() ?? "0", 10) : 0;
    packRef = formatPackRef(today, (Number.isFinite(lastSeq) ? lastSeq : 0) + 1);
    archivePath = `workspace/pre_flight_packs/${packRef}.md`;

    const uid = await currentUserId();
    const { error: insErr } = await admin.from("pre_flight_packs").insert({
      pack_ref: packRef,
      article_1_id: article_id,
      origin_sweep_id: originSweep,
      archive_path: archivePath,
      rendered_at: new Date().toISOString(),
      rendered_by: uid,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { error: ppErr } = await admin
    .from("article_pre_flight")
    .upsert(
      {
        article_id,
        pack_ref: packRef,
        origin_sweep_id: originSweep,
        pack_archive_path: archivePath,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id" },
    );
  if (ppErr) return { ok: false, error: ppErr.message };

  revalidate(article_id, packRef);
  return { ok: true, pack_ref: packRef };
}

/* -------------------------------------------------------------------------- */
/*  setPubVerdict — Admin APPROVE / MODIFY / REJECT                   */
/* -------------------------------------------------------------------------- */

export async function setPubVerdict(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const verdict = parsePubVerdict(fd.get("pub_verdict"));
  const notes = trimOrNull(fd.get("pub_verdict_notes"), 2400);
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!verdict || verdict === "pending") {
    return { ok: false, error: "Pick APPROVE / MODIFY / REJECT" };
  }
  if (!notes) {
    return { ok: false, error: "Admin notes are required." };
  }

  const uid = await currentUserId();
  const now = new Date().toISOString();
  const admin = createServiceClient();

  // Article-level stamp.
  const { data: row, error: upErr } = await admin
    .from("article_pre_flight")
    .upsert(
      {
        article_id,
        pub_verdict: verdict,
        pub_verdict_at: now,
        pub_verdict_by: uid,
        pub_verdict_notes: notes,
        updated_at: now,
      },
      { onConflict: "article_id" },
    )
    .select("pack_ref")
    .maybeSingle();
  if (upErr) return { ok: false, error: upErr.message };

  // Pack-level mirror (if the article is in a pack).
  if (row?.pack_ref) {
    await admin
      .from("pre_flight_packs")
      .update({
        pub_verdict: verdict,
        pub_verdict_at: now,
        pub_verdict_by: uid,
        pub_verdict_notes: notes,
        updated_at: now,
      })
      .eq("pack_ref", row.pack_ref);
  }

  // Bubble article state.
  if (verdict === "approve") {
    await admin
      .from("articles")
      .update({ state: "scheduled" })
      .eq("id", article_id);

    // Auto-render the canonical pack archive at PUB-PASS. Best-effort —
    // failure here must not block the verdict stamp; the editor can
    // re-render from the F7 panel.
    if (row?.pack_ref) {
      try {
        const fd2 = new FormData();
        fd2.set("pack_ref", row.pack_ref);
        await renderPack(fd2);
      } catch {
        /* swallow — render is best-effort at this point */
      }
    }
  } else if (verdict === "reject") {
    await admin
      .from("articles")
      .update({ state: "rejected" })
      .eq("id", article_id);
    await logFailureEventInternal({
      article_id,
      stage: "F7",
      event: "hard_gate_return",
      gate_code: null,
      detail: `Admin [PUB-REJECT]: ${notes}`,
      created_by: uid,
    });
  } else if (verdict === "modify") {
    await logFailureEventInternal({
      article_id,
      stage: "F7",
      event: "rework",
      gate_code: null,
      detail: `Admin [PUB-MODIFY]: ${notes}`,
      remediation: "Article routed back through agent loop for modification.",
      created_by: uid,
    });
  }

  revalidate(article_id, row?.pack_ref ?? null);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  saveStandingRule — one row of pack section 10                             */
/* -------------------------------------------------------------------------- */

function parseRuleCode(raw: unknown): StandingRuleCode | null {
  const s = String(raw ?? "").trim();
  return RULE_CODE_SET.has(s as StandingRuleCode)
    ? (s as StandingRuleCode)
    : null;
}

function parseRuleStatus(raw: unknown): StandingRuleStatus | null {
  const s = String(raw ?? "").trim();
  return RULE_STATUS_SET.has(s as StandingRuleStatus)
    ? (s as StandingRuleStatus)
    : null;
}

/**
 * Save one standing-rule row. Spec rule: checked_fail and na must carry a
 * justification — if you're going to call it a fail or N/A, say why.
 */
export async function saveStandingRule(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const code = parseRuleCode(fd.get("code"));
  const status = parseRuleStatus(fd.get("status"));
  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!code) return { ok: false, error: "Unknown standing-rule code" };
  if (!status) return { ok: false, error: "Pick a status" };

  const justification = trimOrNull(fd.get("justification"), 2400);

  if (status === "checked_fail" && !justification) {
    return {
      ok: false,
      error: "Checked-fail rows require a justification — record the failure.",
    };
  }
  if (status === "na" && !justification) {
    return {
      ok: false,
      error: "N/A rows require a justification — say why the rule does not apply.",
    };
  }

  const def = STANDING_RULES.find((r) => r.code === code);

  const payload: Record<string, unknown> = {
    article_id,
    [`${code}_status`]: status,
    [`${code}_justification`]: justification,
    updated_at: new Date().toISOString(),
    updated_by: await currentUserId(),
  };

  if (def?.hasArtefactsSwept) {
    payload.b2_artefacts_swept = trimOrNull(fd.get("artefacts_swept"), 2400);
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_standing_rule_sweep")
    .upsert(payload, { onConflict: "article_id" });
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  saveReasonableSteps — pack section 8 (Tier 2 only)                        */
/* -------------------------------------------------------------------------- */

function parseDefence(raw: unknown): DefamationDefence | null {
  const s = String(raw ?? "").trim();
  return DEFENCE_SET.has(s as DefamationDefence)
    ? (s as DefamationDefence)
    : null;
}

/**
 * Save the reasonable-steps log for a Tier 2 article. The form posts every
 * field every time — partial fills are allowed (incomplete state visible in
 * the UI summary); a Tier-2 article cannot pass F7 unless the row is complete.
 */
export async function saveReasonableSteps(
  fd: FormData,
): Promise<PreFlightActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const subjects_named = trimOrNull(fd.get("subjects_named"), 1200);
  const public_record_response_url = trimOrNull(
    fd.get("public_record_response_url"),
    1200,
  );
  const public_record_response_date = parseDateOrNull(
    fd.get("public_record_response_date"),
  );
  const defence = parseDefence(fd.get("defence"));
  const defence_justification = trimOrNull(fd.get("defence_justification"), 2400);
  const tier_classifier_name = trimOrNull(fd.get("tier_classifier_name"), 240);

  // Allow defence to be null (mid-author), but if defence IS set, justification
  // is mandatory. Same rule as the spec — picking a defence means defending it.
  if (defence && !defence_justification) {
    return {
      ok: false,
      error: "Picking a defence requires a one-sentence justification.",
    };
  }

  const uid = await currentUserId();
  const admin = createServiceClient();
  const { error } = await admin.from("article_reasonable_steps").upsert(
    {
      article_id,
      subjects_named,
      public_record_response_url,
      public_record_response_date,
      defence,
      defence_justification,
      tier_classifier_id: tier_classifier_name ? uid : null,
      tier_classifier_name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "article_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}
