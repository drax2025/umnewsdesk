import Link from "next/link";
import { FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CORRECTION_KINDS,
  CORRECTION_STATUSES,
  summariseCorrections,
  type ArticleCorrectionRow,
  type CorrectionKind,
  type CorrectionStatus,
} from "@/lib/spec/stage13-corrections";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Stage 13 — `/corrections` global register.
 *
 * Cross-title view of every correction filed, draft-or-live, with title /
 * kind / status filters. Senior Editors triage from here; editors see
 * the queue of their own drafts awaiting review.
 */

type TitleRow = { id: string; slug: string; name: string };
type ArticleLite = { id: string; headline: string; title_id: string };

type SearchParams = {
  title?: string;
  status?: string;
  kind?: string;
};

export default async function CorrectionsIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const titleSlug = params.title?.trim() ?? "";
  const status = (params.status?.trim() as CorrectionStatus | "") ?? "";
  const kind = (params.kind?.trim() as CorrectionKind | "") ?? "";

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

  const admin = createServiceClient();
  let titleId: string | null = null;
  if (titleSlug) {
    const { data: t } = await admin
      .from("titles")
      .select("id")
      .eq("slug", titleSlug)
      .maybeSingle<{ id: string }>();
    titleId = t?.id ?? null;
  }

  let req = admin
    .from("article_corrections")
    .select(
      "id, article_id, title_id, kind, status, description, source, public_notice, fields_changed, filed_by, filed_at, approved_by, approved_at, withdrawn_by, withdrawn_at, withdrawn_reason, sequence, updated_at",
    )
    .order("filed_at", { ascending: false })
    .limit(400);
  if (titleId) req = req.eq("title_id", titleId);
  if (status) req = req.eq("status", status);
  if (kind) req = req.eq("kind", kind);

  const [{ data: rowsRaw }, { data: titlesRaw }] = await Promise.all([
    req,
    admin.from("titles").select("id, slug, name").order("name"),
  ]);
  const rows: ArticleCorrectionRow[] =
    (rowsRaw ?? []) as ArticleCorrectionRow[];
  const titles: TitleRow[] = (titlesRaw ?? []) as TitleRow[];

  const articleIds = Array.from(new Set(rows.map((r) => r.article_id)));
  const { data: articlesRaw } = articleIds.length
    ? await admin
        .from("articles")
        .select("id, headline, title_id")
        .in("id", articleIds)
    : { data: [] };
  const articleMap = new Map<string, ArticleLite>(
    ((articlesRaw ?? []) as ArticleLite[]).map((a) => [a.id, a]),
  );
  const titleNameById = new Map(titles.map((t) => [t.id, t.name]));

  const summary = summariseCorrections(rows);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-baseline gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-warn" />
            <h1 className="text-[14px] font-semibold tracking-tight">
              Corrections register · Stage 13
            </h1>
          </div>
          <span className="font-mono text-[11px] text-um-muted">
            {summary.total} total · {summary.draft} awaiting Senior ·{" "}
            {summary.approved} live · {summary.withdrawn} withdrawn
            {summary.retractions > 0
              ? ` · ${summary.retractions} retraction${summary.retractions === 1 ? "" : "s"}`
              : ""}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] space-y-3 px-6 py-4">
        {/* Filters */}
        <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Title
            </label>
            <select
              name="title"
              defaultValue={titleSlug}
              className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
            >
              <option value="">All titles</option>
              {titles.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Kind
            </label>
            <select
              name="kind"
              defaultValue={kind}
              className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
            >
              <option value="">All kinds</option>
              {CORRECTION_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              Status
            </label>
            <select
              name="status"
              defaultValue={status}
              className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
            >
              <option value="">All statuses</option>
              {CORRECTION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-8 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-medium text-primary hover:bg-primary/15"
          >
            Apply
          </button>
          <Link
            href="/corrections"
            className="h-8 rounded-md border border-border bg-background px-3 pt-[0.4rem] text-[11.5px] text-fg-2 hover:bg-secondary"
          >
            Clear
          </Link>
        </form>

        <p className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
          <strong className="text-fg-2">Stage 13 policy:</strong> every
          post-publish change is a row here. Editors file drafts; Senior
          Editors approve, which appends the public notice to the article
          and (for retractions) flips state to <code>killed</code>. Open
          the dossier link for full action controls.
          {isSenior
            ? " You are a Senior Editor — your queue is the DRAFT lane."
            : null}
        </p>

        {/* List */}
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {rows.length === 0 ? (
            <p className="px-3 py-10 text-center text-[12px] text-um-muted">
              No corrections match the current filter.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const art = articleMap.get(r.article_id);
                const kindDef = CORRECTION_KINDS.find(
                  (k) => k.value === r.kind,
                )!;
                const statusDef = CORRECTION_STATUSES.find(
                  (s) => s.value === r.status,
                )!;
                return (
                  <li key={r.id} className="px-3 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]",
                          kindDef.tone === "destructive"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : kindDef.tone === "warn"
                              ? "border-warn/40 bg-warn/10 text-warn"
                              : "border-border bg-secondary text-um-muted",
                        )}
                      >
                        {kindDef.short} #{r.sequence}
                      </span>
                      <span
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]",
                          statusDef.tone === "success"
                            ? "border-success/40 bg-success/10 text-success"
                            : statusDef.tone === "warn"
                              ? "border-warn/40 bg-warn/10 text-warn"
                              : "border-border bg-secondary text-um-muted",
                        )}
                      >
                        {statusDef.short}
                      </span>
                      <span className="font-mono text-[10.5px] text-um-muted">
                        {titleNameById.get(r.title_id) ?? "—"}
                      </span>
                      <Link
                        href={`/articles/${r.article_id}`}
                        className="text-[12.5px] font-medium text-primary hover:underline"
                      >
                        {art?.headline ?? "(article missing)"}
                      </Link>
                      <span className="ml-auto font-mono text-[10.5px] text-um-muted">
                        filed{" "}
                        {new Date(r.filed_at).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-[1.5] text-fg-2">
                      {r.description}
                    </p>
                    <div className="mt-1.5 rounded-sm border border-border bg-background/40 px-2 py-1 text-[11px] leading-[1.45] text-fg-2">
                      <span className="font-mono text-[10px] uppercase text-um-muted">
                        notice:
                      </span>{" "}
                      {r.public_notice}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
