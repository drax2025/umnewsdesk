"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { factCheckCandidate } from "@/lib/fact-check/check";

/**
 * Hands a candidate to Newsroom V1, which owns everything downstream —
 * assignment, rewriting, embargoes, publishing, the agency reply and the audit
 * trail. News Desk's job ends here.
 *
 * The newsroom derives identity from the source URL, so posting the same story
 * twice makes one item there. That is what lets this retry without having to
 * reason about whether the last attempt got through — a duplicate is a success,
 * not an error.
 *
 * What comes back is recorded against the candidate, so both systems can say
 * where a story went.
 *
 * A fact-check runs on the way out — the candidate against the page it came
 * from. It is advisory and never blocks: a check that finds three problems
 * sends exactly like one that finds none, and a check that could not run sends
 * too, carrying the reason. The editor in V1 sees the notes beside the source
 * links and decides.
 */

const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

export type HandoffResult =
  | { ok: true; recordId: string; workflowId: string; duplicate: boolean }
  | { ok: false; error: string };

type CandidateRow = {
  id: string;
  code: string;
  working_headline: string;
  primary_url: string | null;
  summary: string | null;
  body_text: string | null;
  image_url: string | null;
  published_at: string | null;
  layer: string | null;
  score: number | null;
  dedup_state: string | null;
  verification_state: string | null;
  sent_to_newsroom_at: string | null;
  newsroom_record_id: string | null;
  kind: string | null;
  message_id: string | null;
  raw: { agency_name?: string | null } | null;
  discovery_sources: { name: string | null } | null;
};

/** Checks that must hold before a story is worth another newsroom's time. */
function blockingReason(c: CandidateRow): string | null {
  // Identity is the source URL for a swept page, or the Message-ID for a press
  // release, which has no page of its own. One of the two must be there or the
  // newsroom cannot recognise the story on a re-send.
  if (!c.primary_url && !c.message_id) {
    return "No source URL or Message-ID — the newsroom needs one as the story identity";
  }
  if (!c.body_text || c.body_text.trim().length < 50) {
    return "No article text — the desk cannot work from a headline and a link";
  }
  if (c.dedup_state === "duplicate") return "Marked as a duplicate";
  return null;
}

export async function sendToNewsroom(candidateId: string): Promise<HandoffResult> {
  const base = process.env.NEWSROOM_BASE_URL;
  const token = process.env.NEWSROOM_INGEST_TOKEN;
  if (!base || !token) {
    return { ok: false, error: "Newsroom handoff is not configured (NEWSROOM_BASE_URL / NEWSROOM_INGEST_TOKEN)" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id, code, working_headline, primary_url, summary, body_text, image_url, " +
      "published_at, layer, score, dedup_state, verification_state, kind, " +
      "message_id, raw, sent_to_newsroom_at, newsroom_record_id, discovery_sources(name)",
    )
    .eq("id", candidateId)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Candidate not found" };
  const candidate = data as unknown as CandidateRow;

  // Already gone. Say so rather than sending it again.
  if (candidate.sent_to_newsroom_at && candidate.newsroom_record_id) {
    return {
      ok: true,
      recordId: candidate.newsroom_record_id,
      workflowId: "",
      duplicate: true,
    };
  }

  const blocked = blockingReason(candidate);
  if (blocked) return { ok: false, error: blocked };

  // Advisory, and deliberately before the post rather than after: the notes
  // are only useful to the person who picks the story up, so they have to
  // travel with it. factCheckCandidate never throws — every failure comes back
  // as state "unavailable" with a reason attached.
  // A fact-check reads the story against the page it came from. A press release
  // has no such page — it *is* the source — so there is nothing to check it
  // against and the pass is skipped rather than faked. Sending a hollow
  // "unavailable" would read to the desk as "we tried and failed", which is
  // worse than saying nothing.
  const factCheck = candidate.primary_url
    ? await factCheckCandidate({
        sourceUrl: candidate.primary_url,
        title: candidate.working_headline,
        body: candidate.body_text as string,
      })
    : null;

  const payload = {
    candidateId: candidate.code,
    sourceUrl: candidate.primary_url ?? undefined,
    // Identity for a release that arrived as mail. The newsroom hashes this the
    // same way its own mailbox poll does, so a release reaching it down both
    // routes makes one story.
    messageId: candidate.message_id ?? undefined,
    title: candidate.working_headline,
    body: candidate.body_text,
    summary: candidate.summary ?? undefined,
    publishedAt: candidate.published_at ?? undefined,
    // The agency is a better attribution than "Press mailbox (unattributed)".
    sourceName:
      candidate.raw?.agency_name ?? candidate.discovery_sources?.name ?? undefined,
    layer: candidate.layer ?? undefined,
    score: candidate.score ?? undefined,
    imageUrl: candidate.image_url ?? undefined,
    verification: {
      state: candidate.verification_state,
      dedup: candidate.dedup_state,
    },
    factCheck,
  };

  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/ingest/candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Ingest-Token": token },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        await supabase
          .from("candidates")
          .update({
            newsroom_workflow_id: body.workflowId ?? null,
            newsroom_record_id: body.recordId ?? null,
            sent_to_newsroom_at: new Date().toISOString(),
            newsroom_send_error: null,
            fact_check: factCheck,
            fact_checked_at: factCheck?.checkedAt ?? null,
            triage_state: "sent_to_f1",
          })
          .eq("id", candidateId);
        revalidatePath("/discovery/inbox");
        return {
          ok: true,
          recordId: body.recordId ?? "",
          workflowId: body.workflowId ?? "",
          duplicate: Boolean(body.duplicate),
        };
      }

      // 4xx is our fault and will not improve on a retry; 5xx might.
      // The newsroom names every bad field; pass that through rather than a
      // bare status, because it is the desk that has to fix it.
      const problems: Array<{ field?: string; why?: string }> = Array.isArray(body.problems)
        ? body.problems
        : [];
      lastError = body.error
        ? `${body.error}${problems.length ? `: ${problems.map((p) => `${p.field} ${p.why}`).join("; ")}` : ""}`
        : `Newsroom returned ${res.status}`;
      if (res.status < 500) break;
    } catch (e) {
      lastError = e instanceof Error && e.name === "TimeoutError"
        ? "Newsroom did not respond in time"
        : e instanceof Error ? e.message : "Newsroom unreachable";
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 1000));
  }

  await supabase
    .from("candidates")
    .update({ newsroom_send_error: lastError.slice(0, 500) })
    .eq("id", candidateId);
  revalidatePath("/discovery/inbox");
  return { ok: false, error: lastError };
}
