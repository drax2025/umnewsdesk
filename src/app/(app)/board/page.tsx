import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  slug: string | null;
  headline: string;
  state: string;
  sectors: string[];
  geo_tier: string | null;
  updated_at: string;
};

type ColumnDef = {
  state: string;
  label: string;
  dot: string; // CSS color
};

const COLUMNS: ColumnDef[] = [
  { state: "pitched",      label: "Pitched",      dot: "var(--s-pitched)" },
  { state: "commissioned", label: "Commissioned", dot: "var(--s-comm)" },
  { state: "filed",        label: "Filed",        dot: "var(--s-filed)" },
  { state: "subbed",       label: "Subbed",       dot: "var(--s-sub)" },
  { state: "legal",        label: "Legal",        dot: "var(--s-legal)" },
  { state: "scheduled",    label: "Scheduled",    dot: "var(--s-sched)" },
  { state: "wp_draft",     label: "WP Draft",     dot: "var(--s-wpdraft)" },
  { state: "live",         label: "Live",         dot: "var(--s-live)" },
];

function ageLabel(updatedAt: string): { text: string; tone: "" | "aging" | "overdue" | "live" } {
  const now = Date.now();
  const t = new Date(updatedAt).getTime();
  const hours = Math.floor((now - t) / (1000 * 60 * 60));
  if (hours < 1) return { text: "now", tone: "" };
  if (hours < 24) return { text: `${hours}h`, tone: hours > 12 ? "aging" : "" };
  const days = Math.floor(hours / 24);
  return { text: `${days}d`, tone: days > 2 ? "overdue" : "aging" };
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export default async function BoardPage() {
  const supabase = await createClient();

  const { data: articles } = await supabase
    .from("articles")
    .select("id, slug, headline, state, sectors, geo_tier, updated_at")
    .not("state", "in", "(rejected,killed)")
    .order("updated_at", { ascending: false });

  const rows: ArticleRow[] = articles ?? [];
  const byState = new Map<string, ArticleRow[]>();
  for (const col of COLUMNS) byState.set(col.state, []);
  for (const r of rows) byState.get(r.state)?.push(r);

  const inFlight = rows.filter((r) => !["live"].includes(r.state)).length;
  const awaitingDecision = rows.filter((r) =>
    ["filed", "subbed", "legal"].includes(r.state),
  ).length;
  const ready = rows.filter((r) => r.state === "scheduled").length;
  const liveCount = rows.filter((r) => r.state === "live").length;

  return (
    <div className="flex h-full flex-col">
      {/* Stats bar */}
      <div className="flex items-center gap-5 border-b border-border bg-card px-5 py-2.5 text-[11.5px]">
        <Stat dot="var(--um-accent)" value={inFlight} label="in flight" />
        <Stat dot="var(--warn)" value={awaitingDecision} label="awaiting decision" />
        <Stat dot="var(--success)" value={ready} label="ready to publish" />
        <Stat dot="var(--s-live)" value={liveCount} label="live" />
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          Updated {new Date().toLocaleTimeString("en-GB", { hour12: false }).slice(0, 5)}
        </span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
        <div className="flex h-full gap-2.5">
          {COLUMNS.map((col) => {
            const cards = byState.get(col.state) ?? [];
            return (
              <div
                key={col.state}
                className="flex h-full w-[240px] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
                style={{ borderTopColor: col.dot, borderTopWidth: 2 }}
              >
                {/* Column header */}
                <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
                  <span
                    className="block h-[7px] w-[7px] flex-shrink-0 rounded-full"
                    style={{ background: col.dot }}
                  />
                  <span className="flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.045em] text-fg-2">
                    {col.label}
                  </span>
                  <span className="flex-shrink-0 rounded-full border border-border bg-background px-1.5 font-mono text-[10px] tabular-nums leading-[1.7] text-um-muted">
                    {cards.length}
                  </span>
                </div>

                {/* Column body */}
                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
                  {cards.length === 0 ? (
                    <div className="px-2 py-4 text-center text-[11px] text-um-muted">
                      No stories at this stage
                    </div>
                  ) : (
                    cards.map((r) => {
                      const age = ageLabel(r.updated_at);
                      return (
                        <Link
                          key={r.id}
                          href={`/articles/${r.id}`}
                          className="rounded-md border border-border bg-background px-2.5 py-2 transition-colors hover:border-border-mid hover:bg-secondary"
                        >
                          {/* Top row: id + age */}
                          <div className="mb-1 flex items-start justify-between gap-1.5">
                            <span className="font-mono text-[10px] tracking-[0.03em] text-um-muted">
                              {shortId(r.id)}
                            </span>
                            <span
                              className={cn(
                                "whitespace-nowrap font-mono text-[10px] tabular-nums",
                                age.tone === "aging" && "text-warn",
                                age.tone === "overdue" && "font-semibold text-destructive",
                                age.tone === "live" && "text-success",
                                !age.tone && "text-um-muted",
                              )}
                            >
                              {age.text}
                            </span>
                          </div>

                          {/* Sector tag */}
                          {r.sectors.length > 0 ? (
                            <div className="mb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.055em] text-um-muted">
                              {r.sectors[0]}
                            </div>
                          ) : null}

                          {/* Headline */}
                          <p className="line-clamp-3 text-[12px] font-medium leading-[1.38] text-foreground">
                            {r.headline}
                          </p>

                          {/* Foot: geo tier */}
                          {r.geo_tier ? (
                            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-um-muted">
                              {r.geo_tier.replace("_", " ")}
                            </div>
                          ) : null}
                        </Link>
                      );
                    })
                  )}
                </div>

                {/* Add */}
                <button
                  type="button"
                  className="flex flex-shrink-0 items-center gap-1 border-t border-border px-3 py-1.5 text-left text-[11px] text-um-muted transition-colors hover:bg-secondary hover:text-fg-2"
                >
                  <Plus className="h-3 w-3" />
                  Add story
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ dot, value, label }: { dot: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="block h-[7px] w-[7px] rounded-full"
        style={{ background: dot }}
      />
      <span className="text-fg-2">
        <span className="font-mono font-semibold tabular-nums text-foreground">{value}</span>{" "}
        {label}
      </span>
    </div>
  );
}
