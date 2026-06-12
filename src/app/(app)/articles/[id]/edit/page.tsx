import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Send, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { DraftEditor } from "@/components/forms/draft-editor";
import { FramingBriefPanel } from "@/components/forms/framing-brief-panel";
import { HeadlineOptionsEditor } from "@/components/forms/headline-options-editor";
import { BackdatePicker } from "@/components/forms/f5-backdate-picker";
import { submitForReview } from "@/lib/actions/article-write";
import type { BackdateKind } from "@/lib/spec/f5-backdate";
import {
  EMPTY_FRAMING_BRIEF,
  type FramingBrief,
  type CategoryTag,
  type GeographicTier,
  type PrimaryFrame,
} from "@/lib/spec/f1-triage";
import { normaliseHeadlineOptions } from "@/lib/spec/f3-headlines";

export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  headline: string;
  standfirst: string | null;
  body: string | null;
  state: string;
  slug: string | null;
  sectors: string[];
  geo_tier: string | null;
  updated_at: string;
  headline_options: unknown | null;
  headline_selected_idx: number | null;
  backdate: string | null;
  backdate_kind: BackdateKind | null;
  backdate_rationale: string | null;
};

type CommissionRow = {
  candidate_id: string | null;
  framing_brief: unknown | null;
};

type CandidateRow = {
  framing_brief: unknown | null;
  defamation_tier: number | null;
  source_published_at: string | null;
};

function coerceFramingBrief(raw: unknown): FramingBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const tier = typeof o.geographic_tier === "string" ? o.geographic_tier : null;
  const frame = typeof o.primary_frame === "string" ? o.primary_frame : null;
  const anchor =
    typeof o.scottish_anchor === "string" ? o.scottish_anchor : null;
  const brief =
    typeof o.per_story_brief === "string" ? o.per_story_brief : null;
  const tags = Array.isArray(o.category_tags)
    ? (o.category_tags.filter((t) => typeof t === "string") as CategoryTag[])
    : [];
  return {
    ...EMPTY_FRAMING_BRIEF,
    geographic_tier:
      tier === "scottish_origin" || tier === "uk_origin" || tier === "global_origin"
        ? (tier as GeographicTier)
        : null,
    primary_frame: (frame as PrimaryFrame | null) ?? null,
    scottish_anchor: anchor,
    per_story_brief: brief,
    category_tags: tags,
  };
}

type RevisionRow = {
  id: string;
  revision_no: number;
  summary: string | null;
  headline: string;
  created_at: string;
};

const STATE_PILL: Record<string, string> = {
  pitched: "border-state-pitched/35 bg-state-pitched/10 text-state-pitched",
  commissioned: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  filed: "border-state-filed/35 bg-state-filed/10 text-state-filed",
  subbed: "border-state-sub/35 bg-state-sub/10 text-state-sub",
  legal: "border-state-legal/35 bg-state-legal/10 text-state-legal",
  scheduled: "border-state-sched/35 bg-state-sched/10 text-state-sched",
  live: "border-state-live/35 bg-state-live/10 text-state-live",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  killed: "border-um-muted/30 bg-um-muted/10 text-um-muted",
};

const STATE_LABEL: Record<string, string> = {
  pitched: "Pitched",
  commissioned: "Commissioned",
  filed: "Filed",
  subbed: "Sub-edit",
  legal: "Legal",
  scheduled: "Scheduled",
  live: "Live",
  rejected: "Rejected",
  killed: "Killed",
};

// Once an article enters the review pipeline it's read-only here —
// further changes flow through approvals or sub-edit, not free writes.
const WRITER_STATES = new Set(["commissioned", "filed"]);
const READONLY_STATES = new Set(["subbed", "legal", "scheduled", "live", "rejected", "killed"]);

function fmtAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtAbs(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function ArticleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select(
      "id, headline, standfirst, body, state, slug, sectors, geo_tier, updated_at, headline_options, headline_selected_idx, backdate, backdate_kind, backdate_rationale",
    )
    .eq("id", id)
    .single<ArticleRow>();

  if (!article) notFound();

  const [{ data: revs }, { data: commission }] = await Promise.all([
    supabase
      .from("article_revisions")
      .select("id, revision_no, summary, headline, created_at")
      .eq("article_id", id)
      .order("revision_no", { ascending: false })
      .limit(20),
    supabase
      .from("commissions")
      .select("candidate_id, framing_brief")
      .eq("article_id", id)
      .maybeSingle<CommissionRow>(),
  ]);

  // Resolve framing brief: prefer commission, fall back to candidate.
  // We also need the candidate row for defamation_tier + source_published_at
  // (drives the BackdatePicker tier-lock and the friday_after suggestion).
  let framingBrief: FramingBrief | null = coerceFramingBrief(
    commission?.framing_brief,
  );
  let framingSource: "commission" | "candidate" | null = framingBrief
    ? "commission"
    : null;
  let defamationTier: 1 | 2 | 3 | null = null;
  let eventDate: string | null = null;

  if (commission?.candidate_id) {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("framing_brief, defamation_tier, source_published_at")
      .eq("id", commission.candidate_id)
      .maybeSingle<CandidateRow>();
    if (!framingBrief) {
      framingBrief = coerceFramingBrief(candidate?.framing_brief);
      framingSource = framingBrief ? "candidate" : null;
    }
    const t = candidate?.defamation_tier;
    if (t === 1 || t === 2 || t === 3) defamationTier = t;
    eventDate = candidate?.source_published_at
      ? String(candidate.source_published_at).slice(0, 10)
      : null;
  }

  const headlineOptions = normaliseHeadlineOptions(article.headline_options);
  const selectedIdxRaw = article.headline_selected_idx;
  const headlineSelectedIdx: 0 | 1 | 2 | null =
    selectedIdxRaw === 0 || selectedIdxRaw === 1 || selectedIdxRaw === 2
      ? selectedIdxRaw
      : null;

  const revisions: RevisionRow[] = revs ?? [];
  const readOnly = READONLY_STATES.has(article.state);
  const canSubmit = article.state === "commissioned";
  const canEditHeadlines = WRITER_STATES.has(article.state);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <Link
          href={`/articles/${id}`}
          className="flex items-center gap-1 text-[11.5px] font-medium text-fg-2 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dossier
        </Link>
        <span className="text-um-muted">·</span>
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">
          Write surface
        </span>
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            STATE_PILL[article.state],
          )}
        >
          {STATE_LABEL[article.state] ?? article.state}
        </span>
        {!WRITER_STATES.has(article.state) && !READONLY_STATES.has(article.state) ? (
          <span className="text-[10.5px] italic text-um-muted">
            (locked while in {STATE_LABEL[article.state]})
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          Updated {fmtAge(article.updated_at)}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto grid max-w-[1400px] gap-5 xl:grid-cols-[1fr_320px]">
          {/* Editor column */}
          <div className="flex flex-col gap-4">
            {/* B9.2 framing brief — read-only context for the Writer. */}
            <FramingBriefPanel brief={framingBrief} source={framingSource} />

            {/* F3 three-headline set + F5 selection. Locked once the article
                advances past 'filed' — H8 / C8 then audits the live headline. */}
            <HeadlineOptionsEditor
              articleId={article.id}
              initialOptions={headlineOptions}
              initialSelectedIdx={headlineSelectedIdx}
              readOnly={!canEditHeadlines}
            />

            <DraftEditor
              id={article.id}
              initialHeadline={article.headline}
              initialStandfirst={article.standfirst ?? ""}
              initialBody={article.body ?? ""}
              readOnly={readOnly}
            />

            {/* F5 step 2 — backdate selection. Tier 3 articles have it
                disabled by D-rule. Editor + senior_editor only. */}
            <BackdatePicker
              articleId={article.id}
              initialBackdate={article.backdate}
              initialKind={article.backdate_kind}
              initialRationale={article.backdate_rationale}
              defamationTier={defamationTier}
              eventDate={eventDate}
              readOnly={readOnly}
            />

            {/* Submit-for-review */}
            {canSubmit ? (
              <div className="rounded-md border border-primary/30 bg-primary/8 px-4 py-3">
                <div className="mb-1 flex items-center gap-2">
                  <Send className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[12.5px] font-semibold text-foreground">
                    File this story
                  </span>
                </div>
                <p className="mb-3 text-[11.5px] leading-[1.5] text-fg-2">
                  Submitting moves the article from{" "}
                  <span className="font-medium">Commissioned</span> to{" "}
                  <span className="font-medium">Filed</span> and places it in the
                  approvals queue. Make sure your latest draft is saved first.
                </p>
                <form action={submitForReview}>
                  <input type="hidden" name="id" value={article.id} />
                  <button
                    type="submit"
                    className="flex h-7 items-center gap-1.5 rounded-sm border border-primary bg-primary px-3 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Send className="h-3 w-3" />
                    File for sub-edit
                  </button>
                </form>
              </div>
            ) : article.state === "filed" ? (
              <div className="rounded-md border border-state-filed/30 bg-state-filed/8 px-4 py-3 text-[11.5px] text-fg-2">
                <span className="font-semibold text-foreground">Filed.</span>{" "}
                Waiting for sub-editor pickup. Continue tightening copy here — it
                stays writeable until the sub-editor advances it.
              </div>
            ) : readOnly ? (
              <div className="rounded-md border border-um-muted/25 bg-um-muted/8 px-4 py-3 text-[11.5px] text-fg-2">
                <span className="font-semibold text-foreground">Locked.</span>{" "}
                The article has advanced past the writer-edit gate. Use the{" "}
                <Link
                  href={`/approvals?id=${article.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  approvals
                </Link>{" "}
                surface to record decisions.
              </div>
            ) : null}
          </div>

          {/* Side rail: revision history */}
          <aside className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <History className="h-3.5 w-3.5 text-um-muted" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
                  Revisions
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-um-muted">
                  {revisions.length}
                </span>
              </div>
              {revisions.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] italic text-um-muted">
                  No revisions yet. Save the draft to start the history.
                </div>
              ) : (
                <ul>
                  {revisions.map((r) => (
                    <li
                      key={r.id}
                      className="border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="font-mono text-[10.5px] font-semibold tabular-nums text-foreground">
                          rev {r.revision_no}
                        </span>
                        <span
                          className="ml-auto font-mono text-[10px] text-um-muted"
                          title={fmtAbs(r.created_at)}
                        >
                          {fmtAge(r.created_at)}
                        </span>
                      </div>
                      <div className="line-clamp-1 text-[11px] text-fg-2">
                        {r.summary || (
                          <span className="italic text-um-muted">
                            (no change note)
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-3 text-[10.5px] leading-[1.5] text-um-muted">
              <p className="mb-1.5 font-semibold uppercase tracking-[0.06em] text-fg-2">
                How saves work
              </p>
              <p>
                The editor autosaves 6 seconds after you stop typing. Each save
                appends an immutable revision row. Use the change-note field to
                annotate what you changed and why.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
