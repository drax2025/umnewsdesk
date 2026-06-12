import Link from "next/link";
import { ExternalLink, Library, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  INVENTORY_SOURCE_LABEL,
  SILICON_SCOTLAND_SILOS,
  summariseInventory,
  type InventorySource,
  type MasterContentInventoryRow,
} from "@/lib/spec/a2-inventory";
import { InventoryFiltersForm } from "@/components/forms/a2-inventory-filters";
import { InventoryImportButton } from "@/components/forms/a2-inventory-import";
import { InventoryRowActions } from "@/components/forms/a2-inventory-row-actions";

export const dynamic = "force-dynamic";

/**
 * A2 Master content inventory screen.
 *
 *   - Header: drift summary (legacy / native / manual / total, last native at).
 *   - Filters: query string + title + silo + source.
 *   - Table: title, headline (linked to live URL), silo, published_at,
 *            source, native back-pointer to article dossier.
 *   - Import: editor-gated form for legacy backfill.
 *   - Senior editors can delete rows; editors can edit headline / silo /
 *     sectors / notes.
 */

type TitleRow = { id: string; slug: string; name: string };

type SearchParams = {
  q?: string;
  title?: string;
  silo?: string;
  source?: string;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const titleSlug = params.title?.trim() ?? "";
  const silo = params.silo?.trim() ?? "";
  const source = (params.source?.trim() as InventorySource | "") ?? "";

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
    meRow?.role === "editor" || meRow?.role === "senior_editor";
  const isSenior = meRow?.role === "senior_editor";

  const admin = createServiceClient();

  const [{ data: titlesRaw }, { data: rowsRaw }] = await Promise.all([
    admin.from("titles").select("id, slug, name").order("name"),
    fetchInventory(admin, { q, titleSlug, silo, source }),
  ]);

  const titles: TitleRow[] = (titlesRaw ?? []) as TitleRow[];
  const titleById = new Map(titles.map((t) => [t.id, t]));
  const rows: MasterContentInventoryRow[] =
    (rowsRaw ?? []) as MasterContentInventoryRow[];

  const summary = summariseInventory(rows);

  // Silo dropdown: union of known silos + any present in current rows.
  const seenSilos = new Set<string>(SILICON_SCOTLAND_SILOS);
  for (const r of rows) if (r.silo) seenSilos.add(r.silo);
  const siloList = Array.from(seenSilos).sort((a, b) => a.localeCompare(b));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-baseline gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <Library className="h-4 w-4 text-primary" />
            <h1 className="text-[14px] font-semibold tracking-tight">
              Master Content Inventory · A2
            </h1>
          </div>
          <span className="font-mono text-[11px] text-um-muted">
            {summary.total.toLocaleString()} rows · {summary.legacy} legacy ·{" "}
            {summary.native} native · {summary.manual} manual
            {summary.last_native_at ? (
              <>
                {" "}
                · last native{" "}
                {new Date(summary.last_native_at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            ) : null}
          </span>
          {isEditor ? (
            <div className="ml-auto">
              <InventoryImportButton titles={titles} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] space-y-3 px-6 py-4">
        <div className="rounded-md border border-border bg-card p-3">
          <InventoryFiltersForm
            initialQ={q}
            initialTitle={titleSlug}
            initialSilo={silo}
            initialSource={source}
            titles={titles}
            silos={siloList}
          />
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-background/40 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                <th className="px-3 py-2 text-left">Headline</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Silo</th>
                <th className="px-3 py-2 text-left">Published</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-[12px] text-um-muted"
                  >
                    No inventory rows match the current filters.
                    {isEditor ? (
                      <>
                        {" "}
                        Use{" "}
                        <Plus className="inline h-3 w-3 align-middle" /> Import
                        row to add the first legacy entry.
                      </>
                    ) : null}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <InventoryListRow
                    key={r.id}
                    row={r}
                    title={titleById.get(r.title_id) ?? null}
                    canEdit={isEditor}
                    canDelete={isSenior}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

async function fetchInventory(
  admin: ReturnType<typeof createServiceClient>,
  { q, titleSlug, silo, source }: {
    q: string;
    titleSlug: string;
    silo: string;
    source: string;
  },
): Promise<{ data: MasterContentInventoryRow[] | null }> {
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
    .from("master_content_inventory")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (q) req = req.or(`headline.ilike.%${q}%,url.ilike.%${q}%`);
  if (titleId) req = req.eq("title_id", titleId);
  if (silo) req = req.eq("silo", silo);
  if (source) req = req.eq("source", source);

  const { data } = await req;
  return { data: (data ?? []) as MasterContentInventoryRow[] };
}

function InventoryListRow({
  row,
  title,
  canEdit,
  canDelete,
}: {
  row: MasterContentInventoryRow;
  title: TitleRow | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <tr className="hover:bg-background/40">
      <td className="px-3 py-2 align-top">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-1.5 text-foreground hover:underline"
        >
          <span className="line-clamp-2">{row.headline}</span>
          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-um-muted" />
        </a>
        <div className="mt-0.5 line-clamp-1 font-mono text-[10px] text-um-muted">
          {row.url}
        </div>
        {row.article_id ? (
          <Link
            href={`/articles/${row.article_id}`}
            className="mt-0.5 inline-block font-mono text-[10px] text-primary hover:underline"
          >
            → dossier
          </Link>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="text-[11.5px] text-fg-2">{title?.name ?? "—"}</div>
        <div className="font-mono text-[10px] text-um-muted">
          {title?.slug ?? ""}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <span className="font-mono text-[11px] text-fg-2">
          {row.silo ?? "—"}
        </span>
        {row.sectors.length > 0 ? (
          <div className="mt-0.5 line-clamp-2 text-[10px] text-um-muted">
            {row.sectors.join(", ")}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top font-mono text-[11px] text-fg-2">
        {row.published_at ?? "—"}
      </td>
      <td className="px-3 py-2 align-top">
        <span
          className={`inline-flex rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] ${SOURCE_TONE[row.source]}`}
        >
          {INVENTORY_SOURCE_LABEL[row.source]}
        </span>
      </td>
      <td className="px-3 py-2 align-top text-right">
        {canEdit ? (
          <InventoryRowActions
            row={row}
            canDelete={canDelete}
          />
        ) : null}
      </td>
    </tr>
  );
}

const SOURCE_TONE: Record<InventorySource, string> = {
  legacy_import: "border-um-muted/40 bg-um-muted/10 text-um-muted",
  native_publish: "border-success/40 bg-success/10 text-success",
  manual: "border-warn/40 bg-warn/10 text-warn",
};
