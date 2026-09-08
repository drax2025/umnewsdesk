import Link from "next/link";
import { Clock, Mail, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AutoSubmitSelect } from "@/components/forms/auto-submit-select";
import { InboxRightPanel } from "@/components/discovery/inbox-right-panel";
import { escalateCandidateToOpsRr, setCandidateTriage } from "@/lib/actions/inbox";
import { SendToNewsroomButton } from "@/components/forms/send-to-newsroom-button";
import { CandidatePreviewButton } from "@/components/discovery/candidate-preview-panel";
import { RejectButton } from "@/components/discovery/reject-dialog";
import {
  InboxSelectionProvider,
  RowCheckbox,
} from "@/components/discovery/inbox-selection";

export const dynamic = "force-dynamic";

type CandidateRow = {
  id: string;
  code: string;
  /** Set once the candidate has been handed to Newsroom V1. */
  newsroom_record_id: string | null;
  sent_to_newsroom_at: string | null;
  newsroom_send_error: string | null;
  working_headline: string;
  primary_url: string | null;
  image_url: string | null;
  layer: "l1" | "l2" | "l3" | "l4";
  kind: "rss" | "email" | "pdf" | "web" | "generic" | null;
  dedup_state: "clear" | "duplicate" | "held" | "needs_review" | "pointer";
  verification_state: "verified" | "pending" | "unverified";
  triage_state:
    | "ready"
    | "held_dedup"
    | "held_source"
    | "needs_review"
    | "pointer"
    | "sent_to_f1"
    | "escalated"
    | "archived"
    | "rejected";
  risk: "low" | "med" | "high";
  embargo_until: string | null;
  embargo_confidence: "high" | "med" | "low" | "none" | null;
  attachment_urls: string[] | null;
  surfaced_at: string;
  source_id: string | null;
  raw: { agency_name?: string | null } | null;
  stream_id: string | null;
  sweep_run_id: string | null;
};

type StreamRow = { id: string; name: string; slug: string };
type SourceRow = {
  id: string;
  name: string;
  code: string;
  signal_only_eligible: boolean;
};
type SweepRow = { id: string; code: string };

type OpsAlertRow = {
  code: string;
  description: string;
  status: string;
};

const TRIAGE_STATES: { state: string; label: string }[] = [
  { state: "all", label: "All" },
  { state: "ready", label: "Ready" },
  { state: "held_dedup", label: "Held — Duplicate" },
  { state: "held_source", label: "Held — Source" },
  { state: "needs_review", label: "Needs Review" },
  { state: "pointer", label: "Pointer" },
  { state: "sent_to_f1", label: "Sent" },
  { state: "archived", label: "Archived" },
  { state: "rejected", label: "Rejected" },
];

/*
 * Kept, unused, on purpose: the Dedup / Verify / Triage columns were hidden on
 * 2026-09-07 and are expected back. Deleting these would mean rebuilding the
 * palettes from scratch to restore three columns.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TRIAGE_PILL: Record<string, string> = {
  ready: "border-success/35 bg-success/10 text-success",
  held_dedup: "border-warn/35 bg-warn/10 text-warn",
  held_source: "border-state-legal/35 bg-state-legal/10 text-state-legal",
  needs_review: "border-destructive/35 bg-destructive/10 text-destructive",
  pointer: "border-um-muted/35 bg-um-muted/10 text-um-muted",
  sent_to_f1: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  escalated: "border-destructive/40 bg-destructive/15 text-destructive",
  archived: "border-um-muted/40 bg-um-muted/15 text-um-muted",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TRIAGE_LABEL: Record<string, string> = {
  ready: "Ready",
  held_dedup: "Held · Dup",
  held_source: "Held · Source",
  needs_review: "Needs review",
  pointer: "Pointer",
  sent_to_f1: "Sent",
  escalated: "Escalated",
  archived: "Archived",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DEDUP_LABEL: Record<string, string> = {
  clear: "Clear",
  duplicate: "Duplicate",
  held: "Held",
  needs_review: "Review",
  pointer: "Pointer",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VERIFY_PILL: Record<string, string> = {
  verified: "text-success",
  pending: "text-warn",
  unverified: "text-destructive",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Date and time. Time alone was ambiguous the moment the inbox held more than
 * a day of candidates — "09:14" says nothing about which morning.
 */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${d
    .toLocaleTimeString("en-GB", { hour12: false })
    .slice(0, 5)}`;
}

/**
 * Columns the operator can sort by from the table header. F1 / Image /
 * Actions are excluded because they're either composite UI or have no
 * meaningful ordering. Default is surfaced_at desc — newest first,
 * matching the Supabase query order.
 */
type SortColumn =
  | "code"
  | "working_headline"
  | "source"
  | "surfaced_at"
  | "layer"
  | "stream"
  | "dedup_state"
  | "verification_state"
  | "triage_state";

type SortDir = "asc" | "desc";

const SORTABLE_COLUMNS: ReadonlySet<SortColumn> = new Set<SortColumn>([
  "code",
  "working_headline",
  "source",
  "surfaced_at",
  "layer",
  "stream",
  "dedup_state",
  "verification_state",
  "triage_state",
]);

/** Rows per page. The table used to show the newest 200 and nothing else. */
const PAGE_SIZE = 50;

/**
 * Supabase's query-builder type is recursive enough that writing these filter
 * helpers generically over it exceeds TypeScript's instantiation depth. The
 * same filters are applied to a rows query and to head-count queries, so the
 * shape is deliberately loose here; the columns are checked by the database.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

const DEFAULT_SORT: SortColumn = "surfaced_at";
const DEFAULT_DIR: SortDir = "desc";

/** Sensible default direction per column — surfaced_at starts desc. */
function defaultDirFor(col: SortColumn): SortDir {
  return col === "surfaced_at" ? "desc" : "asc";
}

export default async function CandidateInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    source?: string;
    layer?: string;
    stream?: string;
    verified?: string;
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeState = sp.state ?? "all";
  const activeSource = sp.source ?? "";
  const activeLayer = sp.layer ?? "";
  const activeStream = sp.stream ?? "";
  const activeVerified = sp.verified ?? "";
  const q = sp.q ?? "";
  const activeSort: SortColumn = SORTABLE_COLUMNS.has(sp.sort as SortColumn)
    ? (sp.sort as SortColumn)
    : DEFAULT_SORT;
  const activeDir: SortDir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : DEFAULT_DIR;

  const supabase = await createClient();

  // Sources and streams first: the filters arrive as a source *code* and a
  // stream *slug*, and the query needs their ids.
  const [streamsRes, sourcesRes, sweepsRes, opsRes] = await Promise.all([
    supabase.from("discovery_streams").select("id, name, slug"),
    supabase.from("discovery_sources").select("id, name, code, signal_only_eligible"),
    supabase.from("sweep_runs").select("id, code"),
    supabase
      .from("ops_rr_alerts")
      .select("code, description, status")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const streams: StreamRow[] = streamsRes.data ?? [];
  const sources: SourceRow[] = sourcesRes.data ?? [];
  const sweeps: SweepRow[] = sweepsRes.data ?? [];
  const openOps: OpsAlertRow[] = opsRes.data ?? [];

  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const sourceId = sources.find((s) => s.code === activeSource)?.id ?? null;
  const streamId = streams.find((s) => s.slug === activeStream)?.id ?? null;

  /**
   * Everything except the state pill. Filtering happens in the database, not
   * in memory: the table holds ~1,700 candidates and this page used to fetch
   * the newest 200 and filter those, so a filter searched an eighth of the
   * data and reported the result as if it were the whole.
   */
  function applyFilters(qb: QueryBuilder): QueryBuilder {
    let out: QueryBuilder = qb;
    if (sourceId) out = out.eq("source_id", sourceId);
    if (activeLayer) out = out.eq("layer", activeLayer);
    if (streamId) out = out.eq("stream_id", streamId);
    if (activeVerified) out = out.eq("verification_state", activeVerified);
    if (q) {
      // Commas and parentheses are the or() syntax's own separators.
      const safe = q.replace(/[,()]/g, " ").trim();
      if (safe) out = out.or(`working_headline.ilike.%${safe}%,code.ilike.%${safe}%`);
    }
    return out;
  }

  // "All" excludes the two terminal states — a rejected or archived candidate
  // is out of the working set; the dedicated pills are the way back to them.
  const TERMINAL = ["archived", "rejected"];
  function applyState(qb: QueryBuilder, state: string): QueryBuilder {
    return state === "all"
      ? qb.not("triage_state", "in", `(${TERMINAL.join(",")})`)
      : qb.eq("triage_state", state);
  }

  // ── the page of rows ────────────────────────────────────────────────────
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let rowQuery = supabase
    .from("candidates")
    .select(
      "id, code, working_headline, primary_url, image_url, layer, kind, dedup_state, " +
      "verification_state, triage_state, risk, embargo_until, embargo_confidence, " +
      "attachment_urls, surfaced_at, source_id, stream_id, sweep_run_id, raw, " +
      "newsroom_record_id, sent_to_newsroom_at, newsroom_send_error, " +
      // Embedded so the database can order by source/stream name.
      "discovery_sources(name), discovery_streams(name)",
      { count: "exact" },
    );
  rowQuery = applyState(applyFilters(rowQuery), activeState);

  const asc = activeDir === "asc";
  if (activeSort === "source") {
    rowQuery = rowQuery.order("name", { referencedTable: "discovery_sources", ascending: asc });
  } else if (activeSort === "stream") {
    rowQuery = rowQuery.order("name", { referencedTable: "discovery_streams", ascending: asc });
  } else {
    rowQuery = rowQuery.order(activeSort, { ascending: asc, nullsFirst: false });
  }
  // A stable tiebreak, so a row cannot appear on two pages of the same sort.
  rowQuery = rowQuery.order("id", { ascending: true });

  const { data: rowData, count: matchedCount } = await rowQuery.range(from, from + PAGE_SIZE - 1);
  const filtered: CandidateRow[] = (rowData ?? []) as unknown as CandidateRow[];
  const matched = matchedCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(matched / PAGE_SIZE));

  // ── pill counts, respecting every filter except the pill itself ─────────
  const countFor = async (state: string) => {
    const qb = applyState(
      applyFilters(supabase.from("candidates").select("id", { count: "exact", head: true })),
      state,
    );
    const { count } = await qb;
    return count ?? 0;
  };
  const countEntries = await Promise.all(
    TRIAGE_STATES.map(async (t) => [t.state, await countFor(t.state)] as const),
  );
  const counts = new Map<string, number>(countEntries);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  // Route summary numbers. These come from the same counts as the pills, so
  // the panel describes the filter the operator is actually looking at rather
  // than whatever happened to be in the first page.
  const readyCount = counts.get("ready") ?? 0;
  const heldDup = counts.get("held_dedup") ?? 0;
  const heldSource = counts.get("held_source") ?? 0;
  const pointer = counts.get("pointer") ?? 0;
  const needsReview = counts.get("needs_review") ?? 0;
  const accepted = counts.get("sent_to_f1") ?? 0;
  const triaged = accepted + heldDup;
  const acceptanceRate = triaged ? (accepted / triaged) * 100 : 0;
  const allCount = counts.get("all") ?? 0;
  const dedupRate = allCount ? (heldDup / allCount) * 100 : 0;

  const { data: oldestRow } = await applyFilters(
    supabase.from("candidates").select("surfaced_at").eq("triage_state", "ready"),
  )
    .order("surfaced_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const oldestReadyLabel = oldestRow?.surfaced_at ? relTime(oldestRow.surfaced_at) : null;
  const lastSweepCode = sweeps.length > 0 ? (sweeps[0]?.code ?? null) : null;

  // Sort/filter preservation helpers. Sort gets dropped from the URL
  // when it matches the default so a "fresh" inbox link stays clean.
  const sortIsDefault = activeSort === DEFAULT_SORT && activeDir === DEFAULT_DIR;
  const sortPreserve: { sort?: string; dir?: string } = sortIsDefault
    ? {}
    : { sort: activeSort, dir: activeDir };
  const filterPreserveParams = new URLSearchParams();
  if (activeState !== "all") filterPreserveParams.set("state", activeState);
  if (activeSource) filterPreserveParams.set("source", activeSource);
  if (activeLayer) filterPreserveParams.set("layer", activeLayer);
  if (activeStream) filterPreserveParams.set("stream", activeStream);
  if (activeVerified) filterPreserveParams.set("verified", activeVerified);
  if (q) filterPreserveParams.set("q", q);

  // Any change to what is on screen clears the selection — see
  // InboxSelectionProvider.
  const viewKey = [
    activeState, activeSource, activeLayer, activeStream, activeVerified, q,
    activeSort, activeDir,
  ].join("|");
  const selectableRows = filtered.map((c) => ({
    id: c.id,
    headline: c.working_headline,
  }));

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Status
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {TRIAGE_STATES.map((s) => {
            const isActive = s.state === activeState;
            const c = counts.get(s.state) ?? 0;
            const params = new URLSearchParams();
            if (s.state !== "all") params.set("state", s.state);
            if (activeSource) params.set("source", activeSource);
            if (activeLayer) params.set("layer", activeLayer);
            if (activeStream) params.set("stream", activeStream);
            if (activeVerified) params.set("verified", activeVerified);
            if (q) params.set("q", q);
            if (sortPreserve.sort) params.set("sort", sortPreserve.sort);
            if (sortPreserve.dir) params.set("dir", sortPreserve.dir);
            const href = params.toString()
              ? `/discovery/inbox?${params.toString()}`
              : "/discovery/inbox";
            return (
              <Link
                key={s.state}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-background text-fg-2 hover:border-border-mid hover:text-foreground",
                )}
              >
                {s.label}
                <span
                  className={cn(
                    "font-mono text-[10px] tabular-nums",
                    isActive ? "text-primary" : "text-um-muted",
                  )}
                >
                  {c}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mx-2 h-5 w-px bg-border" />

        <AutoSubmitSelect
          name="source"
          value={activeSource}
          basePath="/discovery/inbox"
          preserve={{
            state: activeState !== "all" ? activeState : undefined,
            layer: activeLayer || undefined,
            stream: activeStream || undefined,
            verified: activeVerified || undefined,
            q: q || undefined,
            sort: sortPreserve.sort,
            dir: sortPreserve.dir,
          }}
          options={[
            { value: "", label: "Source — All" },
            ...[...sources]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => ({ value: s.code, label: s.name })),
          ]}
        />

        <AutoSubmitSelect
          name="layer"
          value={activeLayer}
          basePath="/discovery/inbox"
          preserve={{
            state: activeState !== "all" ? activeState : undefined,
            source: activeSource || undefined,
            stream: activeStream || undefined,
            verified: activeVerified || undefined,
            q: q || undefined,
            sort: sortPreserve.sort,
            dir: sortPreserve.dir,
          }}
          options={[
            { value: "", label: "Layer — All" },
            { value: "l1", label: "L1 Corporate" },
            { value: "l2", label: "L2 Institutional" },
            { value: "l3", label: "L3 National" },
            { value: "l4", label: "L4 Signal" },
          ]}
        />


        <AutoSubmitSelect
          name="verified"
          value={activeVerified}
          basePath="/discovery/inbox"
          preserve={{
            state: activeState !== "all" ? activeState : undefined,
            source: activeSource || undefined,
            layer: activeLayer || undefined,
            stream: activeStream || undefined,
            q: q || undefined,
            sort: sortPreserve.sort,
            dir: sortPreserve.dir,
          }}
          options={[
            { value: "", label: "Verification — All" },
            { value: "verified", label: "Verified" },
            { value: "pending", label: "Pending" },
            { value: "unverified", label: "Unverified" },
          ]}
        />

        <form action="/discovery/inbox" className="ml-auto flex items-center gap-2">
          {activeState !== "all" ? <input type="hidden" name="state" value={activeState} /> : null}
          {activeSource ? <input type="hidden" name="source" value={activeSource} /> : null}
          {activeLayer ? <input type="hidden" name="layer" value={activeLayer} /> : null}
          {activeStream ? <input type="hidden" name="stream" value={activeStream} /> : null}
          {activeVerified ? <input type="hidden" name="verified" value={activeVerified} /> : null}
          {sortPreserve.sort ? (
            <input type="hidden" name="sort" value={sortPreserve.sort} />
          ) : null}
          {sortPreserve.dir ? (
            <input type="hidden" name="dir" value={sortPreserve.dir} />
          ) : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search headline or ID…"
            className="h-7 w-[220px] rounded-sm border border-border bg-background px-2.5 text-[11.5px] text-foreground placeholder:text-um-muted focus:border-primary focus:outline-none"
          />
        </form>
      </div>

      {/* Body 2-col. Keyed on the view so changing any filter remounts the
          selection and drops it — see InboxSelectionProvider. */}
      <InboxSelectionProvider key={viewKey} rows={selectableRows}>
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center text-[12.5px] text-um-muted">
                No candidates match these filters.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th className="w-[34px]"><span className="sr-only">Select</span></Th>
                    <SortHeader
                      column="code"
                      label="ID"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <SortHeader
                      column="working_headline"
                      label="Working Headline"
                      className="w-[260px]"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <Th className="w-[56px]">Image</Th>
                    {/* Stream column hidden 2026-09-08: 95% of candidates have
                        no stream, because a stream is inherited from the source
                        and only single-subject sources carry one — a general
                        feed like BBC Scotland is not one sector. Restoring it
                        means classifying per candidate at ingest, not per source.
                        Dedup / Verify / Triage columns hidden 2026-09-07 at the
                        desk's request — the state pills are still rendered in
                        the preview pane, and the filters above still apply.
                        Restore from git history if they are wanted back. */}
                    <SortHeader
                      column="source"
                      label="Source"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <SortHeader
                      column="surfaced_at"
                      label="Surfaced"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <SortHeader
                      column="layer"
                      label="Layer"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <Th className="text-right">Newsroom</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const source = c.source_id ? sourceMap.get(c.source_id) : null;
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border transition-colors hover:bg-secondary"
                      >
                        <td className="px-3 py-2.5">
                          <RowCheckbox id={c.id} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          {c.code}
                        </td>
                        <td className="w-[260px] max-w-[260px] px-3 py-2.5">
                          <div className="flex items-start gap-1.5">
                            {c.kind === "email" ? (
                              <Mail
                                className="mt-[3px] h-3 w-3 flex-shrink-0 text-um-muted"
                                aria-label="From press mailbox"
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              {c.primary_url ? (
                                <a
                                  href={c.primary_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block truncate text-[12.5px] font-medium text-foreground hover:text-primary"
                                >
                                  {c.working_headline}
                                </a>
                              ) : (
                                <span className="block truncate text-[12.5px] font-medium text-foreground">
                                  {c.working_headline}
                                </span>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <EmbargoChip
                                  until={c.embargo_until}
                                  confidence={c.embargo_confidence}
                                  triageState={c.triage_state}
                                  nowMs={nowMs}
                                />
                                <AttachmentChip names={c.attachment_urls} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Thumb url={c.image_url} alt={c.working_headline} />
                        </td>
                        <td className="px-3 py-2.5 text-[11.5px] text-fg-2">
                          <span className="block">
                            {c.raw?.agency_name ?? source?.name ?? "—"}
                          </span>
                          {source?.signal_only_eligible ? (
                            <span
                              className="mt-1 inline-flex items-center rounded-sm border border-warn/45 bg-warn/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-warn"
                              title="Signal-only source — awareness/intelligence only. Not a drafting basis; do not commission."
                            >
                              Signal only
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] tabular-nums text-um-muted">
                          {fmtDateTime(c.surfaced_at)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-2">
                            {c.layer}
                          </span>
                        </td>
                        {/* The handoff. Everything downstream of this - editing,
                            embargoes, publishing, the agency reply - belongs to
                            the newsroom, so this is where News Desk's job ends. */}
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Read it before sending it. Placed beside the
                                handoff because this is the moment the decision
                                is actually made. */}
                            <CandidatePreviewButton candidateId={c.id} />
                            <SendToNewsroomButton
                              candidateId={c.id}
                              sentRecordId={c.newsroom_record_id}
                              lastError={c.newsroom_send_error}
                            />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <TriageActions
                            id={c.id}
                            state={c.triage_state}
                            headline={c.working_headline}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-3 border-t border-border bg-card px-4 py-2 text-[11.5px]">
            <span className="text-fg-2">
              <strong className="font-mono font-semibold tabular-nums text-foreground">
                {filtered.length}
              </strong>{" "}
              of {matched} matching
            </span>
            <Pager
              page={page}
              pageCount={pageCount}
              matched={matched}
              params={filterPreserveParams}
              sort={sortPreserve}
            />
            <span className="ml-auto text-[11px] text-um-muted">
              Triage actions wired · F1 routing live
            </span>
          </div>
        </div>

        {/* Route Summary — collapsible client panel. Reads time-sensitive
            labels as plain strings so SSR and first paint agree. */}
        <InboxRightPanel
          readyCount={readyCount}
          heldDup={heldDup}
          heldSource={heldSource}
          pointer={pointer}
          needsReview={needsReview}
          oldestReadyLabel={oldestReadyLabel}
          acceptanceRate={acceptanceRate}
          dedupRate={dedupRate}
          lastSweepCode={lastSweepCode}
          openOps={openOps.map((o) => ({ code: o.code, description: o.description }))}
        />
      </div>
      </InboxSelectionProvider>
    </div>
  );
}

function TriageActions({
  id,
  state,
  headline,
}: {
  id: string;
  state: CandidateRow["triage_state"];
  headline: string;
}) {
  // `sent_to_f1` is kept as the enum value because it is what the database
  // holds, but F1 no longer exists — a sent candidate is one the newsroom has.
  // The Newsroom column carries the record id; this only reports the state.
  if (state === "sent_to_f1") {
    return <span className="text-[10.5px] text-um-muted">sent</span>;
  }
  if (state === "rejected") {
    return <span className="text-[10.5px] text-um-muted">rejected</span>;
  }
  if (state === "escalated") {
    return <span className="text-[10.5px] text-warn">in OPS-RR</span>;
  }
  if (state === "ready") {
    return (
      <div className="inline-flex items-center gap-1">
        <OpsEscalateMenu id={id} />
        {/* Reject replaced Dismiss on 2026-09-07: Dismiss archived a candidate
            with no reason, so a story could be closed without the desk ever
            having to say why — the thing this process exists to prevent. */}
        <RejectButton candidateId={id} headline={headline} />
      </div>
    );
  }
  // Held / needs_review / pointer / archived — give a path back to ready.
  // Archived gets a distinct label so a reviewer scanning the Archived
  // view knows they're un-doing a Dismiss rather than promoting a hold.
  const isArchived = state === "archived";
  return (
    <form action={setCandidateTriage} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="target" value="ready" />
      <button
        type="submit"
        title={isArchived ? "Restore to Ready and surface again in the inbox" : undefined}
        className="h-6 rounded-sm border border-border bg-background px-2 text-[10.5px] font-medium text-fg-2 transition-colors hover:bg-secondary"
      >
        {isArchived ? "↺ Restore" : "↺ Ready"}
      </button>
    </form>
  );
}


/**
 * Native disclosure (<details>) → absolutely-positioned form panel.
 * No client component needed: submit triggers revalidate and the
 * details element re-renders closed.
 */
function OpsEscalateMenu({ id }: { id: string }) {
  return (
    <details className="relative inline-block [&[open]>summary]:bg-warn/15">
      <summary
        className="flex h-6 cursor-pointer list-none items-center gap-0.5 rounded-sm border border-warn/40 bg-warn/10 px-2 text-[10.5px] font-medium text-warn transition-colors hover:bg-warn/15 [&::-webkit-details-marker]:hidden"
      >
        OPS-RR
        <span className="text-[8px]">▾</span>
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-[280px] rounded-md border border-border bg-card p-3 shadow-lg">
        <form action={escalateCandidateToOpsRr} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-wide text-um-muted">
                Severity
              </span>
              <select
                name="severity"
                defaultValue="p2"
                className="h-6 rounded-sm border border-border bg-background px-1.5 text-[11px] focus:border-primary focus:outline-none"
              >
                <option value="p1">p1 — 1h</option>
                <option value="p2">p2 — 4h</option>
                <option value="p3">p3 — 24h</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-wide text-um-muted">
                Issue
              </span>
              <select
                name="issue_type"
                defaultValue="config"
                className="h-6 rounded-sm border border-border bg-background px-1.5 text-[11px] focus:border-primary focus:outline-none"
              >
                <option value="config">config</option>
                <option value="parse_failure">parse_failure</option>
                <option value="schema_drift">schema_drift</option>
                <option value="wordpress_check">wordpress_check</option>
                <option value="volume_anomaly">volume_anomaly</option>
                <option value="unreachable">unreachable</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-wide text-um-muted">
              Note (required)
            </span>
            <textarea
              name="note"
              rows={2}
              required
              minLength={4}
              placeholder="What needs the desk's attention?"
              className="rounded-sm border border-border bg-background px-1.5 py-1 text-[11.5px] focus:border-primary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="h-6 rounded-sm border border-warn/40 bg-warn/10 px-2 text-[10.5px] font-semibold text-warn transition-colors hover:bg-warn/15"
          >
            File OPS-RR alert
          </button>
        </form>
      </div>
    </details>
  );
}

function EmbargoChip({
  until,
  confidence,
  triageState,
  nowMs,
}: {
  until: string | null;
  confidence: CandidateRow["embargo_confidence"];
  triageState: CandidateRow["triage_state"];
  nowMs: number;
}) {
  if (!until) return null;
  const t = new Date(until);
  const future = t.getTime() > nowMs;
  // Past + already released → no chip.
  if (!future && triageState !== "held_source") return null;

  const tone = future
    ? confidence === "high"
      ? "border-state-legal/40 bg-state-legal/10 text-state-legal"
      : confidence === "med"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-warn/40 bg-warn/10 text-warn"; // past but still held → review needed

  const time = t.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = t.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const label = future ? `${time} ${date}` : `Embargo passed — review`;
  const tooltip = future
    ? `Embargoed until ${t.toLocaleString("en-GB")} (confidence: ${confidence ?? "—"})`
    : `Embargo expired at ${t.toLocaleString("en-GB")} — cron will release on next run`;

  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums",
        tone,
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function AttachmentChip({ names }: { names: string[] | null }) {
  if (!names || names.length === 0) return null;
  const n = names.length;
  const preview = names.slice(0, 5).join("\n");
  const more = n > 5 ? `\n…and ${n - 5} more` : "";
  return (
    <span
      title={`${n} attachment${n === 1 ? "" : "s"}:\n${preview}${more}`}
      className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-fg-2"
    >
      <Paperclip className="h-2.5 w-2.5" />
      {n}
    </span>
  );
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-sm border border-border bg-background text-um-muted">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <circle cx="9" cy="11" r="1.5" />
          <path d="m3 17 5-5 4 4 3-3 6 6" />
        </svg>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-9 w-12 rounded-sm border border-border bg-background object-cover"
    />
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.045em] text-um-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * Sortable table header. Renders a Link that toggles direction when
 * clicked on the active column, or jumps to the column's natural
 * default direction when activating a new column. Default sort
 * (surfaced_at desc) stays out of the URL so /discovery/inbox keeps
 * its clean canonical form.
 *
 * `preserve` carries all current filter params; we copy it and append
 * sort+dir so a sort choice doesn't blow away the filter state.
 */
function SortHeader({
  column,
  label,
  activeSort,
  activeDir,
  preserve,
  className,
  alignRight,
}: {
  column: SortColumn;
  label: string;
  activeSort: SortColumn;
  activeDir: SortDir;
  preserve: URLSearchParams;
  className?: string;
  alignRight?: boolean;
}) {
  const isActive = activeSort === column;
  const nextDir: SortDir = isActive
    ? activeDir === "asc"
      ? "desc"
      : "asc"
    : defaultDirFor(column);

  const params = new URLSearchParams(preserve);
  const isDefault = column === DEFAULT_SORT && nextDir === DEFAULT_DIR;
  if (isDefault) {
    params.delete("sort");
    params.delete("dir");
  } else {
    params.set("sort", column);
    params.set("dir", nextDir);
  }
  const qs = params.toString();
  const href = qs ? `/discovery/inbox?${qs}` : "/discovery/inbox";

  // Glyphs: filled arrow on active column, muted ↕ on inactive ones.
  const indicator = isActive ? (activeDir === "asc" ? "▲" : "▼") : "↕";

  return (
    <Th className={className}>
      <Link
        href={href}
        scroll={false}
        title={
          isActive
            ? `Sorted ${activeDir === "asc" ? "ascending" : "descending"} — click to flip`
            : `Sort by ${label.toLowerCase()}`
        }
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          alignRight && "w-full justify-end",
          isActive && "text-foreground",
        )}
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={cn(
            "font-mono text-[9px] leading-none tabular-nums",
            isActive ? "text-primary" : "text-um-muted/60",
          )}
        >
          {indicator}
        </span>
      </Link>
    </Th>
  );
}

/**
 * Page through the matched set.
 *
 * Deliberately not carried on the filter or sort links: changing what you are
 * looking at should return you to the first page, because page 7 of a different
 * filter is a different set of stories and almost never where you meant to be.
 */
function Pager({
  page,
  pageCount,
  matched,
  params,
  sort,
}: {
  page: number;
  pageCount: number;
  matched: number;
  params: URLSearchParams;
  sort: { sort?: string; dir?: string };
}) {
  if (matched === 0) return null;

  const href = (n: number) => {
    const p = new URLSearchParams(params);
    if (sort.sort) p.set("sort", sort.sort);
    if (sort.dir) p.set("dir", sort.dir);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return qs ? `/discovery/inbox?${qs}` : "/discovery/inbox";
  };

  const step = (n: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link
        href={href(n)}
        scroll={false}
        className="rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] text-fg-2 transition-colors hover:bg-secondary hover:text-foreground"
      >
        {label}
      </Link>
    ) : (
      <span className="rounded-sm border border-border/50 px-2 py-0.5 text-[11px] text-um-muted/50">
        {label}
      </span>
    );

  return (
    <div className="ml-3 flex items-center gap-1.5">
      {step(1, "«", page > 1)}
      {step(page - 1, "‹", page > 1)}
      <span className="px-1 font-mono text-[11px] tabular-nums text-fg-2">
        {page} / {pageCount}
      </span>
      {step(page + 1, "›", page < pageCount)}
      {step(pageCount, "»", page < pageCount)}
    </div>
  );
}
