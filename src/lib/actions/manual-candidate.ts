"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { nextCandidateCode } from "@/lib/ingest/codes";
import { checkDedup } from "@/lib/ingest/dedup";
import { normalizeHeadline, safeTrim } from "@/lib/ingest/normalize";

/**
 * Filing a story by hand.
 *
 * A tip, a competitor's piece, something mentioned in a meeting — anything no
 * feed carries. It lands in the candidate inbox as an ordinary candidate, and
 * from there is indistinguishable from a swept one except by `kind`, which is
 * the point: the desk should work one list, not two.
 *
 * Contract: docs/manual-candidates.md.
 */

export type ManualCandidateResult =
  | { ok: true; code: string }
  | { ok: false; error: string; duplicateOf?: string };

export async function addManualCandidate(fd: FormData): Promise<ManualCandidateResult> {
  try {
    return await fileStory(fd);
  } catch (e) {
    // Anything that throws in here rejects on the client, and an unhandled
    // rejection inside a transition is swallowed in production: the form goes
    // quiet and the desk believes the story was filed. Say what happened.
    const message = (e as Error)?.message ?? "Unknown error";
    console.error("addManualCandidate failed:", message);
    return { ok: false, error: `Could not add the story: ${message}` };
  }
}

async function fileStory(fd: FormData): Promise<ManualCandidateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null; role: string }>();

  const headline = safeTrim(String(fd.get("working_headline") ?? ""), 400);
  if (!headline || headline.length < 4) {
    return { ok: false, error: "A headline is required" };
  }

  const sourceId = String(fd.get("source_id") ?? "").trim();
  if (!sourceId) return { ok: false, error: "Choose a source" };

  // Optional, because a tip heard in a meeting has no URL yet. When there is
  // one it is what dedup matches on, which is why the form asks for it.
  const rawUrl = String(fd.get("primary_url") ?? "").trim();
  let primaryUrl: string | null = null;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      primaryUrl = u.toString();
    } catch {
      return { ok: false, error: "That URL does not look like a link" };
    }
  }

  // The desk's question is "when did this reach us", so this drives
  // surfaced_at — the column the inbox shows and sorts by.
  //
  // Sent as an ISO instant by the form, because a datetime-local value carries
  // no zone: the browser means London, this process runs in UTC, and parsing
  // it here read every entry an hour into the future and refused it. A bare
  // local string is still accepted for anything posting without JavaScript,
  // and is read in this process's zone — which is the best that can be done
  // without knowing the reader's.
  const when = String(fd.get("surfaced_at") ?? "").trim();
  const surfacedAt = when ? new Date(when) : new Date();
  if (Number.isNaN(surfacedAt.getTime())) {
    return { ok: false, error: "That date and time could not be read" };
  }
  // Five minutes of slack for an unsynchronised clock; an hour would mean a
  // timezone fault rather than drift, and should still be reported.
  if (surfacedAt.getTime() > Date.now() + 5 * 60_000) {
    return {
      ok: false,
      error: `That is in the future (${surfacedAt.toLocaleString("en-GB", { timeZone: "Europe/London" })})`,
    };
  }

  // The newsroom refuses a story with less than 50 characters of text —
  // "the desk cannot work from a headline and a link" — so this is what makes
  // a filed story sendable. Optional all the same: capturing the story now and
  // writing it up later is a real way to work, and losing the tip because the
  // text is not ready yet would be worse.
  const bodyText = safeTrim(String(fd.get("body_text") ?? ""), 100_000);

  const admin = createServiceClient();

  // Deduped like anything else. Adding the same story twice by hand is easy
  // and the desk would have no way of knowing.
  const dedup = await checkDedup(admin, {
    source_id: sourceId,
    external_id: primaryUrl,
    primary_url_canonical: primaryUrl,
    headline_normalized: normalizeHeadline(headline),
  });
  if (dedup.state === "duplicate") {
    const { data: match } = await admin
      .from("candidates")
      .select("code")
      .eq("id", dedup.matched_candidate_id ?? "")
      .maybeSingle<{ code: string }>();
    return {
      ok: false,
      error: `Already in the inbox as ${match?.code ?? "another candidate"} (${dedup.reason})`,
      duplicateOf: match?.code,
    };
  }

  const { data: source } = await admin
    .from("discovery_sources")
    .select("layer, stream_id")
    .eq("id", sourceId)
    .maybeSingle<{ layer: string | null; stream_id: string | null }>();

  const code = await nextCandidateCode(admin);
  const now = new Date().toISOString();

  const { error } = await admin.from("candidates").insert({
    code,
    source_id: sourceId,
    stream_id: source?.stream_id ?? null,
    layer: source?.layer ?? null,
    working_headline: headline,
    primary_url: primaryUrl,
    body_text: bodyText,
    summary: bodyText ? bodyText.slice(0, 2000) : null,
    // Stable enough to dedupe a second attempt at the same link; a story with
    // no URL falls back to the code, which is unique by construction.
    external_id: primaryUrl ?? code,
    kind: "manual",
    dedup_state: "clear",
    triage_state: "ready",
    // A person typing a headline is not verification.
    verification_state: "unverified",
    risk: "low",
    surfaced_at: surfacedAt.toISOString(),
    fetched_at: now,
    raw: {
      manual: true,
      // Captured rather than typed: the desk already knows who is signed in,
      // and a name field is a name field somebody can get wrong.
      added_by: user.id,
      added_by_name: me?.full_name ?? user.email ?? null,
      added_at: now,
      note: safeTrim(String(fd.get("note") ?? ""), 2000) ?? null,
    },
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/discovery/inbox");
  return { ok: true, code };
}
