import { ListTodo } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  OPPORTUNITY_SECTIONS,
  isAutoArchived,
  summariseBySection,
  type ArticlePipelineOpportunityRow,
  type OpportunitySection,
  type OpportunityVerdict,
} from "@/lib/spec/a3-opportunities";
import { OpportunityFiltersForm } from "@/components/forms/a3-opportunities-filters";
import { OpportunityAddButton } from "@/components/forms/a3-opportunity-add";
import { OpportunitySectionBlock } from "@/components/forms/a3-opportunity-section";

export const dynamic = "force-dynamic";

/**
 * A3 Editorial opportunities pipeline / K5 Friday sweep.
 *
 *   - Header: section roll-up (counts per A/B/C/D/E + verdict mix).
 *   - Filters: title, section, verdict, include_archived.
 *   - Sections: five blocks, each with the active list of opportunities.
 *   - Per row: K5 verdict pills (COMMISSION / PARK / DROP), edit, sweep
 *     counter, source-article back-pointer.
 *   - Editor: 'Add opportunity' modal — title + section + notes.
 */

type TitleRow = { id: string; slug: string; name: string };
type ArticleRefRow = {
  id: string;
  headline: string;
  slug: string | null;
  title_id: string;
};

type SearchParams = {
  title?: string;
  section?: OpportunitySection | string;
  verdict?: OpportunityVerdict | string;
  archived?: string;
};

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const titleSlug = params.title?.trim() ?? "";
  const section = (params.section?.trim() as OpportunitySection | "") ?? "";
  const verdict = (params.verdict?.trim() as OpportunityVerdict | "") ?? "";
  const includeArchived = params.archived === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: meRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<{ role: string | null }>();
  const isEditor =
    meRow?.role === "editor" || meRow?.role === "admin";
  const isSenior = meRow?.role === "editor" || meRow?.role === "admin";

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
    .from("article_pipeline_opportunities")
    .select(
      "id, article_id, title_id, section, title, category, priority, notes, verdict, verdict_at, verdict_by, verdict_notes, sweep_count, last_swept_at, created_at, created_by",
    )
    .order("section", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(800);
  if (titleId) req = req.eq("title_id", titleId);
  if (section) req = req.eq("section", section);
  if (verdict) req = req.eq("verdict", verdict);

  const [
    { data: rowsRaw },
    { data: titlesRaw },
  ] = await Promise.all([
    req,
    admin.from("titles").select("id, slug, name").order("name"),
  ]);
  const titles: TitleRow[] = (titlesRaw ?? []) as TitleRow[];
  const allRows: ArticlePipelineOpportunityRow[] =
    (rowsRaw ?? []) as ArticlePipelineOpportunityRow[];

  // Resolve source-article headlines (one round trip).
  const articleIds = Array.from(new Set(allRows.map((r) => r.article_id)));
  const { data: artRaw } = articleIds.length
    ? await admin
        .from("articles")
        .select("id, headline, slug, title_id")
        .in("id", articleIds)
    : { data: [] };
  const articleMap = new Map<string, ArticleRefRow>(
    ((artRaw ?? []) as ArticleRefRow[]).map((a) => [a.id, a]),
  );

  // Apply auto-archive filter unless user opted in.
  const rows = includeArchived
    ? allRows
    : allRows.filter((r) => !isAutoArchived(r));

  const summary = summariseBySection(rows);
  const totalActive = rows.filter((r) => r.verdict === "pending").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-baseline gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <h1 className="text-[14px] font-semibold tracking-tight">
              Editorial Opportunities · A3 / K5 weekly sweep
            </h1>
          </div>
          <span className="font-mono text-[11px] text-um-muted">
            {rows.length} rows shown · {totalActive} pending
            {includeArchived ? " · incl. archived" : ""}
          </span>
          {isEditor ? (
            <div className="ml-auto">
              <OpportunityAddButton titles={titles} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] space-y-3 px-6 py-4">
        <div className="rounded-md border border-border bg-card p-3">
          <OpportunityFiltersForm
            initialTitle={titleSlug}
            initialSection={section}
            initialVerdict={verdict}
            includeArchived={includeArchived}
            titles={titles}
          />
        </div>

        <p className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
          <strong className="text-fg-2">K5 policy:</strong> opportunities
          require explicit COMMISSION / PARK / DROP via the Friday sweep.
          Parked rows older than 90 days auto-archive (toggle to see them).
          Rows touched by 4 sweeps without a verdict default to DROP — these
          highlight in amber.
        </p>

        {OPPORTUNITY_SECTIONS.map((def) => {
          const sectionRows = rows.filter((r) => r.section === def.value);
          const sectionSummary = summary.find((s) => s.section === def.value);
          if (sectionRows.length === 0 && section) return null;
          return (
            <OpportunitySectionBlock
              key={def.value}
              section={def.value}
              rows={sectionRows}
              summary={sectionSummary}
              articleMap={Object.fromEntries(articleMap)}
              canEdit={isEditor}
              canDelete={isSenior}
            />
          );
        })}
      </div>
    </div>
  );
}
