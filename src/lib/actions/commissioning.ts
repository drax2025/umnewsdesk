"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type CommissionStatus = "briefed" | "accepted" | "declined" | "in_progress" | "filed";

const STATUS_VALUES: CommissionStatus[] = [
  "briefed",
  "accepted",
  "declined",
  "in_progress",
  "filed",
];

const REVALIDATE_PATHS = [
  "/commissioning",
  "/discovery/inbox",
  "/discovery",
  "/pipeline",
  "/",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

/**
 * Seed brief text the editor sees the moment a candidate is commissioned.
 * Just the source URL + whatever blurb the feed gave us — enough that the
 * assignee has the link in one place without forcing the editor to retype
 * anything. "Draft from source" extends this via Claude on demand.
 */
function starterBrief(cand: {
  working_headline: string;
  summary: string | null;
  primary_url: string | null;
  author: string | null;
  published_at: string | null;
}): string {
  const lines: string[] = [];
  if (cand.primary_url) lines.push(`Source: ${cand.primary_url}`);
  if (cand.author) lines.push(`Byline: ${cand.author}`);
  if (cand.published_at) {
    lines.push(`Published: ${new Date(cand.published_at).toISOString().slice(0, 10)}`);
  }
  if (lines.length > 0) lines.push("");
  lines.push(cand.summary?.trim() || cand.working_headline);
  return lines.join("\n");
}

/**
 * Derive a usable standfirst from the lede paragraph of a press release.
 *
 * Press releases reliably front-load the news in the first paragraph —
 * 1–3 sentences capping under ~280 chars. We pull that lede off the
 * extracted body so the article opens with a draft standfirst rather
 * than a blank field. The editor edits or replaces it.
 *
 * Skips markdown headings (lines starting with #) and short orphan lines
 * (titles, datelines like "EDINBURGH, 12 JUNE 2026 –") that aren't the
 * lede sentence.
 */
function deriveStandfirstFromBody(body: string | null): string | null {
  if (!body) return null;
  const lines = body.split(/\n+/).map((l) => l.trim());
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#")) continue; // markdown heading
    // Skip ALL-CAPS datelines and short orphan lines (< 60 chars) — usually
    // dateline or contact block, not the lede.
    if (line.length < 60) continue;
    if (/^[A-Z0-9 ,.\-–—]{20,}$/.test(line)) continue;
    // Take the first ~2 sentences, cap at 280 chars (Twitter-ish, fits the
    // standfirst column on most templates).
    const sentences = line.match(/[^.!?]+[.!?]+/g) ?? [line];
    let out = "";
    for (const s of sentences) {
      const next = (out ? out + " " : "") + s.trim();
      if (next.length > 280) break;
      out = next;
      if (out.length >= 180) break; // two solid sentences is plenty
    }
    if (out.length >= 60) return out.slice(0, 280);
  }
  return null;
}

function nextCode(prefix: string, last: string | null): string {
  const year = new Date().getFullYear();
  if (!last) return `${prefix}-${year}-001`;
  const m = last.match(/-(\d{3,})$/);
  const n = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return `${prefix}-${year}-${String(n).padStart(3, "0")}`;
}

export async function commissionFromCandidate(formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");
  const titleIdRaw = String(formData.get("title_id") ?? "").trim();
  if (!candidateId) {
    console.warn("[commissioning] commissionFromCandidate rejected: missing candidate_id");
    return;
  }

  const supabase = await createClient();

  const { data: cand, error: candErr } = await supabase
    .from("candidates")
    .select(
      "id, working_headline, source_id, layer, summary, primary_url, author, published_at, body_text",
    )
    .eq("id", candidateId)
    .single();
  if (candErr || !cand) {
    console.error("[commissioning] candidate lookup failed", { candidateId, candErr });
    throw new Error(
      `Could not read candidate ${candidateId} (${candErr?.code ?? "not_found"}): ${
        candErr?.message ?? "no row matched"
      }`,
    );
  }

  // Title selection:
  //   1. If the form supplied a title_id, validate it's an active title.
  //      The CommissionTitlePicker client component populates this from the
  //      editor's per-row choice (sticky via sessionStorage).
  //   2. Otherwise fall back to the oldest active title — the historical
  //      behaviour, kept so call sites that haven't adopted the picker yet
  //      (and emergency cURL-style invocations) still work in a single-title
  //      deployment.
  // Inactive titles are never selected: Section G gates commissioning to
  // active titles.
  let titleId: string | null = null;
  if (titleIdRaw) {
    const { data: picked } = await supabase
      .from("titles")
      .select("id")
      .eq("id", titleIdRaw)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>();
    titleId = picked?.id ?? null;
  }
  if (!titleId) {
    const { data: fallback } = await supabase
      .from("titles")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    titleId = fallback?.id ?? null;
  }
  if (!titleId) {
    console.error("[commissioning] no active title found for commissioning", {
      candidateId,
      requestedTitle: titleIdRaw || null,
    });
    throw new Error(
      "No active publication silo found. Activate at least one title under /system/titles before commissioning.",
    );
  }

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;

  // Create article in 'commissioned' state.
  //
  // Seed body + standfirst from the candidate's extracted text where we have
  // it. body_text was populated at ingestion (Postmark inbound for emails,
  // RSS body for feeds, attachment extraction for press releases delivered
  // as PDF/DOCX). Without this the writer would open the editor to a blank
  // page even though we already pulled the full release text on the way in.
  // deriveStandfirstFromBody picks a usable lede from the first solid
  // paragraph so the standfirst column isn't empty either — the editor
  // edits or replaces it.
  const articleBody = cand.body_text ?? null;
  const { data: article, error: artErr } = await supabase
    .from("articles")
    .insert({
      title_id: titleId,
      headline: cand.working_headline,
      body: articleBody,
      standfirst: deriveStandfirstFromBody(articleBody),
      state: "commissioned",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (artErr || !article) {
    console.error("[commissioning] article insert failed", { candidateId, titleId, artErr });
    throw new Error(
      `Could not create article (${artErr?.code ?? "?"}): ${
        artErr?.message ?? "insert returned no row"
      }. Most likely cause: signed-in user lacks editor/senior_editor role for RLS.`,
    );
  }

  // Next commission code
  const { data: lastComm } = await supabase
    .from("commissions")
    .select("code")
    .order("commissioned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const code = nextCode("COM", lastComm?.code ?? null);

  const { data: newComm, error: commErr } = await supabase
    .from("commissions")
    .insert({
      code,
      article_id: article.id,
      candidate_id: candidateId,
      brief: starterBrief(cand),
      status: "briefed",
      commissioned_by: userId,
    })
    .select("id")
    .single();
  if (commErr || !newComm) {
    console.error("[commissioning] commission insert failed", {
      candidateId,
      articleId: article.id,
      commErr,
    });
    throw new Error(
      `Article ${article.id} was created but commission row failed (${
        commErr?.code ?? "?"
      }): ${commErr?.message ?? "no row returned"}`,
    );
  }

  revalidateAll();
  if (newComm.id) redirect(`/commissioning/${newComm.id}`);
  redirect("/commissioning");
}

export async function setCommissionStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const target = String(formData.get("status") ?? "") as CommissionStatus;
  const declinedReason = String(formData.get("declined_reason") ?? "").trim() || null;
  if (!id || !STATUS_VALUES.includes(target)) return;

  const supabase = await createClient();

  const patch: Record<string, unknown> = { status: target };
  if (target === "accepted") patch.accepted_at = new Date().toISOString();
  if (target === "declined") patch.declined_reason = declinedReason;
  if (target === "filed") {
    // also bump article to 'filed' state
    const { data: comm } = await supabase
      .from("commissions")
      .select("article_id")
      .eq("id", id)
      .single();
    if (comm) {
      await supabase
        .from("articles")
        .update({ state: "filed" })
        .eq("id", comm.article_id);
    }
  }

  await supabase.from("commissions").update(patch).eq("id", id);
  revalidateAll();
}

export async function updateCommissionBrief(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const brief = String(formData.get("brief") ?? "");
  const deadlineRaw = String(formData.get("deadline_at") ?? "").trim();
  const framingRaw = String(formData.get("framing_brief") ?? "").trim();
  if (!id) return;

  const patch: Record<string, unknown> = { brief };
  if (deadlineRaw) {
    const dt = new Date(deadlineRaw);
    if (!Number.isNaN(dt.getTime())) patch.deadline_at = dt.toISOString();
  } else {
    patch.deadline_at = null;
  }

  // framing_brief is serialised JSON from the client. Empty string means
  // "clear it"; absent field means "leave as-is". Bad JSON is silently
  // skipped to keep the brief save resilient when the framing panel is
  // mid-edit.
  if (framingRaw === "") {
    patch.framing_brief = null;
  } else if (framingRaw) {
    try {
      patch.framing_brief = JSON.parse(framingRaw);
    } catch {
      // leave framing_brief untouched
    }
  }

  const supabase = await createClient();
  await supabase.from("commissions").update(patch).eq("id", id);
  revalidateAll();
}

export async function assignCommission(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const assigneeId = String(formData.get("assignee_id") ?? "").trim() || null;
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("commissions")
    .update({ assignee_id: assigneeId })
    .eq("id", id);
  revalidateAll();
}
