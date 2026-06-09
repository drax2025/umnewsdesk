import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  slug: string | null;
  headline: string;
  standfirst: string | null;
  state: string;
  sectors: string[];
  geo_tier: string | null;
  updated_at: string;
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
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATE_LABEL: Record<string, string> = {
  filed: "Filed",
  subbed: "Sub-edit",
  legal: "Legal",
  rejected: "Rejected",
};

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function ageLabel(updatedAt: string): { text: string; tone: "ok" | "warn" | "danger" } {
  const hours = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 3_600_000);
  if (hours < 12) return { text: `${Math.max(hours, 0)}h`, tone: "ok" };
  if (hours < 24) return { text: `${hours}h`, tone: "warn" };
  const days = Math.floor(hours / 24);
  const text = `${days}d`;
  return { text, tone: days >= 2 ? "danger" : "warn" };
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
    .select("id, slug, headline, standfirst, state, sectors, geo_tier, updated_at")
    .in("state", states)
    .order("updated_at", { ascending: true });

  const items: ArticleRow[] = queue ?? [];
  const selectedId = sp.id ?? items[0]?.id ?? null;
  const selected =
    selectedId ? items.find((r) => r.id === selectedId) ?? null : null;

  // Tab counts
  const { count: pendingCount } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .in("state", ["filed", "subbed", "legal"]);
  const { count: rejectCount } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("state", "rejected");

  const counts: Record<TabKey, number> = {
    pending: pendingCount ?? 0,
    reject: rejectCount ?? 0,
  };

  // If user followed a link with a tab but no id, redirect to first item with that id baked in
  if (sp.tab && !sp.id && items[0]) {
    redirect(`/approvals?tab=${tab}&id=${items[0].id}`);
  }

  return (
    <div className="flex h-full">
      {/* Queue panel */}
      <div className="flex w-[340px] flex-shrink-0 flex-col overflow-hidden border-r border-border bg-card">
        {/* Tabs */}
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

        {/* List */}
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
          <DecisionPanel item={selected} closed={tab === "reject"} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-um-muted">
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="opacity-25"
            >
              <rect x="6" y="5" width="28" height="30" rx="3" />
              <path d="M12 14h16M12 20h16M12 26h10" />
            </svg>
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

function DecisionPanel({ item, closed }: { item: ArticleRow; closed: boolean }) {
  const age = ageLabel(item.updated_at);

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
            ) : null}
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
            {CRITERIA_PLACEHOLDER.map((c) => (
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
                    {c.status === "pass"
                      ? "Pass"
                      : c.status === "pend"
                        ? "Pending"
                        : "Fail"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <SectionHead>Decision History</SectionHead>
        <div className="px-5 py-6 text-center text-[11.5px] text-um-muted">
          Decision log not yet wired up.
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border bg-card px-5 py-3.5">
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
          Decision rationale
        </div>
        <textarea
          rows={2}
          placeholder="Enter a rationale before confirming any decision — this will be recorded in the audit log…"
          disabled
          className="block min-h-[56px] w-full resize-none rounded-md border border-border-mid bg-background px-2.5 py-2 text-[12.5px] leading-[1.5] text-foreground placeholder:text-um-muted disabled:opacity-60"
        />
        <div className="mt-2.5 flex items-center gap-2">
          {closed ? (
            <>
              <button
                type="button"
                disabled
                className="flex h-[30px] items-center gap-1.5 rounded-md border border-border-mid bg-transparent px-3 text-[12.5px] font-medium text-fg-2 disabled:opacity-40"
              >
                Return for Revision
              </button>
              <div className="flex-1" />
              <span className="rounded border border-border bg-background px-1.5 font-mono text-[10.5px] leading-[1.6] text-um-muted">
                Closed queue
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled
                className="flex h-[30px] items-center gap-1.5 rounded-md border border-destructive/50 bg-transparent px-3 text-[12.5px] font-medium text-destructive disabled:opacity-40"
              >
                Reject
              </button>
              <button
                type="button"
                disabled
                className="flex h-[30px] items-center gap-1.5 rounded-md border border-warn bg-transparent px-3 text-[12.5px] font-medium text-warn disabled:opacity-40"
              >
                Request Modifications
              </button>
              <div className="flex-1" />
              <button
                type="button"
                disabled
                className="flex h-[30px] items-center gap-1.5 rounded-md border border-primary bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-40"
              >
                Approve
              </button>
            </>
          )}
        </div>
      </div>
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

const CRITERIA_PLACEHOLDER: { label: string; note: string; status: "pass" | "pend" | "fail" }[] = [
  {
    label: "Source verification complete",
    note: "Manual check — gate not yet wired.",
    status: "pend",
  },
  {
    label: "Legal clearance",
    note: "Manual check — gate not yet wired.",
    status: "pend",
  },
  {
    label: "Factual accuracy review",
    note: "Manual check — gate not yet wired.",
    status: "pend",
  },
  {
    label: "Editorial standards audit",
    note: "Manual check — gate not yet wired.",
    status: "pend",
  },
  {
    label: "Right-of-reply issued",
    note: "Manual check — gate not yet wired.",
    status: "pend",
  },
];
