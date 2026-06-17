"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  FAILURE_LOG_EVENTS,
  FAILURE_LOG_STAGES,
  type FailureLogEvent,
  type FailureLogStage,
} from "@/lib/spec/failure-log";

/**
 * Pack section 0 — cross-agent failure log.
 *
 * Three write paths:
 *
 *   - appendFailureEvent(fd)  — write a row from any F-agent
 *   - deleteFailureEvent(fd)  — drop a row (mistakes happen — audit-trail-safe
 *                                because deletes still revalidate the pack)
 *   - declareOverride(fd)     — convenience wrapper that flags an SK-OPS
 *                                override on the appended event
 *
 * The log is the canonical cross-agent record. F7's `pre_flight_failures`
 * stays in place for F7-internal A-check failures (existing contract); the
 * new article_failure_log table is the broader chronological record read
 * BEFORE the article body in the pack.
 *
 * Gated on editor + senior_editor.
 */

export type FailureLogActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const STAGE_SET = new Set<FailureLogStage>(
  FAILURE_LOG_STAGES.map((s) => s.value),
);
const EVENT_SET = new Set<FailureLogEvent>(
  FAILURE_LOG_EVENTS.map((e) => e.value),
);

/* -------------------------------------------------------------------------- */
/*  Auth helpers                                                              */
/* -------------------------------------------------------------------------- */

async function requireEditor(): Promise<FailureLogActionResult | null> {
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

function parseStage(raw: unknown): FailureLogStage | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return STAGE_SET.has(s as FailureLogStage)
    ? (s as FailureLogStage)
    : null;
}

function parseEvent(raw: unknown): FailureLogEvent | null {
  const s = String(raw ?? "").trim();
  return EVENT_SET.has(s as FailureLogEvent)
    ? (s as FailureLogEvent)
    : null;
}

function trimOrNull(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseBool(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
}

function revalidate(articleId: string) {
  revalidatePath(`/articles/${articleId}`);
  revalidatePath(`/articles/${articleId}/pre-flight`);
  revalidatePath(`/articles/${articleId}/review`);
  revalidatePath(`/articles/${articleId}/edit`);
}

/* -------------------------------------------------------------------------- */
/*  appendFailureEvent                                                        */
/* -------------------------------------------------------------------------- */

export async function appendFailureEvent(
  fd: FormData,
): Promise<FailureLogActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const article_id = String(fd.get("article_id") ?? "").trim();
  const stage = parseStage(fd.get("stage"));
  const event = parseEvent(fd.get("event"));
  const gate_code = trimOrNull(fd.get("gate_code"), 24);
  const detail = trimOrNull(fd.get("detail"), 2400);
  const remediation = trimOrNull(fd.get("remediation"), 2400);
  const override_applied = parseBool(fd.get("override_applied"));
  const override_reason = trimOrNull(fd.get("override_reason"), 2400);

  if (!article_id) return { ok: false, error: "Missing article_id" };
  if (!stage) return { ok: false, error: "Pick a stage (F1-F8)" };
  if (!event) return { ok: false, error: "Pick an event type" };
  if (!detail) return { ok: false, error: "Describe what happened (required)" };

  if (override_applied && !override_reason) {
    return {
      ok: false,
      error: "Override applied — reason required for SK-OPS log.",
    };
  }
  if (event === "override_applied" && !override_applied) {
    return {
      ok: false,
      error:
        "Event type 'override_applied' must also tick the override_applied flag.",
    };
  }

  const uid = await currentUserId();
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("article_failure_log")
    .insert({
      article_id,
      stage,
      event,
      gate_code,
      detail,
      remediation,
      override_applied,
      override_reason: override_applied ? override_reason : null,
      created_by: uid,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true, id: data?.id };
}

/* -------------------------------------------------------------------------- */
/*  deleteFailureEvent                                                        */
/* -------------------------------------------------------------------------- */

export async function deleteFailureEvent(
  fd: FormData,
): Promise<FailureLogActionResult> {
  const gate = await requireEditor();
  if (gate) return gate;

  const id = String(fd.get("id") ?? "").trim();
  const article_id = String(fd.get("article_id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id" };
  if (!article_id) return { ok: false, error: "Missing article_id" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("article_failure_log")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate(article_id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Internal helper for other server actions                                  */
/* -------------------------------------------------------------------------- */

/**
 * Server-internal: append a failure event from another action (e.g. F6 return,
 * F7 hard-gate return, F2 right-of-reply absence). Skips role-gating since the
 * calling action has already authenticated. Always provide a `detail`.
 */
export async function logFailureEventInternal(args: {
  article_id: string;
  stage: FailureLogStage;
  event: FailureLogEvent;
  gate_code?: string | null;
  detail: string;
  remediation?: string | null;
  override_applied?: boolean;
  override_reason?: string | null;
  created_by?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!args.article_id) return { ok: false, error: "Missing article_id" };
  if (!args.detail.trim()) return { ok: false, error: "detail required" };

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("article_failure_log")
    .insert({
      article_id: args.article_id,
      stage: args.stage,
      event: args.event,
      gate_code: args.gate_code ?? null,
      detail: args.detail.slice(0, 2400),
      remediation: args.remediation ? args.remediation.slice(0, 2400) : null,
      override_applied: args.override_applied ?? false,
      override_reason: args.override_applied
        ? (args.override_reason ?? null)
        : null,
      created_by: args.created_by ?? null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id ?? "" };
}
