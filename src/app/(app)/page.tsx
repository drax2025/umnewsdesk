import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * The landing screen.
 *
 * News Desk's job is now one sentence long — find stories, check them, hand
 * the good ones to the newsroom — so this answers the three questions that
 * job raises: did the last sweep work, what is waiting for a decision, and
 * what went across. Anything past the handoff belongs to Newsroom V1 and is
 * deliberately not mirrored here; two systems reporting the same number is
 * how they start disagreeing.
 */

export const dynamic = "force-dynamic";

type SentRow = {
  id: string;
  code: string;
  working_headline: string;
  sent_to_newsroom_at: string | null;
  newsroom_record_id: string | null;
};

type SweepRow = {
  code: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  candidates_total: number | null;
  sites_total: number | null;
  not_reached: number | null;
  parse_failures: number | null;
};

/** Matches `sweep_status` in 0003_discovery_schema.sql — not "completed". */
const SWEEP_OK = "complete";
const HELD_STATES = ["held_dedup", "held_source", "needs_review", "pointer"];

export default async function DashboardPage() {
  const supabase = await createClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  // Counted in the database, not by reading rows and calling .length: there
  // are over a thousand candidates, and any row cap here would quietly
  // undercount the tiles rather than fail.
  const [readyRes, heldRes, sentTodayRes, failedRes, sweepRes, opsRes, sourcesRes, recentRes] =
    await Promise.all([
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("triage_state", "ready")
        .is("sent_to_newsroom_at", null),
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .in("triage_state", HELD_STATES),
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .gte("sent_to_newsroom_at", todayIso),
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .not("newsroom_send_error", "is", null)
        .is("sent_to_newsroom_at", null),
      supabase
        .from("sweep_runs")
        .select(
          "code, status, started_at, completed_at, candidates_total, sites_total, not_reached, parse_failures",
        )
        .order("started_at", { ascending: false })
        .limit(1)
        .returns<SweepRow[]>(),
      supabase
        .from("ops_rr_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabase.from("discovery_sources").select("status").returns<{ status: string }[]>(),
      supabase
        .from("candidates")
        .select("id, code, working_headline, sent_to_newsroom_at, newsroom_record_id")
        .gte("sent_to_newsroom_at", todayIso)
        .order("sent_to_newsroom_at", { ascending: false })
        .limit(8)
        .returns<SentRow[]>(),
    ]);

  const readyCount = readyRes.count ?? 0;
  const heldCount = heldRes.count ?? 0;
  const sentTodayCount = sentTodayRes.count ?? 0;
  const failedCount = failedRes.count ?? 0;
  const sweep = sweepRes.data?.[0] ?? null;
  const openOps = opsRes.count ?? 0;
  const sources = sourcesRes.data ?? [];
  const recent = recentRes.data ?? [];

  const activeSources = sources.filter((s) => s.status === "active").length;

  // A sweep that is still running is neither good news nor bad; only a
  // finished one that failed or dropped feeds earns the red.
  const sweepRunning = sweep?.status === "running";
  const sweepOk =
    sweep?.status === SWEEP_OK &&
    (sweep.parse_failures ?? 0) === 0 &&
    (sweep.not_reached ?? 0) === 0;
  const sweepTone = !sweep ? "warn" : sweepRunning ? undefined : sweepOk ? "success" : "danger";
  const sweepLabel = sweep
    ? sweepRunning
      ? "running"
      : sweep.completed_at
        ? new Date(sweep.completed_at).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : sweep.status
    : "never";

  return (
    <div className="space-y-5 px-5 py-5">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          href="/discovery/inbox?state=ready"
          value={readyCount.toString()}
          label="Ready to send"
          sub="Triaged, not yet handed over"
          tone={readyCount > 0 ? "success" : undefined}
        />
        <StatTile
          href="/discovery/inbox"
          value={sentTodayCount.toString()}
          label="Sent today"
          sub="Now in Newsroom V1"
        />
        <StatTile
          href="/discovery/inbox"
          value={heldCount.toString()}
          label="Held"
          sub="Duplicate · source · review"
          tone={heldCount > 0 ? "warn" : undefined}
        />
        <StatTile
          href="/discovery/sweeps"
          value={(sweep?.candidates_total ?? 0).toString()}
          label="Last sweep"
          sub={`${sweep?.code ?? "—"} · ${sweepLabel}`}
          tone={sweepTone}
        />
        <StatTile
          href="/system/source-health"
          value={activeSources.toString()}
          denom={`/ ${sources.length}`}
          label="Sources active"
          sub={
            sweep?.not_reached
              ? `${sweep.not_reached} not reached last run`
              : "All reached last run"
          }
          tone={sweep?.not_reached ? "warn" : undefined}
        />
        <StatTile
          href="/discovery/ops-rr"
          value={(openOps + failedCount).toString()}
          label="Needs attention"
          sub={`${openOps} OPS-RR · ${failedCount} send failed`}
          tone={openOps + failedCount > 0 ? "danger" : undefined}
        />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em]">
            Handed to the newsroom today
          </h2>
          <Link
            href="/discovery/inbox"
            className="text-[11.5px] text-primary hover:underline"
          >
            Candidate inbox
          </Link>
        </header>
        <ul className="divide-y divide-border">
          {recent.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 px-4 py-2.5 text-[12.5px] hover:bg-secondary"
            >
              <span className="rounded-md border border-success/30 bg-success/15 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-success">
                {c.newsroom_record_id ?? "sent"}
              </span>
              <span className="flex-1 truncate">{c.working_headline}</span>
              <span className="font-mono text-[10.5px] text-um-muted">{c.code}</span>
              <time
                className="font-mono text-[10.5px] text-um-muted"
                dateTime={c.sent_to_newsroom_at ?? undefined}
              >
                {c.sent_to_newsroom_at
                  ? new Date(c.sent_to_newsroom_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "—"}
              </time>
            </li>
          ))}
          {recent.length === 0 ? (
            <li className="px-4 py-8 text-center text-[12.5px] text-um-muted">
              Nothing sent today.{" "}
              <Link href="/discovery/inbox?state=ready" className="text-primary hover:underline">
                {readyCount} candidate{readyCount === 1 ? "" : "s"} ready
              </Link>
              .
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function StatTile({
  href,
  value,
  denom,
  label,
  sub,
  tone,
}: {
  href?: string;
  value: string;
  denom?: string;
  label: string;
  sub: string;
  tone?: "warn" | "success" | "danger";
}) {
  const toneClass =
    tone === "warn"
      ? "text-warn"
      : tone === "success"
        ? "text-success"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";

  const body = (
    <div className="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary/50">
      <div className={cn("text-[22px] font-semibold tracking-[-0.02em]", toneClass)}>
        {value}
        {denom ? (
          <span className="ml-1 text-[13px] font-normal text-um-muted">{denom}</span>
        ) : null}
      </div>
      <div className="mt-0.5 text-[11.5px] font-medium text-fg-2">{label}</div>
      <div className="mt-0.5 text-[10.5px] text-um-muted">{sub}</div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
