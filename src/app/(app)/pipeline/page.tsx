import Link from "next/link";
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
  published_at: string | null;
};

type StageDef = { state: string; label: string };

const STAGES: StageDef[] = [
  { state: "all", label: "All" },
  { state: "pitched", label: "Pitched" },
  { state: "commissioned", label: "Commissioned" },
  { state: "filed", label: "Filed" },
  { state: "subbed", label: "Sub-editing" },
  { state: "legal", label: "Legal" },
  { state: "scheduled", label: "Scheduled" },
  { state: "live", label: "Live" },
];

const PILL: Record<string, string> = {
  pitched: "border-state-pitched/30 bg-state-pitched/10 text-state-pitched",
  commissioned: "border-state-comm/35 bg-state-comm/12 text-state-comm",
  filed: "border-state-filed/35 bg-state-filed/12 text-state-filed",
  subbed: "border-state-sub/35 bg-state-sub/12 text-state-sub",
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
  subbed: "Sub-editing",
  legal: "Legal",
  scheduled: "Scheduled",
  live: "Live",
  rejected: "Rejected",
  killed: "Killed",
};

function ageInStage(updatedAt: string): { text: string; tone: "ok" | "warn" | "danger" } {
  const hours = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 3_600_000);
  if (hours < 24) return { text: `${Math.max(hours, 0)}h`, tone: "ok" };
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  const text = rem ? `${days}d ${rem}h` : `${days}d`;
  if (days >= 3) return { text, tone: "danger" };
  if (days >= 2) return { text, tone: "warn" };
  return { text, tone: "ok" };
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const sp = await searchParams;
  const active = sp.stage ?? "all";

  const supabase = await createClient();
  const { data: articles } = await supabase
    .from("articles")
    .select(
      "id, slug, headline, standfirst, state, sectors, geo_tier, updated_at, published_at",
    )
    .order("updated_at", { ascending: false });

  const all: ArticleRow[] = articles ?? [];
  const counts = new Map<string, number>([["all", all.length]]);
  for (const r of all) counts.set(r.state, (counts.get(r.state) ?? 0) + 1);

  const visible = active === "all" ? all : all.filter((r) => r.state === active);

  return (
    <div className="flex h-full flex-col">
      {/* Stage tabs */}
      <div className="flex flex-shrink-0 items-end gap-0 overflow-x-auto border-b border-border bg-card px-4">
        {STAGES.map((s) => {
          const isActive = s.state === active;
          const count = counts.get(s.state) ?? 0;
          const href = s.state === "all" ? "/pipeline" : `/pipeline?stage=${s.state}`;
          return (
            <Link
              key={s.state}
              href={href}
              className={cn(
                "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[12px] font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-fg-2 hover:text-foreground",
              )}
            >
              {s.label}
              <span
                className={cn(
                  "rounded-full border px-1.5 font-mono text-[10.5px] tabular-nums leading-[1.7]",
                  isActive
                    ? "border-primary/35 bg-accent text-primary"
                    : "border-border bg-background text-um-muted",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Stats bar */}
      <div className="flex flex-shrink-0 items-center gap-5 border-b border-border bg-card px-4 py-2 text-[12px]">
        <span className="text-fg-2">
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {visible.length}
          </span>{" "}
          in view
        </span>
        <span className="ml-auto text-[11px] text-um-muted">
          Updated {new Date().toLocaleTimeString("en-GB", { hour12: false }).slice(0, 5)}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center text-[12.5px] text-um-muted">
            No articles in this stage.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Article</Th>
                <Th>Stage</Th>
                <Th>Sectors</Th>
                <Th>Geo</Th>
                <Th className="text-right">In stage</Th>
                <Th className="text-right">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const age = ageInStage(r.updated_at);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border transition-colors hover:bg-secondary"
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <Link
                        href={`/articles/${r.id}`}
                        className="block max-w-[480px] text-[13px] font-medium leading-[1.35] text-foreground hover:text-primary"
                      >
                        {r.headline}
                      </Link>
                      {r.standfirst ? (
                        <span className="mt-0.5 block max-w-[480px] truncate text-[11.5px] text-um-muted">
                          {r.standfirst}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          PILL[r.state],
                        )}
                      >
                        <span
                          className="h-[5px] w-[5px] rounded-full"
                          style={{ background: `var(--s-${stateDotKey(r.state)})` }}
                        />
                        {STATE_LABEL[r.state] ?? r.state}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[11.5px] text-fg-2">
                      {r.sectors.slice(0, 2).join(" · ") || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle font-mono text-[11px] uppercase tracking-wider text-um-muted">
                      {r.geo_tier ? r.geo_tier.replace("_", " ") : "—"}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right align-middle font-mono text-[11px] tabular-nums",
                        age.tone === "ok" && "text-um-muted",
                        age.tone === "warn" && "font-semibold text-warn",
                        age.tone === "danger" && "font-semibold text-destructive",
                      )}
                    >
                      {age.text}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-mono text-[11px] text-um-muted">
                      {new Date(r.updated_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
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

function stateDotKey(state: string): string {
  if (state === "commissioned") return "comm";
  if (state === "subbed") return "sub";
  if (state === "scheduled") return "sched";
  return state;
}
