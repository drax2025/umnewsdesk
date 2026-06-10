import Link from "next/link";
import { FileText, Search } from "lucide-react";
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
  primary_frame: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const STATE_FILTERS: { state: string; label: string }[] = [
  { state: "all", label: "All" },
  { state: "pitched", label: "Pitched" },
  { state: "commissioned", label: "Commissioned" },
  { state: "filed", label: "Filed" },
  { state: "subbed", label: "Sub-editing" },
  { state: "legal", label: "Legal" },
  { state: "scheduled", label: "Scheduled" },
  { state: "live", label: "Live" },
];

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

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ArticleDossierIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const activeState = sp.state ?? "all";
  const query = (sp.q ?? "").trim();

  const supabase = await createClient();
  const { data: articles } = await supabase
    .from("articles")
    .select(
      "id, slug, headline, standfirst, state, sectors, geo_tier, primary_frame, created_at, updated_at, published_at",
    )
    .order("updated_at", { ascending: false });

  const all: ArticleRow[] = articles ?? [];

  const counts = new Map<string, number>([["all", all.length]]);
  for (const r of all) counts.set(r.state, (counts.get(r.state) ?? 0) + 1);

  const lowered = query.toLowerCase();
  const visible = all.filter((r) => {
    if (activeState !== "all" && r.state !== activeState) return false;
    if (!query) return true;
    return (
      r.headline.toLowerCase().includes(lowered) ||
      (r.standfirst ?? "").toLowerCase().includes(lowered) ||
      (r.slug ?? "").toLowerCase().includes(lowered) ||
      shortId(r.id).toLowerCase().includes(lowered)
    );
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 text-um-muted" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold text-foreground">Article Dossier</h1>
            <p className="mt-0.5 text-[11.5px] text-um-muted">
              Open the full dossier for any article — provenance, timeline, body,
              metadata, and audit trail in one view.
            </p>
          </div>
          <span className="rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] tabular-nums text-um-muted">
            {all.length} total
          </span>
        </div>
      </div>

      {/* Filter + search */}
      <div className="flex flex-shrink-0 items-end gap-0 overflow-x-auto border-b border-border bg-card px-4">
        {STATE_FILTERS.map((s) => {
          const isActive = s.state === activeState;
          const count = counts.get(s.state) ?? 0;
          const params = new URLSearchParams();
          if (s.state !== "all") params.set("state", s.state);
          if (query) params.set("q", query);
          const href = params.toString() ? `/articles?${params.toString()}` : "/articles";
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

        <form className="ml-auto flex items-center gap-1.5 py-1.5" action="/articles">
          {activeState !== "all" ? (
            <input type="hidden" name="state" value={activeState} />
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-um-muted" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search headline, slug, ID…"
              className="h-7 w-[240px] rounded-md border border-border bg-background pl-7 pr-2 text-[12px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
            />
          </div>
        </form>
      </div>

      {/* Stats bar */}
      <div className="flex flex-shrink-0 items-center gap-5 border-b border-border bg-card px-4 py-2 text-[12px]">
        <span className="text-fg-2">
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {visible.length}
          </span>{" "}
          in view
        </span>
        {query ? (
          <span className="text-um-muted">
            matching{" "}
            <span className="font-mono text-foreground">&ldquo;{query}&rdquo;</span>
          </span>
        ) : null}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center text-[12.5px] text-um-muted">
            {query
              ? "No articles match this search."
              : "No articles in this stage yet."}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Article</Th>
                <Th>Stage</Th>
                <Th>Sectors</Th>
                <Th>Geo</Th>
                <Th className="text-right">Updated</Th>
                <Th className="text-right">Published</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border transition-colors hover:bg-secondary"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle font-mono text-[11px] uppercase tracking-[0.06em] text-um-muted">
                    {shortId(r.id)}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Link
                      href={`/articles/${r.id}`}
                      className="block max-w-[520px] text-[13px] font-medium leading-[1.35] text-foreground hover:text-primary"
                    >
                      {r.headline}
                    </Link>
                    {r.standfirst ? (
                      <span className="mt-0.5 block max-w-[520px] truncate text-[11.5px] text-um-muted">
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
                      {STATE_LABEL[r.state] ?? r.state}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[11.5px] text-fg-2">
                    {r.sectors.slice(0, 2).join(" · ") || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle font-mono text-[11px] uppercase tracking-wider text-um-muted">
                    {r.geo_tier ? r.geo_tier.replace("_", " ") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-mono text-[11px] text-um-muted">
                    {fmtDate(r.updated_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-mono text-[11px] text-um-muted">
                    {r.published_at ? fmtDate(r.published_at) : "—"}
                  </td>
                </tr>
              ))}
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
