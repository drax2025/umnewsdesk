import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type ArticleRow = {
  id: string;
  slug: string | null;
  headline: string;
  state: string;
  sectors: string[];
  updated_at: string;
  published_at: string | null;
};

const STATE_LABEL: Record<string, string> = {
  pitched: "Pitched",
  commissioned: "Commissioned",
  filed: "Filed",
  subbed: "Subbed",
  legal: "Legal",
  scheduled: "Scheduled",
  live: "Live",
  rejected: "Rejected",
  killed: "Killed",
};

const STATE_CLASS: Record<string, string> = {
  pitched: "bg-state-pitched/15 text-state-pitched border-state-pitched/30",
  commissioned: "bg-state-comm/15 text-state-comm border-state-comm/30",
  filed: "bg-state-filed/15 text-state-filed border-state-filed/30",
  subbed: "bg-state-sub/15 text-state-sub border-state-sub/30",
  legal: "bg-state-legal/15 text-state-legal border-state-legal/30",
  scheduled: "bg-state-sched/15 text-state-sched border-state-sched/30",
  live: "bg-state-live/15 text-state-live border-state-live/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  killed: "bg-um-muted/15 text-um-muted border-um-muted/30",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: meRow } = user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string | null }>()
    : { data: null };
  const isSenior = meRow?.role === "senior_editor";

  const [articlesRes, correctionsDraftRes] = await Promise.all([
    supabase
      .from("articles")
      .select("id, slug, headline, state, sectors, updated_at, published_at")
      .order("updated_at", { ascending: false }),
    // Stage 13 — Senior-only queue size for the awaiting-approval tile.
    supabase
      .from("article_corrections")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
  ]);

  const rows: ArticleRow[] = articlesRes.data ?? [];
  const correctionsDraftCount = correctionsDraftRes.count ?? 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const counts = {
    publishedToday: rows.filter(
      (r) =>
        r.state === "live" &&
        r.published_at &&
        new Date(r.published_at) >= startOfToday,
    ).length,
    inFlight: rows.filter(
      (r) => !["pitched", "live", "rejected", "killed"].includes(r.state),
    ).length,
    awaitingApproval: rows.filter((r) =>
      ["filed", "subbed", "legal"].includes(r.state),
    ).length,
    publishReady: rows.filter((r) => r.state === "scheduled").length,
    escalations: 0, // placeholder — wire to gates table later
    rejectQueue: rows.filter((r) => r.state === "rejected").length,
    correctionsDraft: correctionsDraftCount,
  };

  const target = 14;

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Stats strip */}
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          href="/pipeline"
          value={`${counts.publishedToday}`}
          denom={`/ ${target}`}
          label="Published today"
          sub={`${Math.max(0, target - counts.publishedToday)} behind target`}
          tone={counts.publishedToday < target ? "warn" : "success"}
        />
        <StatTile
          href="/board"
          value={counts.inFlight.toString()}
          label="In-flight"
          sub="Across all states"
        />
        <StatTile
          href="/approvals"
          value={counts.awaitingApproval.toString()}
          label="Awaiting approval"
          sub="Filed · Subbed · Legal"
          tone={counts.awaitingApproval > 0 ? "warn" : undefined}
        />
        <StatTile
          value={counts.publishReady.toString()}
          label="Publish-ready"
          sub="Cleared for release"
          tone={counts.publishReady > 0 ? "success" : undefined}
        />
        {isSenior ? (
          <StatTile
            href="/corrections?status=draft"
            value={counts.correctionsDraft.toString()}
            label="Corrections to review"
            sub="Stage 13 · Senior approval"
            tone={counts.correctionsDraft > 0 ? "warn" : undefined}
          />
        ) : (
          <StatTile
            value={counts.escalations.toString()}
            label="Escalations"
            sub="Senior Editor only"
            tone={counts.escalations > 0 ? "danger" : undefined}
          />
        )}
        <StatTile
          value={counts.rejectQueue.toString()}
          label="Reject queue"
          sub="Pending review"
        />
      </section>

      {/* Recent activity */}
      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em]">
            Recent activity
          </h2>
          <Link
            href="/pipeline"
            className="text-[11.5px] text-primary hover:underline"
          >
            View all
          </Link>
        </header>
        <ul className="divide-y divide-border">
          {rows.slice(0, 8).map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-4 py-2.5 text-[12.5px] hover:bg-secondary"
            >
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider",
                  STATE_CLASS[r.state],
                )}
              >
                {STATE_LABEL[r.state]}
              </span>
              <span className="flex-1 truncate">{r.headline}</span>
              <span className="text-um-muted text-[11px]">
                {r.sectors.slice(0, 2).join(" · ")}
              </span>
              <time
                className="font-mono text-[10.5px] text-um-muted"
                dateTime={r.updated_at}
              >
                {new Date(r.updated_at).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </time>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-4 py-8 text-center text-[12.5px] text-um-muted">
              No articles yet. Seed the database or create one.
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
          <span className="ml-1 text-[13px] font-normal text-um-muted">
            {denom}
          </span>
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
