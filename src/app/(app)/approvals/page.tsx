import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Check, X, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { recordDecision } from "@/lib/actions/approvals";

export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  slug: string | null;
  headline: string;
  standfirst: string | null;
  body: string | null;
  state: string;
  sectors: string[];
  geo_tier: string | null;
  updated_at: string;
  sub_cleared_at: string | null;
  legal_cleared_at: string | null;
};

type DecisionRow = {
  id: string;
  from_state: string;
  to_state: string;
  kind: string;
  rationale: string;
  decided_at: string;
};

type RevisionRow = {
  id: string;
  revision_no: number;
  summary: string | null;
  created_at: string;
};

type TabKey = "pending" | "reject";

const TABS: { key: TabKey; label: string; states: string[] }[] = [
  { key: "pending", label: "Pending Review", states: ["filed", "subbed", "legal"] },
  { key: "reject", label: "Reject Queue", states: ["rejected"] },
];

const PILL: Record<string, string> = {
  filed: "border-state-filed/35 bg-state-filed/12 text-state-filed",
  subbed: "border-state-sub/35 bg-state-sub/12 text-state-sub",
  legal: "border-state-legal/35 bg-state-legal/10 text-state-legal",
  scheduled: "border-state-sched/35 bg-state-sched/10 text-state-sched",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  commissioned: "border-state-comm/35 bg-state-comm/10 text-state-comm",
};

const STATE_LABEL: Record<string, string> = {
  filed: "Filed",
  subbed: "Sub-edit",
  legal: "Legal",
  scheduled: "Scheduled",
  rejected: "Rejected",
  commissioned: "Commissioned",
};

const DECISION_PILL: Record<string, string> = {
  approve: "border-success/35 bg-success/10 text-success",
  reject: "border-destructive/35 bg-destructive/10 text-destructive",
  request_revision: "border-warn/35 bg-warn/10 text-warn",
};

const DECISION_LABEL: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
  request_revision: "Revisions",
};

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function ageLabel(updatedAt: string): { text: string; tone: "ok" | "warn" | "danger" } {
  const hours = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 3_600_000);
  if (hours < 12) return { text: `${Math.max(hours, 0)}h`, tone: "ok" };
  if (hours < 24) return { text: `${hours}h`, tone: "warn" };
  const days = Math.floor(hours / 24);
  return { text: `${days}d`, tone: days >= 2 ? "danger" : "warn" };
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

function nextLabels(state: string): { approve: string; revise: string } {
  if (state === "filed") return { approve: "Send to sub-edit", revise: "Return to writer" };
  if (state === "subbed") return { approve: "Send to legal", revise: "Return to writer" };
  if (state === "legal") return { approve: "Clear for scheduling", revise: "Return to sub-edit" };
  return { approve: "Approve", revise: "Request revisions" };
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = sp.tab === "reject" ? "reject" : "pending";
  const states = TABS.find((t) => t.key === tab)!.states;

  const supabase = await createClient();
  const { data: queue } = await supabase
    .from("articles")
    .select(
      "id, slug, headline, standfirst, body, state, sectors, geo_tier, updated_at, sub_cleared_at, legal_cleared_at",
    )
    .in("state", states)
    .order("updated_at", { ascending: true });

  const items: ArticleRow[] = queue ?? [];
  const selectedId = sp.id ?? items[0]?.id ?? null;
  const selected = selectedId ? items.find((r) => r.id === selectedId) ?? null : null;

  const [pendingRes, rejectRes] = await Promise.all([
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .in("state", ["filed", "subbed", "legal"]),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("state", "rejected"),
  ]);

  const counts: Record<TabKey, number> = {
    pending: pendingRes.count ?? 0,
    reject: rejectRes.count ?? 0,
  };

  // Pull decision + revision history for the selected article
  let decisions: DecisionRow[] = [];
  let revisions: RevisionRow[] = [];
  if (selected) {
    const [decRes, revRes] = await Promise.all([
      supabase
        .from("approval_decisions")
        .select("id, from_state, to_state, kind, rationale, decided_at")
        .eq("article_id", selected.id)
        .order("decided_at", { ascending: false }),
      supabase
        .from("article_revisions")
        .select("id, revision_no, summary, created_at")
        .eq("article_id", selected.id)
        .order("revision_no", { ascending: false })
        .limit(5),
    ]);
    decisions = decRes.data ?? [];
    revisions = revRes.data ?? [];
  }

  if (sp.tab && !sp.id && items[0]) {
    redirect(`/approvals?tab=${tab}&id=${items[0].id}`);
  }

  return (
    <div className="flex h-full">
      {/* Queue panel */}
      <div className="flex w-[340px] flex-shrink-0 flex-col overflow-hidden border-r border-border bg-card">
        <div className="flex flex-shrink-0 border-b border-border">
          {TABS.map((t) => {
            const isActive = t.key === tab;
            return (
              <Link
                key={t.key}
                href={`/approvals?tab=${t.key}`}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[11.5px] font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-fg-2 hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full border px-1.5 font-mono text-[10px] tabular-nums leading-[1.7]",
                    isActive
                      ? "border-primary/35 bg-accent text-primary"
                      : "border-border bg-background text-um-muted",
                  )}
                >
                  {counts[t.key]}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-um-muted">
              No items in this queue
            </div>
          ) : (
            items.map((r) => {
              const age = ageLabel(r.updated_at);
              const isSelected = r.id === selectedId;
              return (
                <Link
                  key={r.id}
                  href={`/approvals?tab=${tab}&id=${r.id}`}
                  className={cn(
                    "relative block border-b border-border px-3 py-2.5 transition-colors hover:bg-secondary/40",
                    isSelected && "bg-accent/40",
                  )}
                >
                  {isSelected ? (
                    <span className="absolute inset-y-0 left-0 w-[2px] bg-primary" />
                  ) : null}
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                      {shortId(r.id)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded border px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em]",
                        PILL[r.state],
                      )}
                    >
                      {STATE_LABEL[r.state] ?? r.state}
                    </span>
                  </div>
                  <p className="mb-1.5 line-clamp-2 text-[12.5px] font-medium leading-[1.3] text-foreground">
                    {r.headline}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-fg-2">
                    <span className="truncate">
                      {r.sectors.slice(0, 2).join(" · ") || "—"}
                    </span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        age.tone === "ok" && "text-um-muted",
                        age.tone === "warn" && "text-warn",
                        age.tone === "danger" && "font-semibold text-destructive",
                      )}
                    >
                      {age.text}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Decision panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <DecisionPanel
            item={selected}
            closed={tab === "reject"}
            decisions={decisions}
            revisions={revisions}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-um-muted">
            <span className="text-[13px] font-medium text-fg-2">Select an item</span>
            <span className="text-[12px]">
              Choose a submission from the queue to begin review.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionPanel({
  item,
  closed,
  decisions,
  revisions,
}: {
  item: ArticleRow;
  closed: boolean;
  decisions: DecisionRow[];
  revisions: RevisionRow[];
}) {
  const age = ageLabel(item.updated_at);
  const labels = nextLabels(item.state);

  // Criteria gates: derived from real columns
  const criteria: { label: string; status: "pass" | "pend" | "fail"; note: string }[] = [
    {
      label: "Draft on file",
      status: revisions.length > 0 ? "pass" : "fail",
      note:
        revisions.length > 0
          ? `${revisions.length} revision${revisions.length === 1 ? "" : "s"} on record.`
          : "No saved draft — writer must file first.",
    },
    {
      label: "Sub-edit clearance",
      status: item.sub_cleared_at ? "pass" : item.state === "filed" ? "pend" : "pend",
      note: item.sub_cleared_at
        ? `Cleared ${fmtAbs(item.sub_cleared_at)}.`
        : item.state === "filed"
          ? "Pending — approve from this queue to advance."
          : "In progress.",
    },
    {
      label: "Legal clearance",
      status: item.legal_cleared_at
        ? "pass"
        : item.state === "legal"
          ? "pend"
          : "pend",
      note: item.legal_cleared_at
        ? `Cleared ${fmtAbs(item.legal_cleared_at)}.`
        : item.state === "legal"
          ? "Pending — approve from this queue to clear for scheduling."
          : "Awaiting sub-edit clearance first.",
    },
    {
      label: "Standfirst present",
      status: item.standfirst && item.standfirst.trim() ? "pass" : "fail",
      note: item.standfirst?.trim()
        ? "On file."
        : "Missing — writer must add a standfirst before approval.",
    },
  ];

  const allPass = criteria.every((c) => c.status === "pass");
  const canApprove = !closed && (item.state === "filed" || item.state === "subbed" || item.state === "legal");

  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-5 py-4">
        <div className="mb-2 flex items-start gap-3">
          <div className="flex flex-shrink-0 flex-col gap-0.5 pt-0.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              {shortId(item.id)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
              {item.sectors[0] ?? "General"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="mb-1 text-[15px] font-semibold leading-[1.3] tracking-[-0.02em] text-foreground">
              {item.headline}
            </h1>
            {item.standfirst ? (
              <p className="line-clamp-2 text-[11.5px] leading-[1.45] text-fg-2">
                {item.standfirst}
              </p>
            ) : (
              <p className="line-clamp-2 text-[11.5px] italic leading-[1.45] text-um-muted">
                No standfirst on file.
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-[2px] font-mono text-[10px] font-semibold uppercase tracking-[0.05em]",
                PILL[item.state],
              )}
            >
              {STATE_LABEL[item.state] ?? item.state}
            </span>
            <Link
              href={`/articles/${item.id}`}
              className="flex h-6 items-center gap-1 rounded-sm border border-border bg-background px-2 text-[10.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Pencil className="h-3 w-3" />
              Dossier
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center text-[11.5px]">
          <Meta label="Sectors" val={item.sectors.join(" · ") || "—"} />
          <Meta label="Geo" val={item.geo_tier?.replace("_", " ") ?? "—"} />
          <Meta label="In queue" val={age.text} />
          <Meta label="Slug" val={item.slug ?? "—"} mono />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <SectionHead>Publication Criteria</SectionHead>
        <table className="w-full border-collapse">
          <tbody>
            {criteria.map((c) => (
              <tr key={c.label} className="border-b border-border last:border-0">
                <td className="px-5 py-2 text-[12.5px] font-medium text-foreground">
                  {c.label}
                </td>
                <td className="px-3 py-2 text-[11.5px] text-fg-2">{c.note}</td>
                <td className="w-[90px] px-5 py-2 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.05em]",
                      c.status === "pass" && "text-success",
                      c.status === "pend" && "text-warn",
                      c.status === "fail" && "text-destructive",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        c.status === "pass" && "bg-success",
                        c.status === "pend" && "bg-warn",
                        c.status === "fail" && "bg-destructive",
                      )}
                    />
                    {c.status === "pass" ? "Pass" : c.status === "pend" ? "Pending" : "Fail"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <SectionHead>Decision History</SectionHead>
        {decisions.length === 0 ? (
          <div className="px-5 py-6 text-center text-[11.5px] italic text-um-muted">
            No decisions recorded yet.
          </div>
        ) : (
          <ul>
            {decisions.map((d) => (
              <li
                key={d.id}
                className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-0"
              >
                <span
                  className={cn(
                    "flex-shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    DECISION_PILL[d.kind],
                  )}
                >
                  {DECISION_LABEL[d.kind] ?? d.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2 text-[11px] text-fg-2">
                    <span className="font-mono">
                      {STATE_LABEL[d.from_state] ?? d.from_state}
                    </span>
                    <span className="text-um-muted">→</span>
                    <span className="font-mono">
                      {STATE_LABEL[d.to_state] ?? d.to_state}
                    </span>
                    <span
                      className="ml-auto font-mono text-[10.5px] text-um-muted"
                      title={fmtAbs(d.decided_at)}
                    >
                      {fmtAbs(d.decided_at)}
                    </span>
                  </div>
                  <p className="text-[11.5px] leading-[1.45] text-foreground">
                    {d.rationale}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: decision capture */}
      {closed ? (
        <div className="flex-shrink-0 border-t border-border bg-card px-5 py-3.5">
          <div className="flex items-center">
            <span className="rounded border border-border bg-background px-2 py-1 font-mono text-[10.5px] text-um-muted">
              Closed queue · no further decisions
            </span>
          </div>
        </div>
      ) : canApprove ? (
        <form
          action={recordDecision}
          className="flex-shrink-0 border-t border-border bg-card px-5 py-3.5"
        >
          <input type="hidden" name="id" value={item.id} />
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
              Decision rationale
            </span>
            {!allPass ? (
              <span className="font-mono text-[10px] text-warn">
                ⚠ criteria still pending — proceed with caution
              </span>
            ) : null}
          </div>
          <textarea
            name="rationale"
            rows={2}
            required
            minLength={8}
            placeholder="Required. This is recorded on the article's audit trail."
            className="block min-h-[56px] w-full resize-none rounded-md border border-border-mid bg-background px-2.5 py-2 text-[12.5px] leading-[1.5] text-foreground placeholder:text-um-muted"
          />
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="submit"
              name="kind"
              value="reject"
              className="flex h-[30px] items-center gap-1.5 rounded-md border border-destructive/50 bg-transparent px-3 text-[12.5px] font-medium text-destructive hover:bg-destructive/8"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              type="submit"
              name="kind"
              value="request_revision"
              className="flex h-[30px] items-center gap-1.5 rounded-md border border-warn bg-transparent px-3 text-[12.5px] font-medium text-warn hover:bg-warn/8"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {labels.revise}
            </button>
            <div className="flex-1" />
            <button
              type="submit"
              name="kind"
              value="approve"
              className="flex h-[30px] items-center gap-1.5 rounded-md border border-primary bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />
              {labels.approve}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex-shrink-0 border-t border-border bg-card px-5 py-3.5">
          <span className="rounded border border-border bg-background px-2 py-1 font-mono text-[10.5px] text-um-muted">
            Article state is {STATE_LABEL[item.state] ?? item.state} · no review action available here
          </span>
        </div>
      )}
    </>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 pb-2 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-um-muted">
      {children}
    </div>
  );
}

function Meta({ label, val, mono }: { label: string; val: string; mono?: boolean }) {
  return (
    <div className="mr-3.5 flex items-center gap-1 border-r border-border pr-3.5 last:border-r-0 last:pr-0">
      <span className="text-um-muted">{label}</span>
      <span
        className={cn(
          "font-medium text-fg-2",
          mono && "font-mono text-[11px] tabular-nums",
        )}
      >
        {val}
      </span>
    </div>
  );
}
