import Link from "next/link";
import { List, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ScheduleRow = {
  id: string;
  code: string;
  article_id: string;
  publish_at: string;
  slot_window: "am" | "pm" | "breaking" | "evergreen";
  priority: number;
  status: "pending" | "published" | "withdrawn";
};

type ArticleRow = {
  id: string;
  headline: string;
  geo_tier: string | null;
};

const SLOTS: Array<{ key: ScheduleRow["slot_window"]; label: string; sub: string }> = [
  { key: "am", label: "AM", sub: "06:00" },
  { key: "pm", label: "PM", sub: "15:00" },
  { key: "breaking", label: "Breaking", sub: "any time" },
  { key: "evergreen", label: "Evergreen", sub: "any time" },
];

const STATUS_CARD: Record<string, string> = {
  pending: "border-warn/40 bg-warn/8 hover:bg-warn/12",
  published: "border-success/40 bg-success/8 hover:bg-success/12",
  withdrawn: "border-um-muted/30 bg-um-muted/5 opacity-60 hover:opacity-80",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-warn",
  published: "bg-success",
  withdrawn: "bg-um-muted",
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date, offsetWeeks = 0): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // Monday-first: getDay() returns 0=Sun..6=Sat
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff + offsetWeeks * 7);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false }).slice(0, 5);
}

function fmtWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString("en-GB", { day: "2-digit", month: sameMonth ? undefined : "short" });
  const e = end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${s} – ${e}`;
}

export default async function CalendarGridPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const sp = await searchParams;
  const weekOffset = Number.parseInt(sp.w ?? "0", 10) || 0;

  const supabase = await createClient();

  const weekStart = startOfWeek(new Date(), weekOffset);
  const weekEnd = addDays(weekStart, 6);
  const rangeStart = new Date(weekStart);
  const rangeEnd = new Date(weekEnd);
  rangeEnd.setHours(23, 59, 59, 999);

  const [schedRes, artRes] = await Promise.all([
    supabase
      .from("schedule_entries")
      .select("id, code, article_id, publish_at, slot_window, priority, status")
      .gte("publish_at", rangeStart.toISOString())
      .lte("publish_at", rangeEnd.toISOString())
      .order("publish_at", { ascending: true }),
    supabase.from("articles").select("id, headline, geo_tier"),
  ]);

  const entries: ScheduleRow[] = schedRes.data ?? [];
  const articles: ArticleRow[] = artRes.data ?? [];
  const articleMap = new Map(articles.map((a) => [a.id, a]));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = dayKey(new Date());

  // Build cell map: `${dayKey}|${slot}` → entries
  const cellMap = new Map<string, ScheduleRow[]>();
  for (const e of entries) {
    const k = `${dayKey(new Date(e.publish_at))}|${e.slot_window}`;
    if (!cellMap.has(k)) cellMap.set(k, []);
    cellMap.get(k)!.push(e);
  }

  const weekCount = entries.length;
  const pendingCount = entries.filter((e) => e.status === "pending").length;
  const publishedCount = entries.filter((e) => e.status === "published").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/calendar/grid?w=${weekOffset - 1}`}
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-background text-fg-2 hover:bg-secondary"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/calendar/grid"
            className={cn(
              "rounded-sm border border-border bg-background px-2.5 py-1 text-[11px] font-medium",
              weekOffset === 0 ? "text-foreground" : "text-fg-2 hover:bg-secondary",
            )}
          >
            This week
          </Link>
          <Link
            href={`/calendar/grid?w=${weekOffset + 1}`}
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-background text-fg-2 hover:bg-secondary"
            aria-label="Next week"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <span className="text-[13px] font-semibold text-foreground">
          {fmtWeekRange(weekStart, weekEnd)}
        </span>
        <span className="text-[11px] text-um-muted">
          {weekCount} entries · {publishedCount} published · {pendingCount} pending
        </span>
        <Link
          href="/calendar"
          className="ml-auto flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
        >
          <List className="h-3.5 w-3.5" />
          Timeline
        </Link>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="min-w-[960px]">
          {/* Day header row */}
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: "100px repeat(7, minmax(0, 1fr))" }}
          >
            <div />
            {days.map((d) => {
              const isToday = dayKey(d) === todayKey;
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "rounded-sm border px-2 py-1.5 text-center",
                    isToday
                      ? "border-primary/40 bg-primary/8"
                      : "border-border bg-card",
                  )}
                >
                  <div
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-[0.06em]",
                      isToday ? "text-primary" : "text-um-muted",
                    )}
                  >
                    {d.toLocaleDateString("en-GB", { weekday: "short" })}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-[12.5px] tabular-nums",
                      isToday ? "text-foreground" : "text-fg-2",
                    )}
                  >
                    {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Slot rows */}
          <div className="mt-1.5 flex flex-col gap-1.5">
            {SLOTS.map((slot) => (
              <div
                key={slot.key}
                className="grid gap-1.5"
                style={{ gridTemplateColumns: "100px repeat(7, minmax(0, 1fr))" }}
              >
                {/* Slot label */}
                <div className="flex flex-col justify-center rounded-sm border border-border bg-card px-2.5 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    {slot.label}
                  </div>
                  <div className="font-mono text-[9.5px] text-um-muted">{slot.sub}</div>
                </div>
                {/* Day cells */}
                {days.map((d) => {
                  const k = `${dayKey(d)}|${slot.key}`;
                  const rows = cellMap.get(k) ?? [];
                  const isToday = dayKey(d) === todayKey;
                  return (
                    <div
                      key={k}
                      className={cn(
                        "flex min-h-[88px] flex-col gap-1 rounded-sm border p-1.5",
                        isToday
                          ? "border-primary/25 bg-primary/[0.03]"
                          : "border-border bg-card/40",
                      )}
                    >
                      {rows.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center text-[10px] italic text-um-muted/60">
                          —
                        </div>
                      ) : (
                        rows.map((e) => {
                          const art = articleMap.get(e.article_id);
                          return (
                            <Link
                              key={e.id}
                              href={art ? `/articles/${art.id}` : "#"}
                              className={cn(
                                "block rounded-sm border px-1.5 py-1 transition-colors",
                                STATUS_CARD[e.status],
                              )}
                            >
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                                    STATUS_DOT[e.status],
                                  )}
                                />
                                <span className="font-mono text-[10px] font-semibold tabular-nums text-foreground">
                                  {fmtTime(e.publish_at)}
                                </span>
                                <span className="font-mono text-[9px] text-um-muted">
                                  P{e.priority}
                                </span>
                                {art?.geo_tier ? (
                                  <span className="ml-auto font-mono text-[9px] uppercase text-um-muted">
                                    {art.geo_tier.replace("_", " ")}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-[1.3] text-foreground">
                                {art?.headline ?? "—"}
                              </div>
                              <div className="mt-0.5 font-mono text-[9px] text-um-muted">
                                {e.code}
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 px-1 text-[10.5px] text-um-muted">
            <span className="font-semibold uppercase tracking-wider">Legend</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warn" />
              Pending
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" />
              Published
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-um-muted" />
              Withdrawn
            </span>
            <span className="ml-auto italic">
              Click a card to open the article dossier.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
