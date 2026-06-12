import Link from "next/link";
import { Calendar as CalendarIcon, Grid2x2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { setScheduleStatus } from "@/lib/actions/schedule";

export const dynamic = "force-dynamic";

type ScheduleRow = {
  id: string;
  code: string;
  article_id: string;
  publish_at: string;
  slot_window: "am" | "pm" | "breaking" | "evergreen";
  priority: number;
  notes: string;
  status: "pending" | "published" | "withdrawn";
  scheduled_at: string;
};

type ArticleRow = {
  id: string;
  headline: string;
  state: string;
  sectors: string[];
  geo_tier: string | null;
};


const SLOT_PILL: Record<string, string> = {
  am: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  pm: "border-state-sub/35 bg-state-sub/10 text-state-sub",
  breaking: "border-destructive/35 bg-destructive/10 text-destructive",
  evergreen: "border-um-muted/35 bg-um-muted/10 text-um-muted",
};

const STATUS_PILL: Record<string, string> = {
  pending: "border-warn/35 bg-warn/10 text-warn",
  published: "border-success/35 bg-success/10 text-success",
  withdrawn: "border-um-muted/35 bg-um-muted/10 text-um-muted",
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmp = new Date(d);
  cmp.setHours(0, 0, 0, 0);
  const diff = Math.round((cmp.getTime() - today.getTime()) / 86_400_000);
  const wkday = d.toLocaleDateString("en-GB", { weekday: "short" });
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  if (diff === 0) return `Today · ${wkday} ${datePart}`;
  if (diff === 1) return `Tomorrow · ${wkday} ${datePart}`;
  if (diff === -1) return `Yesterday · ${wkday} ${datePart}`;
  return `${wkday} ${datePart}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false }).slice(0, 5);
}

export default async function CalendarPage() {
  const supabase = await createClient();

  const [schedRes, artRes] = await Promise.all([
    supabase
      .from("schedule_entries")
      .select(
        "id, code, article_id, publish_at, slot_window, priority, notes, status, scheduled_at",
      )
      .order("publish_at", { ascending: true }),
    supabase.from("articles").select("id, headline, state, sectors, geo_tier"),
  ]);

  const entries: ScheduleRow[] = schedRes.data ?? [];
  const articles: ArticleRow[] = artRes.data ?? [];
  const articleMap = new Map(articles.map((a) => [a.id, a]));

  // Group by day, then sort buckets
  const byDay = new Map<string, { day: Date; rows: ScheduleRow[] }>();
  for (const e of entries) {
    const k = dayKey(e.publish_at);
    if (!byDay.has(k)) byDay.set(k, { day: new Date(e.publish_at), rows: [] });
    byDay.get(k)!.rows.push(e);
  }
  // Always include today even if empty
  const todayK = dayKey(new Date().toISOString());
  if (!byDay.has(todayK)) byDay.set(todayK, { day: new Date(), rows: [] });

  const days = Array.from(byDay.values()).sort(
    (a, b) => a.day.getTime() - b.day.getTime(),
  );

  // Top-line
  const todayCount = entries.filter(
    (e) => dayKey(e.publish_at) === todayK && e.status !== "withdrawn",
  ).length;
  const pendingCount = entries.filter((e) => e.status === "pending").length;
  const publishedToday = entries.filter(
    (e) => dayKey(e.publish_at) === todayK && e.status === "published",
  ).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <CalendarIcon className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Schedule</span>
        <span className="text-[11px] text-um-muted">
          {entries.length} entries · {todayCount} today · {pendingCount} pending
        </span>
        <Link
          href="/calendar/grid"
          className="ml-auto flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
        >
          <Grid2x2 className="h-3.5 w-3.5" />
          Week grid
        </Link>
      </div>

      {/* KPIs */}
      <div className="flex flex-shrink-0 gap-3 border-b border-border bg-card px-5 py-3">
        <Kpi label="Scheduled today" value={todayCount} tone="comm" />
        <Kpi label="Published today" value={publishedToday} tone="success" />
        <Kpi label="Pending overall" value={pendingCount} tone="warn" />
        <Kpi label="Total entries" value={entries.length} tone="muted" />
      </div>

      {/* Day groups */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-5">
          {days.map(({ day, rows }) => {
            const k = dayKey(day.toISOString());
            const isToday = k === todayK;
            return (
              <section key={k}>
                <div className="mb-2 flex items-center gap-2">
                  <h3
                    className={cn(
                      "text-[12.5px] font-semibold uppercase tracking-[0.06em]",
                      isToday ? "text-foreground" : "text-um-muted",
                    )}
                  >
                    {dayLabel(day)}
                  </h3>
                  <span className="font-mono text-[10.5px] text-um-muted">
                    {rows.length} {rows.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-center text-[11.5px] italic text-um-muted">
                    Nothing scheduled.
                  </div>
                ) : (
                  <ul className="overflow-hidden rounded-md border border-border bg-card">
                    {rows.map((e) => {
                      const art = articleMap.get(e.article_id);
                      return (
                        <li
                          key={e.id}
                          className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
                        >
                          <div className="flex w-16 flex-shrink-0 flex-col items-start gap-1 pt-0.5">
                            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                              {fmtTime(e.publish_at)}
                            </span>
                            <span
                              className={cn(
                                "rounded-sm border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                                SLOT_PILL[e.slot_window],
                              )}
                            >
                              {e.slot_window}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <Link
                                href={art ? `/articles/${art.id}` : "#"}
                                className="truncate text-[13px] font-semibold text-foreground hover:text-primary"
                              >
                                {art?.headline ?? "—"}
                              </Link>
                              <span
                                className={cn(
                                  "ml-auto flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                                  STATUS_PILL[e.status],
                                )}
                              >
                                {e.status}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-um-muted">
                              <span className="font-mono text-[10px] font-semibold text-fg-2">
                                {e.code}
                              </span>
                              <span>P{e.priority}</span>
                              {art?.geo_tier ? (
                                <span className="rounded-sm border border-border-mid bg-background px-1 font-mono text-[9.5px] uppercase tracking-wider">
                                  {art.geo_tier.replace("_", " ")}
                                </span>
                              ) : null}
                              {art?.sectors.length ? (
                                <span>{art.sectors.slice(0, 3).join(" · ")}</span>
                              ) : null}
                            </div>
                            {e.notes ? (
                              <p className="mt-1 text-[11.5px] leading-[1.4] text-fg-2">
                                {e.notes}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-shrink-0 flex-col gap-1">
                            {e.status === "pending" ? (
                              <>
                                <StatusBtn
                                  id={e.id}
                                  target="published"
                                  label="Publish"
                                  tone="success"
                                />
                                <StatusBtn
                                  id={e.id}
                                  target="withdrawn"
                                  label="Withdraw"
                                  tone="muted"
                                />
                              </>
                            ) : e.status === "published" ? (
                              <span className="text-[10.5px] italic text-um-muted">live</span>
                            ) : (
                              <StatusBtn
                                id={e.id}
                                target="pending"
                                label="Restore"
                                tone="warn"
                              />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
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
  tone: "comm" | "success" | "warn" | "muted";
}) {
  const cls =
    tone === "comm"
      ? "text-state-comm"
      : tone === "success"
        ? "text-success"
        : tone === "warn"
          ? "text-warn"
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

function StatusBtn({
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
        : "border-border bg-background text-um-muted hover:bg-secondary";
  return (
    <form action={setScheduleStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={target} />
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
