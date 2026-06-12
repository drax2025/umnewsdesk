import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PubVerdictButtons } from "@/components/forms/pub-verdict-buttons";
import {
  A_CHECK_CODES,
  PACK_HARD_CAP,
  PUB_VERDICTS,
  statusFromRow,
  summarisePrePublish,
  type ACheckStatus,
  type ArticlePrePublishRow,
  type PrePublishPackRow,
  type PubVerdict,
} from "@/lib/spec/f9-pre-publish";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * /approvals/pre-publish — Senior Editor [PUB] queue.
 *
 * Lists every Pre-Publish Pack that F9 has handed to the Senior Editor. Each
 * pack card shows the 1-3 article(s) inside, the F9 verdict + A-check roll-up,
 * and an inline APPROVE / MODIFY / REJECT verdict stamp.
 *
 * Default tab: PENDING (pub_verdict='pending' on the pack). Switch to
 * DECIDED to see recent verdicts (last 14 days).
 *
 * Senior Editor gates the verdict form. Editors see read-only roll-ups +
 * deep-link to the article's /pre-publish page.
 */

type TabKey = "pending" | "decided";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending [PUB]" },
  { key: "decided", label: "Recently decided" },
];

type ArticleLite = {
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
};

type PackWithItems = {
  pack: PrePublishPackRow;
  articles: {
    article: ArticleLite;
    pp: ArticlePrePublishRow | null;
  }[];
};

const PUB_PILL: Record<PubVerdict, string> = {
  pending: "border-border-mid bg-secondary text-um-muted",
  approve: "border-success/45 bg-success/10 text-success",
  modify: "border-warn/45 bg-warn/10 text-warn",
  reject: "border-destructive/45 bg-destructive/10 text-destructive",
};

export default async function PrePublishApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = sp.tab === "decided" ? "decided" : "pending";

  const supabase = await createClient();

  // Role gate. Editors land here, see roll-up only; senior_editor can stamp.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();
  const role = me?.role ?? "viewer";
  const canStamp = role === "senior_editor";

  // Packs.
  const basePacks = supabase.from("pre_publish_packs").select("*");
  const cutoff = new Date(
    new Date().valueOf() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const filteredPacks =
    tab === "pending"
      ? basePacks.eq("pub_verdict", "pending")
      : basePacks.neq("pub_verdict", "pending").gte("updated_at", cutoff);
  const { data: packs } = await filteredPacks
    .order("created_at", { ascending: false })
    .returns<PrePublishPackRow[]>();

  // Counts for the tab strip.
  const [{ count: pendingCount }, { count: decidedCount }] = await Promise.all([
    supabase
      .from("pre_publish_packs")
      .select("pack_ref", { count: "exact", head: true })
      .eq("pub_verdict", "pending"),
    supabase
      .from("pre_publish_packs")
      .select("pack_ref", { count: "exact", head: true })
      .neq("pub_verdict", "pending"),
  ]);

  // Resolve articles for each pack in one query.
  const packRows = packs ?? [];
  const articleIds = new Set<string>();
  for (const p of packRows) {
    if (p.article_1_id) articleIds.add(p.article_1_id);
    if (p.article_2_id) articleIds.add(p.article_2_id);
    if (p.article_3_id) articleIds.add(p.article_3_id);
  }
  const idList = Array.from(articleIds);

  const [articlesRes, ppRes] = await Promise.all([
    idList.length === 0
      ? Promise.resolve({ data: [] as ArticleLite[] })
      : supabase
          .from("articles")
          .select("id, headline, standfirst, state")
          .in("id", idList)
          .returns<ArticleLite[]>(),
    idList.length === 0
      ? Promise.resolve({ data: [] as ArticlePrePublishRow[] })
      : supabase
          .from("article_pre_publish")
          .select("*")
          .in("article_id", idList)
          .returns<ArticlePrePublishRow[]>(),
  ]);

  const articleMap = new Map<string, ArticleLite>(
    (articlesRes.data ?? []).map((a) => [a.id, a]),
  );
  const ppMap = new Map<string, ArticlePrePublishRow>(
    (ppRes.data ?? []).map((p) => [p.article_id, p]),
  );

  const packsWithItems: PackWithItems[] = packRows.map((pack) => {
    const slotIds = [pack.article_1_id, pack.article_2_id, pack.article_3_id];
    const articles: PackWithItems["articles"] = [];
    for (const aid of slotIds) {
      if (!aid) continue;
      const a = articleMap.get(aid);
      if (!a) continue;
      articles.push({ article: a, pp: ppMap.get(aid) ?? null });
    }
    return { pack, articles };
  });

  return (
    <div className="flex h-full flex-col">
      {/* Sub-topbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-2 text-[12px]">
        <Link
          href="/approvals"
          className="flex items-center gap-1 text-fg-2 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Approvals
        </Link>
        <span className="text-border-mid">/</span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Pre-Publish [PUB]
        </span>
        <span className="ml-auto text-[11px] text-um-muted">
          Role: <span className="font-medium text-fg-2">{role}</span>
          {canStamp ? null : (
            <span className="ml-2 rounded-md border border-warn/35 bg-warn/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-warn">
              Read-only — Senior Editor stamps verdicts
            </span>
          )}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 border-b border-border bg-card px-4">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          const count = t.key === "pending" ? pendingCount ?? 0 : decidedCount ?? 0;
          return (
            <Link
              key={t.key}
              href={`/approvals/pre-publish?tab=${t.key}`}
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
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
          {packsWithItems.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            packsWithItems.map((pk) => (
              <PackCard
                key={pk.pack.pack_ref}
                pack={pk.pack}
                articles={pk.articles}
                canStamp={canStamp}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <Package className="mb-3 h-7 w-7 text-um-muted/70" />
      <h2 className="text-[13px] font-semibold text-foreground">
        {tab === "pending"
          ? "No packs awaiting Senior Editor"
          : "No recent decisions"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-[1.5] text-um-muted">
        {tab === "pending"
          ? "Packs land here when F9 stamps HAND TO SENIOR EDITOR. Hard cap of three articles per pack."
          : "Decisions stamped in the last 14 days will appear here."}
      </p>
    </div>
  );
}

function PackCard({
  pack,
  articles,
  canStamp,
}: {
  pack: PrePublishPackRow;
  articles: PackWithItems["articles"];
  canStamp: boolean;
}) {
  const pubLabel = PUB_VERDICTS.find((v) => v.value === pack.pub_verdict)?.label;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Package className="h-3.5 w-3.5 text-um-muted" />
        <h2 className="font-mono text-[12.5px] font-semibold tracking-[0.04em] text-foreground">
          {pack.pack_ref}
        </h2>
        <span className="font-mono text-[10.5px] text-fg-2">
          · {articles.length}/{PACK_HARD_CAP} articles
        </span>
        {pack.origin_sweep_id ? (
          <span className="font-mono text-[10.5px] text-um-muted">
            · sweep {pack.origin_sweep_id}
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em]",
            PUB_PILL[pack.pub_verdict],
          )}
        >
          [PUB] {pubLabel}
        </span>
        {pack.archive_path ? (
          <span className="block w-full text-[10.5px] font-mono text-um-muted">
            archive · {pack.archive_path}
          </span>
        ) : null}
      </header>

      <div className="divide-y divide-border">
        {articles.length === 0 ? (
          <p className="px-4 py-3 text-[11.5px] italic text-um-muted">
            No articles resolved for this pack ref.
          </p>
        ) : (
          articles.map((row) => (
            <ArticleSlot
              key={row.article.id}
              article={row.article}
              pp={row.pp}
              canStamp={canStamp}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ArticleSlot({
  article,
  pp,
  canStamp,
}: {
  article: ArticleLite;
  pp: ArticlePrePublishRow | null;
  canStamp: boolean;
}) {
  const summary = summarisePrePublish(pp);
  const hasStamp = pp && pp.pub_verdict !== "pending";

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/articles/${article.id}/pre-publish`}
            className="group block"
          >
            <h3 className="line-clamp-2 text-[13px] font-semibold leading-[1.3] text-foreground group-hover:text-primary">
              {article.headline}
            </h3>
          </Link>
          {article.standfirst ? (
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.45] text-fg-2">
              {article.standfirst}
            </p>
          ) : null}
        </div>
        <Link
          href={`/articles/${article.id}/pre-publish`}
          className="flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary"
        >
          <ExternalLink className="h-3 w-3" />
          Open F9 detail
        </Link>
      </div>

      {/* A-check chips */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {A_CHECK_CODES.map((code) => {
          const st = statusFromRow(pp, code);
          return <CheckChip key={code} code={code} status={st} />;
        })}
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-um-muted">
          {summary.ready ? (
            <span className="flex items-center gap-1 font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" />
              Ready
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-warn">
              <AlertTriangle className="h-3 w-3" />
              {summary.blockers.length} blocker
              {summary.blockers.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>

      {/* Inline [PUB] verdict stamp */}
      {canStamp && !hasStamp ? (
        <PubVerdictButtons
          articleId={article.id}
          initialNotes={pp?.pub_verdict_notes ?? ""}
        />
      ) : null}

      {hasStamp ? (
        <div className="mt-1 space-y-1 rounded-md border border-border bg-background/40 px-2.5 py-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.05em]",
                pp ? PUB_PILL[pp.pub_verdict] : "",
              )}
            >
              {PUB_VERDICTS.find((v) => v.value === pp?.pub_verdict)?.short}
            </span>
            {pp?.pub_verdict_at ? (
              <span className="font-mono text-[10.5px] text-um-muted">
                {new Date(pp.pub_verdict_at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>
          {pp?.pub_verdict_notes ? (
            <p className="text-[11.5px] leading-[1.5] text-foreground">
              {pp.pub_verdict_notes}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CheckChip({
  code,
  status,
}: {
  code: string;
  status: ACheckStatus;
}) {
  const tone =
    status === "pass"
      ? "border-success/45 bg-success/10 text-success"
      : status === "soft_fail"
        ? "border-warn/45 bg-warn/10 text-warn"
        : status === "fail"
          ? "border-destructive/45 bg-destructive/10 text-destructive"
          : status === "na"
            ? "border-border-mid bg-secondary text-fg-2"
            : "border-border bg-background text-um-muted";
  return (
    <span
      className={cn(
        "flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-semibold",
        tone,
      )}
      title={status}
    >
      {code}
    </span>
  );
}
