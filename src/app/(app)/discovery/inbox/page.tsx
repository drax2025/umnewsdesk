import Link from "next/link";
import { Clock, Mail, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AutoSubmitSelect } from "@/components/forms/auto-submit-select";
import { InboxRightPanel } from "@/components/discovery/inbox-right-panel";
import {
  dismissCandidate,
  escalateCandidateToOpsRr,
  setCandidateTriage,
} from "@/lib/actions/inbox";
import { SendToNewsroomButton } from "@/components/forms/send-to-newsroom-button";

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
    | "archived";
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
];

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

const DEDUP_LABEL: Record<string, string> = {
  clear: "Clear",
  duplicate: "Duplicate",
  held: "Held",
  needs_review: "Review",
  pointer: "Pointer",
};

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

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false }).slice(0, 5);
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
    layer?: string;
    stream?: string;
    verified?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeState = sp.state ?? "all";
  const activeLayer = sp.layer ?? "";
  const activeStream = sp.stream ?? "";
  const activeVerified = sp.verified ?? "";
  const q = sp.q ?? "";
  const activeSort: SortColumn = SORTABLE_COLUMNS.has(sp.sort as SortColumn)
    ? (sp.sort as SortColumn)
    : DEFAULT_SORT;
  const activeDir: SortDir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : DEFAULT_DIR;

  const supabase = await createClient();
  const [candRes, streamsRes, sourcesRes, sweepsRes, opsRes] =
    await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id, code, working_headline, primary_url, image_url, layer, kind, dedup_state, verification_state, triage_state, risk, embargo_until, embargo_confidence, attachment_urls, surfaced_at, source_id, stream_id, sweep_run_id, raw, newsroom_record_id, sent_to_newsroom_at, newsroom_send_error",
        )
        .order("surfaced_at", { ascending: false })
        .limit(200),
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

  const cands: CandidateRow[] = candRes.data ?? [];
  const streams: StreamRow[] = streamsRes.data ?? [];
  const sources: SourceRow[] = sourcesRes.data ?? [];
  const sweeps: SweepRow[] = sweepsRes.data ?? [];
  const openOps: OpsAlertRow[] = opsRes.data ?? [];

  const streamMap = new Map(streams.map((s) => [s.id, s]));
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  // Server Component renders once per request, so a wall-clock snapshot
  // here is stable for the lifetime of the response. Threading it to
  // EmbargoChip keeps the child component pure.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  // "All" intentionally excludes archived — Dismiss should remove the
  // row from the operator's default working set. The dedicated
  // "Archived" pill is the explicit opt-in for reviewing them.
  const nonArchivedTotal = cands.filter((c) => c.triage_state !== "archived").length;
  const counts = new Map<string, number>([["all", nonArchivedTotal]]);
  for (const c of cands) counts.set(c.triage_state, (counts.get(c.triage_state) ?? 0) + 1);

  let filtered =
    activeState === "all"
      ? cands.filter((c) => c.triage_state !== "archived")
      : cands.filter((c) => c.triage_state === activeState);
  if (activeLayer) filtered = filtered.filter((c) => c.layer === activeLayer);
  if (activeStream)
    filtered = filtered.filter((c) => {
      const s = c.stream_id ? streamMap.get(c.stream_id) : null;
      return s?.slug === activeStream;
    });
  if (activeVerified) filtered = filtered.filter((c) => c.verification_state === activeVerified);
  if (q) {
    const qq = q.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.working_headline.toLowerCase().includes(qq) || c.code.toLowerCase().includes(qq),
    );
  }

  // Sort the filtered set. Nulls always sink to the bottom regardless of
  // direction — an unscored candidate at the top of "score asc" would be
  // surprising. localeCompare gets {numeric:true} so codes like DC-006501
  // sort by their numeric tail rather than lexicographically.
  function getSortKey(c: CandidateRow, col: SortColumn): string | number | null {
    switch (col) {
      case "code":
        return c.code;
      case "working_headline":
        return c.working_headline.toLowerCase();
      case "source":
        return (
          c.raw?.agency_name ??
          (c.source_id ? sourceMap.get(c.source_id)?.name : null) ??
          ""
        ).toLowerCase();
      case "surfaced_at":
        return c.surfaced_at;
      case "layer":
        return c.layer;
      case "stream":
        return (
          (c.stream_id ? streamMap.get(c.stream_id)?.name : null) ?? ""
        ).toLowerCase();
      case "dedup_state":
        return c.dedup_state;
      case "verification_state":
        return c.verification_state;
      case "triage_state":
        return c.triage_state;
    }
  }

  const sortMul = activeDir === "asc" ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    const av = getSortKey(a, activeSort);
    const bv = getSortKey(b, activeSort);
    if (av === null && bv === null) return 0;
    if (av === null) return 1; // nulls last
    if (bv === null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortMul;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sortMul;
  });

  // Route summary numbers
  const readyCount = cands.filter((c) => c.triage_state === "ready").length;
  const heldDup = cands.filter((c) => c.triage_state === "held_dedup").length;
  const heldSource = cands.filter((c) => c.triage_state === "held_source").length;
  const pointer = cands.filter((c) => c.triage_state === "pointer").length;
  const needsReview = cands.filter((c) => c.triage_state === "needs_review").length;

  const oldestReady = cands
    .filter((c) => c.triage_state === "ready")
    .reduce<string | null>((a, c) => {
      if (!a) return c.surfaced_at;
      return new Date(c.surfaced_at) < new Date(a) ? c.surfaced_at : a;
    }, null);

  const triaged = cands.filter(
    (c) => c.triage_state === "sent_to_f1" || c.triage_state === "held_dedup",
  ).length;
  const accepted = cands.filter((c) => c.triage_state === "sent_to_f1").length;
  const acceptanceRate = triaged ? (accepted / triaged) * 100 : 0;
  const dedupRate = cands.length ? (heldDup / cands.length) * 100 : 0;

  // Pre-format time-sensitive labels for the right panel — keeps the
  // client component a pure presentation surface and avoids hydration
  // mismatches around Date.now().
  const oldestReadyLabel = oldestReady ? relTime(oldestReady) : null;
  const lastSweepCode = sweeps.length > 0 ? (sweeps[0]?.code ?? null) : null;

  // Sort/filter preservation helpers. Sort gets dropped from the URL
  // when it matches the default so a "fresh" inbox link stays clean.
  const sortIsDefault = activeSort === DEFAULT_SORT && activeDir === DEFAULT_DIR;
  const sortPreserve: { sort?: string; dir?: string } = sortIsDefault
    ? {}
    : { sort: activeSort, dir: activeDir };
  const filterPreserveParams = new URLSearchParams();
  if (activeState !== "all") filterPreserveParams.set("state", activeState);
  if (activeLayer) filterPreserveParams.set("layer", activeLayer);
  if (activeStream) filterPreserveParams.set("stream", activeStream);
  if (activeVerified) filterPreserveParams.set("verified", activeVerified);
  if (q) filterPreserveParams.set("q", q);

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
          name="layer"
          value={activeLayer}
          basePath="/discovery/inbox"
          preserve={{
            state: activeState !== "all" ? activeState : undefined,
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
          name="stream"
          value={activeStream}
          basePath="/discovery/inbox"
          preserve={{
            state: activeState !== "all" ? activeState : undefined,
            layer: activeLayer || undefined,
            verified: activeVerified || undefined,
            q: q || undefined,
            sort: sortPreserve.sort,
            dir: sortPreserve.dir,
          }}
          options={[
            { value: "", label: "Stream — All" },
            ...streams.map((s) => ({ value: s.slug, label: s.name })),
          ]}
        />

        <AutoSubmitSelect
          name="verified"
          value={activeVerified}
          basePath="/discovery/inbox"
          preserve={{
            state: activeState !== "all" ? activeState : undefined,
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

      {/* Body 2-col */}
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
                    <SortHeader
                      column="stream"
                      label="Stream"
                      className="w-[110px]"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <SortHeader
                      column="dedup_state"
                      label="Dedup"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <SortHeader
                      column="verification_state"
                      label="Verify"
                      activeSort={activeSort}
                      activeDir={activeDir}
                      preserve={filterPreserveParams}
                    />
                    <SortHeader
                      column="triage_state"
                      label="Triage"
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
                    const stream = c.stream_id ? streamMap.get(c.stream_id) : null;
                    const source = c.source_id ? sourceMap.get(c.source_id) : null;
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border transition-colors hover:bg-secondary"
                      >
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
                          {fmtTime(c.surfaced_at)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-2">
                            {c.layer}
                          </span>
                        </td>
                        <td className="w-[110px] max-w-[110px] px-3 py-2.5 text-[11.5px] text-fg-2">
                          <span className="block truncate" title={stream?.name ?? undefined}>
                            {stream?.name ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px]">
                          <span
                            className={cn(
                              c.dedup_state === "clear" && "text-success",
                              c.dedup_state === "duplicate" && "text-warn",
                              c.dedup_state === "held" && "text-warn",
                              c.dedup_state === "needs_review" && "text-destructive",
                              c.dedup_state === "pointer" && "text-um-muted",
                            )}
                          >
                            {DEDUP_LABEL[c.dedup_state] ?? c.dedup_state}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px]">
                          <span className={VERIFY_PILL[c.verification_state] ?? "text-um-muted"}>
                            {c.verification_state}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                              TRIAGE_PILL[c.triage_state] ?? "border-border text-um-muted",
                            )}
                          >
                            {TRIAGE_LABEL[c.triage_state] ?? c.triage_state}
                          </span>
                        </td>
                        {/* The handoff. Everything downstream of this - editing,
                            embargoes, publishing, the agency reply - belongs to
                            the newsroom, so this is where News Desk's job ends. */}
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <div className="flex justify-end">
                            <SendToNewsroomButton
                              candidateId={c.id}
                              sentRecordId={c.newsroom_record_id}
                              lastError={c.newsroom_send_error}
                            />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <TriageActions id={c.id} state={c.triage_state} />
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
              of {cands.length} candidates
            </span>
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
    </div>
  );
}

function TriageActions({
  id,
  state,
}: {
  id: string;
  state: CandidateRow["triage_state"];
}) {
  // `sent_to_f1` is kept as the enum value because it is what the database
  // holds, but F1 no longer exists — a sent candidate is one the newsroom has.
  // The Newsroom column carries the record id; this only reports the state.
  if (state === "sent_to_f1") {
    return <span className="text-[10.5px] text-um-muted">sent</span>;
  }
  if (state === "escalated") {
    return <span className="text-[10.5px] text-warn">in OPS-RR</span>;
  }
  if (state === "ready") {
    return (
      <div className="inline-flex items-center gap-1">
        <OpsEscalateMenu id={id} />
        <form action={dismissCandidate} className="inline-block">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="h-6 rounded-sm border border-border bg-background px-2 text-[10.5px] font-medium text-fg-2 transition-colors hover:bg-secondary"
            title="Archive — hide from the inbox. Findable via the Archived filter and restorable later."
          >
            Dismiss
          </button>
        </form>
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
