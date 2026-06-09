import Link from "next/link";
import { ClipboardEdit, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { commissionFromCandidate } from "@/lib/actions/commissioning";

export const dynamic = "force-dynamic";

type CommissionRow = {
  id: string;
  code: string;
  article_id: string;
  candidate_id: string | null;
  brief: string;
  assignee_id: string | null;
  deadline_at: string | null;
  status: "briefed" | "accepted" | "declined" | "in_progress" | "filed";
  commissioned_at: string;
  accepted_at: string | null;
};

type ArticleRow = {
  id: string;
  slug: string | null;
  headline: string;
  state: string;
  sectors: string[];
  geo_tier: string | null;
};

type ProfileRow = { id: string; full_name: string | null };

type CandidateRow = {
  id: string;
  code: string;
  working_headline: string;
  primary_url: string | null;
  layer: "l1" | "l2" | "l3" | "l4";
  score: number | null;
  surfaced_at: string;
};

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "briefed", label: "Briefed" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "In progress" },
  { value: "declined", label: "Declined" },
  { value: "filed", label: "Filed" },
];

const STATUS_PILL: Record<string, string> = {
  briefed: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  accepted: "border-success/35 bg-success/10 text-success",
  in_progress: "border-warn/35 bg-warn/10 text-warn",
  declined: "border-destructive/35 bg-destructive/10 text-destructive",
  filed: "border-um-muted/35 bg-um-muted/10 text-um-muted",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDeadline(iso: string | null): { label: string; tone: "danger" | "warn" | "ok" | "none" } {
  if (!iso) return { label: "—", tone: "none" };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) {
    const d = Math.floor(-ms / 86_400_000);
    return { label: `${d}d overdue`, tone: "danger" };
  }
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return { label: `in ${h}h`, tone: "warn" };
  const d = Math.floor(h / 24);
  return { label: `in ${d}d`, tone: "ok" };
}

export default async function CommissioningPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "all";

  const supabase = await createClient();

  const [commRes, artRes, profileRes, candRes, awaitingRes] = await Promise.all([
    supabase
      .from("commissions")
      .select(
        "id, code, article_id, candidate_id, brief, assignee_id, deadline_at, status, commissioned_at, accepted_at",
      )
      .order("commissioned_at", { ascending: false }),
    supabase.from("articles").select("id, slug, headline, state, sectors, geo_tier"),
    supabase.from("profiles").select("id, full_name"),
    supabase
      .from("candidates")
      .select("id, code, working_headline, primary_url, layer, score, surfaced_at"),
    supabase
      .from("candidates")
      .select("id, code, working_headline, primary_url, layer, score, surfaced_at")
      .eq("triage_state", "sent_to_f1")
      .order("surfaced_at", { ascending: false }),
  ]);

  const commissions: CommissionRow[] = commRes.data ?? [];
  const articles: ArticleRow[] = artRes.data ?? [];
  const profiles: ProfileRow[] = profileRes.data ?? [];
  const allCandidates: CandidateRow[] = candRes.data ?? [];
  const awaitingF1: CandidateRow[] = awaitingRes.data ?? [];

  const articleMap = new Map(articles.map((a) => [a.id, a]));
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const candidateMap = new Map(allCandidates.map((c) => [c.id, c]));
  const commissionedCandIds = new Set(
    commissions.map((c) => c.candidate_id).filter((id): id is string => !!id),
  );

  // Awaiting = F1 candidates without a commission row
  const truelyAwaiting = awaitingF1.filter((c) => !commissionedCandIds.has(c.id));

  const tabCounts = new Map<string, number>([["all", commissions.length]]);
  for (const c of commissions) tabCounts.set(c.status, (tabCounts.get(c.status) ?? 0) + 1);

  const filtered =
    status === "all" ? commissions : commissions.filter((c) => c.status === status);

  // Top-line KPIs
  const briefedCount = tabCounts.get("briefed") ?? 0;
  const acceptedCount = tabCounts.get("accepted") ?? 0;
  const inProgressCount = tabCounts.get("in_progress") ?? 0;
  const declinedCount = tabCounts.get("declined") ?? 0;
  const overdue = commissions.filter(
    (c) => c.deadline_at && new Date(c.deadline_at) < new Date() && c.status !== "filed",
  ).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <ClipboardEdit className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Commissioning Queue</span>
        <span className="text-[11px] text-um-muted">
          {commissions.length} active · {truelyAwaiting.length} awaiting from F1
        </span>
      </div>

      {/* KPI strip */}
      <div className="flex flex-shrink-0 gap-3 border-b border-border bg-card px-5 py-3">
        <Kpi label="Briefed" value={briefedCount} tone="comm" />
        <Kpi label="Accepted" value={acceptedCount} tone="success" />
        <Kpi label="In progress" value={inProgressCount} tone="warn" />
        <Kpi label="Declined" value={declinedCount} tone="danger" />
        <Kpi label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "muted"} />
        <Kpi label="Awaiting F1" value={truelyAwaiting.length} tone="muted" />
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main: commissions list */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Status tabs */}
          <div className="flex flex-shrink-0 items-end gap-0 overflow-x-auto border-b border-border bg-card">
            {STATUS_TABS.map((t) => {
              const isActive = t.value === status;
              const c = tabCounts.get(t.value) ?? 0;
              const href =
                t.value === "all"
                  ? "/commissioning"
                  : `/commissioning?status=${t.value}`;
              return (
                <Link
                  key={t.value}
                  href={href}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[11.5px] font-medium transition-colors",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-fg-2 hover:text-foreground",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full border px-1.5 font-mono text-[9.5px] tabular-nums leading-[1.7]",
                      isActive
                        ? "border-primary/35 bg-accent text-primary"
                        : "border-border bg-background text-um-muted",
                    )}
                  >
                    {c}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center text-[12.5px] text-um-muted">
                No commissions in this view.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>Headline</Th>
                    <Th>Assignee</Th>
                    <Th>Status</Th>
                    <Th>Deadline</Th>
                    <Th>Candidate</Th>
                    <Th>Commissioned</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const art = articleMap.get(c.article_id);
                    const assignee = c.assignee_id ? profileMap.get(c.assignee_id) : null;
                    const cand = c.candidate_id ? candidateMap.get(c.candidate_id) : null;
                    const dl = fmtDeadline(c.deadline_at);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border transition-colors hover:bg-secondary"
                      >
                        <td className="px-3 py-2.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          {c.code}
                        </td>
                        <td className="max-w-[420px] px-3 py-2.5">
                          <Link
                            href={`/commissioning/${c.id}`}
                            className="block truncate text-[12.5px] font-medium text-foreground hover:text-primary"
                          >
                            {art?.headline ?? "—"}
                          </Link>
                          {art?.sectors.length ? (
                            <div className="mt-0.5 text-[10.5px] text-um-muted">
                              {art.sectors.slice(0, 3).join(" · ")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-[11.5px]">
                          {assignee?.full_name ? (
                            <span className="text-fg-2">{assignee.full_name}</span>
                          ) : (
                            <span className="text-warn">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize",
                              STATUS_PILL[c.status],
                            )}
                          >
                            {c.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] tabular-nums">
                          <span
                            className={cn(
                              dl.tone === "danger" && "text-destructive",
                              dl.tone === "warn" && "text-warn",
                              dl.tone === "ok" && "text-fg-2",
                              dl.tone === "none" && "text-um-muted",
                            )}
                          >
                            {dl.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-um-muted">
                          {cand ? (
                            <Link
                              href={`/discovery/inbox?q=${encodeURIComponent(cand.code)}`}
                              className="text-primary hover:underline"
                            >
                              {cand.code}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[10.5px] tabular-nums text-um-muted">
                          {relTime(c.commissioned_at)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            href={`/commissioning/${c.id}`}
                            className="text-um-muted hover:text-foreground"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Aside: awaiting F1 */}
        <aside className="hidden w-[320px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-card lg:flex">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
              Awaiting commission · F1
            </span>
            <span className="font-mono text-[10px] text-warn">{truelyAwaiting.length}</span>
          </div>

          {truelyAwaiting.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11.5px] italic text-um-muted">
              No F1 candidates awaiting commission.
            </p>
          ) : (
            <ul>
              {truelyAwaiting.map((c) => (
                <li key={c.id} className="border-b border-border last:border-b-0">
                  <div className="px-4 py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[10.5px] font-semibold tabular-nums text-foreground">
                        {c.code}
                      </span>
                      <span className="rounded-sm border border-border-mid bg-background px-1 font-mono text-[9.5px] uppercase tracking-wider text-fg-2">
                        {c.layer}
                      </span>
                      {c.score !== null ? (
                        <span className="ml-auto font-mono text-[10px] tabular-nums text-um-muted">
                          {Number(c.score).toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mb-2 line-clamp-2 text-[11.5px] leading-[1.4] text-fg-2">
                      {c.working_headline}
                    </p>
                    <div className="flex items-center gap-2 text-[10.5px]">
                      <span className="font-mono text-um-muted">{relTime(c.surfaced_at)}</span>
                      <form action={commissionFromCandidate} className="ml-auto">
                        <input type="hidden" name="candidate_id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/15"
                        >
                          Commission →
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto border-t border-border px-4 py-3">
            <Link
              href="/discovery/inbox?state=sent_to_f1"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              View full F1 queue →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "comm" | "success" | "warn" | "danger" | "muted";
}) {
  const cls =
    tone === "comm"
      ? "text-state-comm"
      : tone === "success"
        ? "text-success"
        : tone === "warn"
          ? "text-warn"
          : tone === "danger"
            ? "text-destructive"
            : "text-um-muted";
  return (
    <div className="flex-1 rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-um-muted">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-[18px] font-semibold tabular-nums", cls)}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
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
