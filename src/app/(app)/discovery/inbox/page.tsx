import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AutoSubmitSelect } from "@/components/forms/auto-submit-select";
import { setCandidateTriage } from "@/lib/actions/inbox";

export const dynamic = "force-dynamic";

type CandidateRow = {
  id: string;
  code: string;
  working_headline: string;
  primary_url: string | null;
  layer: "l1" | "l2" | "l3" | "l4";
  dedup_state: "clear" | "duplicate" | "held" | "needs_review" | "pointer";
  verification_state: "verified" | "pending" | "unverified";
  triage_state:
    | "ready"
    | "held_dedup"
    | "held_source"
    | "needs_review"
    | "pointer"
    | "sent_to_f1"
    | "escalated";
  risk: "low" | "med" | "high";
  score: number | null;
  surfaced_at: string;
  source_id: string | null;
  stream_id: string | null;
  sweep_run_id: string | null;
};

type StreamRow = { id: string; name: string; slug: string };
type SourceRow = { id: string; name: string; code: string };
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
  { state: "sent_to_f1", label: "Sent to F1" },
];

const TRIAGE_PILL: Record<string, string> = {
  ready: "border-success/35 bg-success/10 text-success",
  held_dedup: "border-warn/35 bg-warn/10 text-warn",
  held_source: "border-state-legal/35 bg-state-legal/10 text-state-legal",
  needs_review: "border-destructive/35 bg-destructive/10 text-destructive",
  pointer: "border-um-muted/35 bg-um-muted/10 text-um-muted",
  sent_to_f1: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  escalated: "border-destructive/40 bg-destructive/15 text-destructive",
};

const TRIAGE_LABEL: Record<string, string> = {
  ready: "Ready",
  held_dedup: "Held · Dup",
  held_source: "Held · Source",
  needs_review: "Needs review",
  pointer: "Pointer",
  sent_to_f1: "Sent · F1",
  escalated: "Escalated",
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

export default async function CandidateInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; layer?: string; stream?: string; verified?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const activeState = sp.state ?? "all";
  const activeLayer = sp.layer ?? "";
  const activeStream = sp.stream ?? "";
  const activeVerified = sp.verified ?? "";
  const q = sp.q ?? "";

  const supabase = await createClient();
  const [candRes, streamsRes, sourcesRes, sweepsRes, opsRes] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, code, working_headline, primary_url, layer, dedup_state, verification_state, triage_state, risk, score, surfaced_at, source_id, stream_id, sweep_run_id",
      )
      .order("surfaced_at", { ascending: false })
      .limit(200),
    supabase.from("discovery_streams").select("id, name, slug"),
    supabase.from("discovery_sources").select("id, name, code"),
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
  const sweepMap = new Map(sweeps.map((s) => [s.id, s]));

  const counts = new Map<string, number>([["all", cands.length]]);
  for (const c of cands) counts.set(c.triage_state, (counts.get(c.triage_state) ?? 0) + 1);

  let filtered = cands;
  if (activeState !== "all") filtered = filtered.filter((c) => c.triage_state === activeState);
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

  const readyScores = cands.filter((c) => c.triage_state === "ready" && c.score !== null);
  const avgScore =
    readyScores.length > 0
      ? readyScores.reduce((a, c) => a + Number(c.score), 0) / readyScores.length
      : 0;

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
                    <Th>ID</Th>
                    <Th>Working Headline</Th>
                    <Th>Source</Th>
                    <Th>Surfaced</Th>
                    <Th>Layer</Th>
                    <Th>Stream</Th>
                    <Th>Dedup</Th>
                    <Th>Verify</Th>
                    <Th>Triage</Th>
                    <Th className="text-right">Score</Th>
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
                        <td className="px-3 py-2.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          {c.code}
                        </td>
                        <td className="max-w-[440px] px-3 py-2.5">
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
                        </td>
                        <td className="px-3 py-2.5 text-[11.5px] text-fg-2">
                          {source?.name ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] tabular-nums text-um-muted">
                          {fmtTime(c.surfaced_at)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-2">
                            {c.layer}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-fg-2">
                          {stream?.name ?? "—"}
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
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11.5px] tabular-nums text-fg-2">
                          {c.score !== null ? Number(c.score).toFixed(2) : "—"}
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

        {/* Route Summary */}
        <aside className="hidden w-[300px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-card lg:flex">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
              Route Summary
            </span>
          </div>

          <div className="space-y-2 px-4 py-3">
            <RouteCard
              value={readyCount}
              tone="success"
              label="Ready for F1 Triage"
              sub={
                oldestReady
                  ? `Passed verification + dedup check. Oldest: ${relTime(oldestReady)}.`
                  : "Passed verification + dedup check."
              }
              href="/discovery/inbox?state=ready"
            />
            <RouteCard
              value={heldDup}
              tone="warn"
              label="Held — Duplicate"
              sub="Similar story already in pipeline (within 72h window)."
              href="/discovery/inbox?state=held_dedup"
            />
            <RouteCard
              value={heldSource}
              tone="hold"
              label="Held — Source Issue"
              sub="Primary URL unverified or source flagged with active OPS-RR."
              href="/discovery/inbox?state=held_source"
            />
            <RouteCard
              value={pointer}
              tone="muted"
              label="Parked — Pointer Only"
              sub="No primary content. Signal logged for reference."
              href="/discovery/inbox?state=pointer"
            />
            <RouteCard
              value={needsReview}
              tone="danger"
              label="Needs Review"
              sub="Flagged by operator or schema mismatch — requires manual check."
              href="/discovery/inbox?state=needs_review"
            />
          </div>

          <div className="border-t border-border px-4 py-3">
            <StatRow k="Acceptance rate" v={`${acceptanceRate.toFixed(1)}%`} tone="success" />
            <StatRow k="Dedup hold rate" v={`${dedupRate.toFixed(1)}%`} tone="warn" />
            <StatRow
              k="Oldest in queue"
              v={oldestReady ? relTime(oldestReady) : "—"}
              tone={oldestReady ? "warn" : undefined}
            />
            <StatRow k="Avg score (ready)" v={avgScore ? avgScore.toFixed(2) : "—"} />
            <StatRow
              k="Last sweep"
              v={
                sweeps.length > 0 ? (
                  <Link href="/discovery/sweeps" className="text-primary hover:underline">
                    {sweeps[0]?.code ?? "—"}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
          </div>

          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
                Open OPS-RR
              </span>
              <span className="font-mono text-[10px] text-warn">{openOps.length} open</span>
            </div>
            {openOps.length === 0 ? (
              <p className="text-[11px] italic text-um-muted">No open issues.</p>
            ) : (
              <ul className="space-y-2">
                {openOps.map((o) => (
                  <li key={o.code} className="flex items-start gap-2">
                    <span className="flex-shrink-0 pt-0.5 font-mono text-[10px] font-semibold text-warn">
                      {o.code}
                    </span>
                    <span className="text-[11px] leading-[1.4] text-fg-2">{o.description}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/discovery/ops-rr"
              className="mt-3 block text-[11px] font-medium text-primary hover:underline"
            >
              View full OPS-RR queue →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RouteCard({
  value,
  tone,
  label,
  sub,
  href,
}: {
  value: number;
  tone: "success" | "warn" | "hold" | "muted" | "danger";
  label: string;
  sub: string;
  href: string;
}) {
  const valClass =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-destructive"
          : tone === "hold"
            ? "text-state-legal"
            : "text-um-muted";
  return (
    <Link
      href={href}
      className="block rounded-md border border-border bg-background p-3 transition-colors hover:border-border-mid"
    >
      <div className="mb-1 flex items-baseline gap-2">
        <span className={cn("font-mono text-[20px] font-semibold leading-none tabular-nums", valClass)}>
          {value}
        </span>
      </div>
      <div className="text-[11.5px] font-medium text-foreground">{label}</div>
      <div className="mt-0.5 text-[10.5px] leading-[1.4] text-um-muted">{sub}</div>
    </Link>
  );
}

function StatRow({
  k,
  v,
  tone,
}: {
  k: string;
  v: string | React.ReactNode;
  tone?: "success" | "warn" | "danger";
}) {
  const c =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-destructive"
          : "text-fg-2";
  return (
    <div className="flex items-center gap-2 border-b border-border py-1.5 text-[11.5px] last:border-b-0">
      <span className="flex-1 text-um-muted">{k}</span>
      <span className={cn("font-mono font-medium tabular-nums", c)}>{v}</span>
    </div>
  );
}

function TriageActions({ id, state }: { id: string; state: CandidateRow["triage_state"] }) {
  if (state === "sent_to_f1" || state === "escalated") {
    return <span className="text-[10.5px] text-um-muted">—</span>;
  }
  if (state === "ready") {
    return (
      <div className="inline-flex gap-1">
        <TriageBtn id={id} target="sent_to_f1" label="→ F1" tone="success" />
        <TriageBtn id={id} target="needs_review" label="Hold" tone="warn" />
      </div>
    );
  }
  return <TriageBtn id={id} target="ready" label="↺ Ready" tone="muted" />;
}

function TriageBtn({
  id,
  target,
  label,
  tone,
}: {
  id: string;
  target: string;
  label: string;
  tone: "success" | "warn" | "muted";
}) {
  const cls =
    tone === "success"
      ? "border-success/40 bg-success/10 text-success hover:bg-success/15"
      : tone === "warn"
        ? "border-warn/40 bg-warn/10 text-warn hover:bg-warn/15"
        : "border-border bg-background text-fg-2 hover:bg-secondary";
  return (
    <form action={setCandidateTriage} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="target" value={target} />
      <button
        type="submit"
        className={cn(
          "h-6 rounded-sm border px-2 text-[10.5px] font-medium transition-colors",
          cls,
        )}
      >
        {label}
      </button>
    </form>
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
