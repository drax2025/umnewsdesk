import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Link2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { F4AddForm } from "@/components/forms/f4-add-form";
import { F4LinkRow } from "@/components/forms/f4-link-row";
import { F4VerdictPanel } from "@/components/forms/f4-verdict-panel";
import type {
  ArticleInterlinkRow,
  ArticleInterlinkerRow,
} from "@/lib/spec/f4-interlinks";

export const dynamic = "force-dynamic";

/**
 * F4 Interlinker screen — /articles/[id]/interlinks.
 *
 * Layout:
 *
 *   Sub-topbar  · back to dossier
 *   Header      · F4 label, headline, link to F2 / editor
 *   Verdict     · roll-up + 3 verdict buttons (with C7 blockers list)
 *   Internal    · placed (top), candidates, rejected
 *   Outbound    · same split
 *   Add form    · bottom — surface a new candidate
 *
 * The page reads article_interlinks once and partitions client-side.
 */

type ArticleRow = {
  id: string;
  headline: string;
  standfirst: string | null;
  state: string;
  body: string | null;
};

export default async function F4InterlinksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("id, headline, standfirst, state, body")
    .eq("id", id)
    .maybeSingle<ArticleRow>();
  if (!article) notFound();

  const [{ data: links }, { data: record }] = await Promise.all([
    supabase
      .from("article_interlinks")
      .select(
        "id, article_id, kind, target_url, target_article_id, target_title, target_published_at, anchor_text, placement_paragraph, order_idx, resolution_status, http_status, resolution_checked_at, is_banned_domain, b4_q1_useful_context, b4_q2_topically_related, b4_q3_anchor_descriptive, decision, decision_reason, notes, created_at",
      )
      .eq("article_id", id)
      .order("decision", { ascending: true })
      .order("placement_paragraph", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .returns<ArticleInterlinkRow[]>(),
    supabase
      .from("article_interlinker")
      .select(
        "article_id, verdict, verdict_at, verdict_rationale, updated_at",
      )
      .eq("article_id", id)
      .maybeSingle<ArticleInterlinkerRow>(),
  ]);

  const rows = links ?? [];
  const internalPlaced = rows.filter(
    (r) => r.kind === "internal" && r.decision === "placed",
  );
  const internalCandidates = rows.filter(
    (r) => r.kind === "internal" && r.decision === "candidate",
  );
  const internalRejected = rows.filter(
    (r) => r.kind === "internal" && r.decision === "rejected",
  );
  const outboundPlaced = rows.filter(
    (r) => r.kind === "outbound" && r.decision === "placed",
  );
  const outboundCandidates = rows.filter(
    (r) => r.kind === "outbound" && r.decision === "candidate",
  );
  const outboundRejected = rows.filter(
    (r) => r.kind === "outbound" && r.decision === "rejected",
  );

  const paragraphCount = countParagraphs(article.body);

  return (
    <div className="flex h-full flex-col">
      {/* Sub-topbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-2 text-[12px]">
        <Link
          href={`/articles/${article.id}`}
          className="flex items-center gap-1 text-fg-2 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Article dossier
        </Link>
        <span className="text-border-mid">/</span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          F4 Interlinker
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-3">
          <Link2 className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
              F4 Interlinker · B4 reader-first · C7 link integrity
            </div>
            <h1 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
              {article.headline}
            </h1>
            {article.standfirst ? (
              <p className="mt-1 text-[12.5px] leading-[1.5] text-fg-2">
                {article.standfirst}
              </p>
            ) : null}
            <p className="mt-1 font-mono text-[10.5px] text-um-muted">
              body has {paragraphCount} paragraph{paragraphCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Link
              href={`/articles/${article.id}/research`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <FileText className="h-3.5 w-3.5" />
              F2 Research
            </Link>
            <Link
              href={`/articles/${article.id}/edit`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Open in editor
            </Link>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
        <div className="mx-auto flex max-w-[960px] flex-col gap-3">
          {/* Verdict at top — sticky-feeling */}
          <F4VerdictPanel
            articleId={article.id}
            rows={rows}
            record={record ?? null}
          />

          {/* Internal */}
          <SectionHeader
            label="Internal links"
            hint="Max 3 — zero is valid. All three B4 questions must be YES to place."
            count={internalPlaced.length}
          />
          {internalPlaced.length === 0 &&
          internalCandidates.length === 0 &&
          internalRejected.length === 0 ? (
            <EmptyHint text="No internal candidates yet. Per B4, zero internal links is a valid outcome — only add a candidate if it genuinely serves the reader." />
          ) : null}
          {internalPlaced.map((r) => (
            <F4LinkRow key={r.id} articleId={article.id} row={r} />
          ))}
          {internalCandidates.length > 0 ? (
            <SubHeader label="Candidates" />
          ) : null}
          {internalCandidates.map((r) => (
            <F4LinkRow key={r.id} articleId={article.id} row={r} />
          ))}
          {internalRejected.length > 0 ? (
            <SubHeader label="Rejected" muted />
          ) : null}
          {internalRejected.map((r) => (
            <F4LinkRow key={r.id} articleId={article.id} row={r} />
          ))}

          {/* Outbound */}
          <SectionHeader
            label="Outbound links"
            hint="Range 3–5. Official institutional URLs only. Never digit.fyi / futurescot.com / scottishfinancialnews.com (C7)."
            count={outboundPlaced.length}
          />
          {outboundPlaced.length === 0 &&
          outboundCandidates.length === 0 &&
          outboundRejected.length === 0 ? (
            <EmptyHint text="No outbound candidates yet. F4 step 3 expects 3–5 named institutions / funders / regulators / primary sources." />
          ) : null}
          {outboundPlaced.map((r) => (
            <F4LinkRow key={r.id} articleId={article.id} row={r} />
          ))}
          {outboundCandidates.length > 0 ? (
            <SubHeader label="Candidates" />
          ) : null}
          {outboundCandidates.map((r) => (
            <F4LinkRow key={r.id} articleId={article.id} row={r} />
          ))}
          {outboundRejected.length > 0 ? (
            <SubHeader label="Rejected" muted />
          ) : null}
          {outboundRejected.map((r) => (
            <F4LinkRow key={r.id} articleId={article.id} row={r} />
          ))}

          {/* Add form at bottom */}
          <F4AddForm articleId={article.id} />
        </div>
      </div>
    </div>
  );
}

function countParagraphs(body: string | null): number {
  if (!body) return 0;
  return body.split(/\n\n+/).filter((p) => p.trim().length > 0).length;
}

function SectionHeader({
  label,
  hint,
  count,
}: {
  label: string;
  hint: string;
  count: number;
}) {
  return (
    <div className="mt-2 flex items-baseline gap-2 px-1">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
        {label}
      </h2>
      <span className="font-mono text-[10.5px] text-fg-2">· {count} placed</span>
      <span className="text-[10.5px] text-um-muted">· {hint}</span>
    </div>
  );
}

function SubHeader({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div className="mt-1 px-1">
      <span
        className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${muted ? "text-um-muted/70" : "text-um-muted"}`}
      >
        {label}
      </span>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-2.5 text-[11.5px] leading-[1.5] text-um-muted">
      {text}
    </p>
  );
}
