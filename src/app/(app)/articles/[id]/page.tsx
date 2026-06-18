import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Compass,
  Gavel,
  Globe2,
  Link2,
  Package,
  Pencil,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/utils";
import type { ArticleCorrectionRow } from "@/lib/spec/stage13-corrections";
import { CorrectionsPanel } from "@/components/forms/stage13-corrections-panel";
import {
  FeaturedImagePanel,
  type CandidateAttachment,
} from "@/components/forms/featured-image-panel";

export const dynamic = "force-dynamic";

type ArticleDetail = {
  id: string;
  slug: string | null;
  headline: string;
  standfirst: string | null;
  body: string | null;
  state: string;
  primary_frame: string | null;
  geo_tier: string | null;
  sectors: string[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  featured_image_credit: string | null;
};

function coerceAttachments(raw: unknown): CandidateAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: CandidateAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url =
      typeof o.url === "string"
        ? o.url
        : typeof (o as { publicUrl?: unknown }).publicUrl === "string"
          ? ((o as { publicUrl: string }).publicUrl)
          : null;
    if (!url) continue;
    const name =
      typeof o.name === "string"
        ? o.name
        : typeof (o as { Name?: unknown }).Name === "string"
          ? ((o as { Name: string }).Name)
          : typeof (o as { filename?: unknown }).filename === "string"
            ? ((o as { filename: string }).filename)
            : url.split("/").pop() ?? "attachment";
    const contentType =
      typeof o.content_type === "string"
        ? o.content_type
        : typeof (o as { contentType?: unknown }).contentType === "string"
          ? ((o as { contentType: string }).contentType)
          : typeof (o as { mime?: unknown }).mime === "string"
            ? ((o as { mime: string }).mime)
            : guessMimeFromUrl(url);
    const sizeRaw =
      typeof o.size === "number"
        ? o.size
        : typeof (o as { bytes?: unknown }).bytes === "number"
          ? ((o as { bytes: number }).bytes)
          : typeof o.size === "string"
            ? Number(o.size)
            : 0;
    out.push({
      name,
      url,
      content_type: contentType,
      size: Number.isFinite(sizeRaw) ? sizeRaw : 0,
    });
  }
  return out;
}

function guessMimeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}

const TIMELINE: { state: string; label: string }[] = [
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

function fmtDate(iso: string | null, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (!withTime) return date;
  const time = d.toLocaleTimeString("en-GB", { hour12: false }).slice(0, 5);
  return `${date} · ${time}`;
}

export default async function ArticleDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: article } = await supabase
    .from("articles")
    .select(
      "id, slug, headline, standfirst, body, state, primary_frame, geo_tier, sectors, created_at, updated_at, published_at, featured_image_url, featured_image_alt, featured_image_credit",
    )
    .eq("id", id)
    .maybeSingle();

  if (!article) notFound();
  const a: ArticleDetail = article;

  // Role for Stage 13 corrections gating.
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
  const isEditor =
    meRow?.role === "editor" || meRow?.role === "admin";
  const isSenior = meRow?.role === "editor" || meRow?.role === "admin";

  // Stage 13 — corrections register rows, newest sequence first.
  const admin = createServiceClient();
  const { data: correctionsRaw } = await admin
    .from("article_corrections")
    .select(
      "id, article_id, title_id, kind, status, description, source, public_notice, fields_changed, filed_by, filed_at, approved_by, approved_at, withdrawn_by, withdrawn_at, withdrawn_reason, sequence, updated_at",
    )
    .eq("article_id", id)
    .order("sequence", { ascending: false })
    .returns<ArticleCorrectionRow[]>();
  const corrections: ArticleCorrectionRow[] = correctionsRaw ?? [];

  // Featured image — pull candidate image + attachments via commission join.
  let candidateImageUrl: string | null = null;
  let candidateAttachments: CandidateAttachment[] = [];
  const { data: comm } = await supabase
    .from("commissions")
    .select("candidate_id")
    .eq("article_id", a.id)
    .maybeSingle<{ candidate_id: string | null }>();
  if (comm?.candidate_id) {
    const { data: cand } = await supabase
      .from("candidates")
      .select("image_url, attachments")
      .eq("id", comm.candidate_id)
      .maybeSingle<{
        image_url: string | null;
        attachments: unknown | null;
      }>();
    candidateImageUrl = cand?.image_url ?? null;
    candidateAttachments = coerceAttachments(cand?.attachments);
  }

  const currentIdx = TIMELINE.findIndex((s) => s.state === a.state);
  const isTerminal = a.state === "rejected" || a.state === "killed";

  return (
    <div className="flex h-full flex-col">
      {/* Sub-topbar with back link */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-2 text-[12px]">
        <Link
          href="/pipeline"
          className="flex items-center gap-1 text-fg-2 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Pipeline
        </Link>
        <span className="text-border-mid">/</span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          {shortId(a.id)}
        </span>
      </div>

      {/* Article header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-5">
        <div className="mb-3 flex items-start gap-4">
          <span className="flex-shrink-0 pt-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-um-muted">
            {shortId(a.id)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="mb-1 text-[19px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
              {a.headline}
            </h1>
            {a.standfirst ? (
              <p className="text-[13px] leading-[1.5] text-fg-2">{a.standfirst}</p>
            ) : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Link
              href={`/articles/${a.id}/research`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Compass className="h-3.5 w-3.5" />
              F2 Research
            </Link>
            <Link
              href={`/articles/${a.id}/interlinks`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Link2 className="h-3.5 w-3.5" />
              F4 Interlinks
            </Link>
            <Link
              href={`/articles/${a.id}/review`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Gavel className="h-3.5 w-3.5" />
              F6 Final Review
            </Link>
            <Link
              href={`/articles/${a.id}/pre-flight`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Package className="h-3.5 w-3.5" />
              F7 Pre-Flight
            </Link>
            <Link
              href={`/articles/${a.id}/publish`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Globe2 className="h-3.5 w-3.5" />
              F8 Publish
            </Link>
            <Link
              href={`/articles/${a.id}/edit`}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-fg-2 hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Open in editor
            </Link>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                PILL[a.state],
              )}
            >
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: `var(--s-${stateDotKey(a.state)})` }}
              />
              {STATE_LABEL[a.state] ?? a.state}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center text-[12px]">
          <Meta label="Section" val={a.sectors[0] ?? "—"} />
          <Meta label="Sectors" val={a.sectors.slice(1).join(" · ") || "—"} />
          <Meta label="Geo" val={a.geo_tier?.replace("_", " ") ?? "—"} mono />
          <Meta label="Frame" val={a.primary_frame ?? "—"} mono />
          <Meta label="Commissioned" val={fmtDate(a.created_at)} />
          <Meta label="Updated" val={fmtDate(a.updated_at, true)} />
          {a.published_at ? (
            <Meta label="Published" val={fmtDate(a.published_at, true)} />
          ) : null}
          {a.slug ? <Meta label="Slug" val={a.slug} mono /> : null}
        </div>
      </div>

      {/* Stage timeline */}
      {!isTerminal ? (
        <div className="flex-shrink-0 overflow-x-auto border-b border-border bg-background px-6 py-4">
          <div className="relative flex min-w-max items-start gap-0">
            {TIMELINE.map((s, i) => {
              const done = currentIdx > i;
              const current = currentIdx === i;
              return (
                <div
                  key={s.state}
                  className="relative flex min-w-[90px] flex-1 flex-col items-center"
                >
                  {/* Connector line */}
                  {i < TIMELINE.length - 1 ? (
                    <span
                      className={cn(
                        "absolute left-1/2 top-[5px] h-[2px] w-full",
                        done ? "bg-primary" : "bg-border",
                      )}
                    />
                  ) : null}
                  {/* Node */}
                  <span
                    className={cn(
                      "relative z-10 h-3 w-3 rounded-full border-2 transition-colors",
                      done && "border-primary bg-primary",
                      current && "border-primary bg-card ring-4 ring-primary/20",
                      !done && !current && "border-border bg-card",
                    )}
                  />
                  <span
                    className={cn(
                      "mt-2 whitespace-nowrap text-[10.5px] font-medium tracking-[0.01em]",
                      done && "text-fg-2",
                      current && "text-foreground",
                      !done && !current && "text-um-muted",
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Section title="Standfirst">
            {a.standfirst ? (
              <p className="text-[13.5px] leading-[1.55] text-foreground">{a.standfirst}</p>
            ) : (
              <p className="text-[12.5px] italic text-um-muted">No standfirst on file.</p>
            )}
          </Section>

          <Section title="Body">
            {a.body ? (
              <div className="space-y-3 text-[13.5px] leading-[1.6] text-foreground">
                {a.body.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] italic text-um-muted">
                Body copy not yet filed.
              </p>
            )}
          </Section>

          <Section title="Featured Image">
            <FeaturedImagePanel
              articleId={a.id}
              initialUrl={a.featured_image_url}
              initialAlt={a.featured_image_alt}
              initialCredit={a.featured_image_credit}
              candidateImageUrl={candidateImageUrl}
              candidateAttachments={candidateAttachments}
              readOnly={!isEditor || a.state === "live"}
            />
          </Section>

          {a.state === "live" || a.published_at || corrections.length > 0 ? (
            <Section title="Corrections register · Stage 13">
              <CorrectionsPanel
                articleId={a.id}
                rows={corrections}
                canEdit={isEditor}
                canSenior={isSenior}
              />
            </Section>
          ) : null}

          <Section title="Activity Log">
            <ul className="space-y-3">
              <LogItem
                tone="stage"
                text={
                  <>
                    Currently in stage{" "}
                    <strong className="font-semibold text-foreground">
                      {STATE_LABEL[a.state] ?? a.state}
                    </strong>
                  </>
                }
                time={fmtDate(a.updated_at, true)}
              />
              <LogItem
                tone="assign"
                text={<>Record created</>}
                time={fmtDate(a.created_at, true)}
              />
              {a.published_at ? (
                <LogItem
                  tone="upload"
                  text={<>Published</>}
                  time={fmtDate(a.published_at, true)}
                />
              ) : null}
            </ul>
          </Section>
        </div>

        {/* Right rail */}
        <aside className="hidden w-[280px] flex-shrink-0 border-l border-border bg-card px-5 py-5 lg:block">
          <SidebarSection title="Status">
            <dl className="space-y-2 text-[12px]">
              <dt className="text-um-muted">Current stage</dt>
              <dd className="font-medium text-foreground">
                {STATE_LABEL[a.state] ?? a.state}
              </dd>
              <dt className="pt-2 text-um-muted">Last update</dt>
              <dd className="font-mono text-[11.5px] tabular-nums text-fg-2">
                {fmtDate(a.updated_at, true)}
              </dd>
            </dl>
          </SidebarSection>

          <SidebarSection title="Editorial Memory">
            <p className="text-[11.5px] leading-[1.5] text-um-muted">
              Similar stories, house rules, and correction precedents will appear here
              once the semantic memory is wired up.
            </p>
          </SidebarSection>
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, val, mono }: { label: string; val: string; mono?: boolean }) {
  return (
    <div className="mr-4 flex items-center gap-1 border-r border-border pr-4 last:border-r-0 last:pr-0">
      <span className="text-um-muted">{label}</span>
      <span
        className={cn(
          "font-medium text-fg-2",
          mono && "font-mono text-[11.5px] uppercase tracking-[0.03em]",
        )}
      >
        {val}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function LogItem({
  tone,
  text,
  time,
}: {
  tone: "stage" | "assign" | "upload" | "note";
  text: React.ReactNode;
  time: string;
}) {
  const dot =
    tone === "stage"
      ? "bg-primary"
      : tone === "upload"
        ? "bg-success"
        : tone === "note"
          ? "bg-warn"
          : "bg-um-muted";
  return (
    <li className="flex items-start gap-3">
      <span className={cn("mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", dot)} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] leading-[1.45] text-fg-2">{text}</div>
        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-um-muted">
          {time}
        </div>
      </div>
    </li>
  );
}

function stateDotKey(state: string): string {
  if (state === "commissioned") return "comm";
  if (state === "subbed") return "sub";
  if (state === "scheduled") return "sched";
  return state;
}
