import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardEdit, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  assignCommission,
  setCommissionStatus,
} from "@/lib/actions/commissioning";
import { BriefEditor } from "@/components/forms/brief-editor";

export const dynamic = "force-dynamic";

type CommissionRow = {
  id: string;
  code: string;
  article_id: string;
  candidate_id: string | null;
  brief: string;
  assignee_id: string | null;
  deadline_at: string | null;
  status: "briefed" | "accepted" | "declined" | "in_progress" | "filed";
  commissioned_by: string | null;
  commissioned_at: string;
  updated_at: string;
  accepted_at: string | null;
  declined_reason: string | null;
};

type ArticleRow = {
  id: string;
  slug: string | null;
  headline: string;
  standfirst: string | null;
  state: string;
  sectors: string[];
  geo_tier: string | null;
  primary_frame: string | null;
};

type CandidateRow = {
  id: string;
  code: string;
  working_headline: string;
  primary_url: string | null;
  score: number | null;
};

const STATUS_PILL: Record<string, string> = {
  briefed: "border-state-comm/35 bg-state-comm/10 text-state-comm",
  accepted: "border-success/35 bg-success/10 text-success",
  in_progress: "border-warn/35 bg-warn/10 text-warn",
  declined: "border-destructive/35 bg-destructive/10 text-destructive",
  filed: "border-um-muted/35 bg-um-muted/10 text-um-muted",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })} · ${d
    .toLocaleTimeString("en-GB", { hour12: false })
    .slice(0, 5)}`;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function CommissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: commission } = await supabase
    .from("commissions")
    .select(
      "id, code, article_id, candidate_id, brief, assignee_id, deadline_at, status, commissioned_by, commissioned_at, updated_at, accepted_at, declined_reason",
    )
    .eq("id", id)
    .single();

  if (!commission) notFound();
  const c = commission as CommissionRow;

  const [artRes, profilesRes, candRes] = await Promise.all([
    supabase
      .from("articles")
      .select("id, slug, headline, standfirst, state, sectors, geo_tier, primary_frame")
      .eq("id", c.article_id)
      .single(),
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    c.candidate_id
      ? supabase
          .from("candidates")
          .select("id, code, working_headline, primary_url, score")
          .eq("id", c.candidate_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const article = artRes.data as ArticleRow | null;
  const profiles =
    (profilesRes.data as { id: string; full_name: string | null; role: string }[]) ?? [];
  const candidate = (candRes as { data: CandidateRow | null }).data;

  const assignee = c.assignee_id ? profiles.find((p) => p.id === c.assignee_id) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <Link
          href="/commissioning"
          className="flex items-center gap-1 text-[11.5px] text-um-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Queue
        </Link>
        <span className="text-um-muted">·</span>
        <ClipboardEdit className="h-4 w-4 text-primary" />
        <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
          {c.code}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize",
            STATUS_PILL[c.status],
          )}
        >
          {c.status.replace("_", " ")}
        </span>
        {article ? (
          <Link
            href={`/articles/${article.id}`}
            className="ml-auto text-[11.5px] font-medium text-primary hover:underline"
          >
            Open article dossier →
          </Link>
        ) : null}
      </div>

      {/* Body */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 xl:grid-cols-3">
        {/* Left two cols: article + brief editor */}
        <div className="flex flex-col gap-4 xl:col-span-2">
          {article ? (
            <Card title="Article">
              <h2 className="mb-1 text-[15px] font-semibold leading-snug text-foreground">
                {article.headline}
              </h2>
              {article.standfirst ? (
                <p className="mb-2 text-[12.5px] leading-[1.5] text-fg-2">
                  {article.standfirst}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono uppercase tracking-wider text-fg-2">
                  state: {article.state}
                </span>
                {article.geo_tier ? (
                  <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono uppercase tracking-wider text-fg-2">
                    {article.geo_tier.replace("_", " ")}
                  </span>
                ) : null}
                {article.primary_frame ? (
                  <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono uppercase tracking-wider text-fg-2">
                    {article.primary_frame.replace("_", " ")}
                  </span>
                ) : null}
                {article.sectors.length > 0 ? (
                  <span className="text-um-muted">{article.sectors.join(" · ")}</span>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card title="Brief & deadline">
            <BriefEditor
              commissionId={c.id}
              initialBrief={c.brief}
              initialDeadlineLocal={toLocalInput(c.deadline_at)}
              hasSourceCandidate={Boolean(c.candidate_id)}
            />
          </Card>

          {candidate ? (
            <Card
              title="Source candidate"
              link={{
                label: "View in inbox →",
                href: `/discovery/inbox?q=${encodeURIComponent(candidate.code)}`,
              }}
            >
              <div className="flex items-start gap-3 text-[12px]">
                <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                  {candidate.code}
                </span>
                <div className="flex-1">
                  <p className="text-fg-2">{candidate.working_headline}</p>
                  {candidate.primary_url ? (
                    <a
                      href={candidate.primary_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-mono text-[10.5px] text-primary hover:underline"
                    >
                      {candidate.primary_url}
                    </a>
                  ) : null}
                </div>
                {candidate.score !== null ? (
                  <span className="font-mono text-[11px] tabular-nums text-um-muted">
                    {Number(candidate.score).toFixed(2)}
                  </span>
                ) : null}
              </div>
            </Card>
          ) : null}

          {c.declined_reason ? (
            <Card title="Decline reason">
              <p className="text-[12px] leading-[1.5] text-destructive">{c.declined_reason}</p>
            </Card>
          ) : null}
        </div>

        {/* Right col: assignee + lifecycle + actions */}
        <div className="flex flex-col gap-4">
          <Card title="Assignee">
            <form action={assignCommission} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={c.id} />
              <select
                name="assignee_id"
                defaultValue={c.assignee_id ?? ""}
                className="h-8 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">— Unassigned —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.id.slice(0, 8)} ({p.role})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-7 self-end rounded-sm border border-border bg-background px-3 text-[11px] font-medium text-fg-2 hover:bg-secondary"
              >
                Update assignee
              </button>
            </form>
            {assignee ? (
              <div className="mt-3 border-t border-border pt-3 text-[11.5px]">
                <span className="text-um-muted">Currently: </span>
                <span className="text-foreground">{assignee.full_name ?? "—"}</span>
                <span className="ml-2 rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-2">
                  {assignee.role}
                </span>
              </div>
            ) : null}
          </Card>

          <Card title="Lifecycle">
            <Row k="Status" v={
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize",
                  STATUS_PILL[c.status],
                )}
              >
                {c.status.replace("_", " ")}
              </span>
            } />
            <Row k="Commissioned" v={fmtDateTime(c.commissioned_at)} />
            <Row k="Accepted" v={fmtDateTime(c.accepted_at)} />
            <Row k="Deadline" v={fmtDateTime(c.deadline_at)} />
            <Row k="Last updated" v={fmtDateTime(c.updated_at)} />
          </Card>

          <Card title="Actions">
            <div className="flex flex-wrap gap-2">
              {c.status === "briefed" ? (
                <>
                  <StatusBtn id={c.id} target="accepted" label="Mark accepted" tone="success" />
                  <StatusBtn id={c.id} target="declined" label="Mark declined" tone="danger" />
                </>
              ) : null}
              {c.status === "accepted" ? (
                <StatusBtn id={c.id} target="in_progress" label="Mark in progress" tone="warn" />
              ) : null}
              {(c.status === "accepted" || c.status === "in_progress") ? (
                <StatusBtn id={c.id} target="filed" label="Mark filed" tone="muted" />
              ) : null}
              {c.status === "declined" ? (
                <StatusBtn id={c.id} target="briefed" label="Re-brief" tone="comm" />
              ) : null}
              {c.status === "filed" ? (
                <span className="text-[11.5px] italic text-um-muted">
                  Commission closed. Article in pipeline.
                </span>
              ) : null}
            </div>
          </Card>
        </div>
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
  tone: "success" | "warn" | "danger" | "muted" | "comm";
}) {
  const cls =
    tone === "success"
      ? "border-success/40 bg-success/10 text-success hover:bg-success/15"
      : tone === "warn"
        ? "border-warn/40 bg-warn/10 text-warn hover:bg-warn/15"
        : tone === "danger"
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
          : tone === "comm"
            ? "border-state-comm/40 bg-state-comm/10 text-state-comm hover:bg-state-comm/15"
            : "border-border bg-background text-fg-2 hover:bg-secondary";
  return (
    <form action={setCommissionStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={target} />
      <button
        type="submit"
        className={cn(
          "h-7 rounded-sm border px-3 text-[11.5px] font-medium transition-colors",
          cls,
        )}
      >
        {label}
      </button>
    </form>
  );
}

function Card({
  title,
  link,
  children,
}: {
  title: string;
  link?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-3 py-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-um-muted">
          {title}
        </span>
        {link ? (
          <Link
            href={link.href}
            className="text-[10.5px] font-medium text-primary hover:underline"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2 text-[11.5px] last:border-b-0">
      <span className="w-28 flex-shrink-0 text-um-muted">{k}</span>
      <span className="flex-1 text-fg-2">{v}</span>
    </div>
  );
}
