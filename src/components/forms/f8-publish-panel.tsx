"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gavel,
  Loader2,
  Lock,
  Package,
  Radio,
  RotateCcw,
  Send,
} from "lucide-react";
import {
  PUBLISH_STATUS_LABEL,
  PUBLISH_STATUS_TONE,
  PUBLISH_TARGET_LABEL,
  latestPublishedLog,
  summariseSweep,
  type ArticleArtefactSweepRow,
  type ArticlePublishLogRow,
  type PublishTarget,
} from "@/lib/spec/f8-publish";
import {
  publishArticle,
  retractArticle,
} from "@/lib/actions/publish";
import { cn } from "@/lib/utils";

type Props = {
  articleId: string;
  articleState: string;
  defaultSlug: string | null;
  backdate: string | null;
  sweepRow: ArticleArtefactSweepRow | null;
  publishLog: ArticlePublishLogRow[];
  /**
   * Where the WP credentials F8 will use are coming from:
   *   - "title": filled in on this title's Section G row (per-title config).
   *              publishArticle reads these first.
   *   - "env":   only the legacy WORDPRESS_* env vars are set. Fine for the
   *              default title; nothing else.
   *   - "none":  neither — push will fail; editor must use Manual.
   */
  wordpressCredSource: "title" | "env" | "none";
  /** Display name of this article's title, for the banner. */
  titleName: string | null;
  readOnly?: boolean;
};

export function PublishPanel({
  articleId,
  articleState,
  defaultSlug,
  backdate,
  sweepRow,
  publishLog,
  wordpressCredSource,
  titleName,
  readOnly = false,
}: Props) {
  const wordpressConfigured = wordpressCredSource !== "none";
  const summary = summariseSweep(sweepRow);
  const lastPublished = latestPublishedLog(publishLog);
  const isLive = articleState === "live";
  // 'wp_draft' = already pushed to WordPress as a draft. Still publishable —
  // a fresh "WordPress publish" push promotes it to live.
  const isWpDraft = articleState === "wp_draft";
  // Mirror the server guard in publishArticle: a push is allowed from
  // 'scheduled' (Editor [PUB] PASS done) or 'wp_draft' (promote draft → live).
  // 'legal' means it's handed for [PUB] but not yet PASSed.
  const isPublishable = articleState === "scheduled" || isWpDraft;
  const isTerminal =
    articleState === "rejected" || articleState === "killed";
  // 'legal' = awaiting the [PUB] PASS (F7 done, sign-off pending).
  const awaitingPubPass = articleState === "legal";

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <Radio className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Stage 2 · Publish push
        </h2>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          state · {articleState}
          {backdate ? ` · backdate ${backdate}` : null}
        </span>
      </header>

      {!summary.cleanForPush ? (
        <div className="border-b border-border bg-warn/5 px-3 py-2 text-[11px] text-warn">
          <AlertTriangle className="mr-1 inline-block h-3 w-3" />
          Final sweep not clean — push is disabled until every artefact is
          CLEAN or N/A-with-justification.
        </div>
      ) : null}

      {wordpressCredSource === "title" ? (
        <div className="border-b border-border bg-success/5 px-3 py-2 text-[10.5px] text-success">
          <CheckCircle2 className="mr-1 inline-block h-3 w-3" />
          WordPress configured via{" "}
          <span className="font-semibold">{titleName ?? "this title"}</span>{" "}
          (per-title Section G credentials).
        </div>
      ) : wordpressCredSource === "env" ? (
        <div className="border-b border-border bg-warn/5 px-3 py-2 text-[10.5px] text-warn">
          <AlertTriangle className="mr-1 inline-block h-3 w-3" />
          Falling back to legacy WORDPRESS_* env vars — this title has no
          per-title WP credentials in Section G. Fine for a single-title
          deployment, but set wp_base_url / wp_username / wp_app_password in
          /system/titles before adding more titles.
        </div>
      ) : (
        <div className="border-b border-border bg-warn/5 px-3 py-2 text-[10.5px] text-warn">
          <AlertTriangle className="mr-1 inline-block h-3 w-3" />
          No WordPress credentials available — neither this title&apos;s
          Section G row nor the WORDPRESS_* env vars are set. WP push will
          fail; use Manual to record an external URL, or fill in credentials
          at /system/titles.
        </div>
      )}

      {isWpDraft ? (
        <div className="border-b border-border bg-primary/5 px-3 py-2 text-[11px] text-primary">
          <CheckCircle2 className="mr-1 inline-block h-3 w-3" />
          Pushed to WordPress as a <span className="font-semibold">draft</span> —
          not publicly live yet. Run a <span className="font-semibold">WordPress
          publish</span> below to promote it to live, or publish it from the WP
          dashboard.
        </div>
      ) : null}

      {isLive && lastPublished ? (
        <LivePanel
          articleId={articleId}
          log={lastPublished}
          readOnly={readOnly}
        />
      ) : isPublishable ? (
        <PushForm
          articleId={articleId}
          defaultSlug={defaultSlug}
          backdate={backdate}
          canPush={summary.cleanForPush && !readOnly}
          wordpressConfigured={wordpressConfigured}
        />
      ) : (
        <NotReadyNotice
          articleId={articleId}
          state={articleState}
          isTerminal={isTerminal}
          awaitingPubPass={awaitingPubPass}
        />
      )}

      <PublishHistory rows={publishLog} />
    </section>
  );
}

function PushForm({
  articleId,
  defaultSlug,
  backdate,
  canPush,
  wordpressConfigured,
}: {
  articleId: string;
  defaultSlug: string | null;
  backdate: string | null;
  canPush: boolean;
  wordpressConfigured: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<PublishTarget>(
    wordpressConfigured ? "wordpress" : "manual",
  );
  const [slug, setSlug] = useState(defaultSlug ?? "");
  const [manualUrl, setManualUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function push() {
    setError(null);
    setSuccess(null);
    if (!canPush) return;
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("target", target);
    fd.set("slug", slug);
    if (target === "manual") fd.set("manual_url", manualUrl);

    startTransition(async () => {
      const res = await publishArticle(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if ("external_url" in res && res.external_url) {
        setSuccess(res.external_url);
      } else {
        setSuccess("Push recorded.");
      }
      // A live publish flips article state to 'live' server-side. Refresh so
      // the header state pill and the Live panel update without a manual
      // reload (WP Draft stays 'scheduled' by design — refresh is harmless).
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { value: "wordpress", label: "WordPress publish" },
            { value: "draft_only", label: "WP Draft" },
            { value: "manual", label: "Manual URL" },
          ] as { value: PublishTarget; label: string }[]
        ).map((opt) => {
          const active = target === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTarget(opt.value)}
              disabled={pending}
              className={cn(
                "h-7 rounded-md border px-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors disabled:opacity-50",
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-fg-2 hover:bg-secondary",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {target !== "manual" ? (
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
            Slug (WP post_name)
          </span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={pending}
            maxLength={200}
            placeholder="auto from article slug"
            className="h-8 rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground placeholder:text-um-muted disabled:opacity-60"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
            Live URL (required for manual)
          </span>
          <input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            disabled={pending}
            maxLength={600}
            placeholder="https://unionmedia.scot/2026/06/…"
            className="h-8 rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground placeholder:text-um-muted disabled:opacity-60"
          />
        </label>
      )}

      {backdate ? (
        <p className="text-[10.5px] text-um-muted">
          post_date will be set to <span className="font-mono">{backdate}</span>{" "}
          07:00 UTC (article backdate).
        </p>
      ) : (
        <p className="text-[10.5px] text-um-muted">
          No backdate set — post_date defaults to publish time (now).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={push}
          disabled={pending || !canPush}
          className="flex h-8 items-center gap-1.5 rounded-md border border-success/50 bg-success/10 px-3 text-[12px] font-semibold text-success hover:bg-success/15 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {target === "manual"
            ? "Record manual publish"
            : target === "draft_only"
              ? "Push as WP draft"
              : "Publish to WordPress"}
        </button>
        {success ? (
          <span className="flex items-center gap-1 text-[11px] text-success">
            {success.startsWith("http") ? (
              <a
                href={success}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 underline"
              >
                {success}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              success
            )}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Shown when the article hasn't reached the publishable 'scheduled' state.
 * Replaces the push form so the senior editor never clicks a dead button — the
 * publishArticle server guard would reject it anyway.
 *
 *   - awaitingPubPass ('legal'): F6 + F7 checks are done; the only thing left
 *     is the Editor [PUB] PASS on the F7 pack, which flips it to
 *     'scheduled'. This is the common "ready but blocked" case.
 *   - otherwise: still upstream of F7 — needs F6 Final Review then F7.
 */
function NotReadyNotice({
  articleId,
  state,
  isTerminal,
  awaitingPubPass,
}: {
  articleId: string;
  state: string;
  isTerminal: boolean;
  awaitingPubPass: boolean;
}) {
  if (isTerminal) {
    return (
      <div className="flex items-start gap-2 border-b border-border bg-um-muted/5 px-3 py-3 text-[11.5px] text-fg-2">
        <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-um-muted" />
        <p>
          This article is{" "}
          <span className="font-semibold text-foreground">{state}</span> and
          cannot be published. Reopen it from the pipeline if this was in error.
        </p>
      </div>
    );
  }

  if (awaitingPubPass) {
    return (
      <div className="space-y-3 border-b border-border bg-warn/5 px-3 py-3">
        <div className="flex items-start gap-2 text-[11.5px] text-warn">
          <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p className="leading-[1.5]">
            Awaiting the Editor{" "}
            <span className="font-semibold">[PUB] PASS</span>. F6 and F7 checks
            are done — the B2 sweep above can be clean, but publishing stays
            locked until an Editor stamps the{" "}
            <span className="font-semibold">APPROVE</span> verdict on the F7
            Pre-Flight pack. That flips the article to{" "}
            <span className="font-mono">scheduled</span> and unlocks the push.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/articles/${articleId}/pre-flight`}
            className="flex h-7 items-center gap-1.5 rounded-md border border-primary/45 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15"
          >
            <Package className="h-3.5 w-3.5" />
            Stamp [PUB] PASS on F7
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-b border-border bg-warn/5 px-3 py-3">
      <div className="flex items-start gap-2 text-[11.5px] text-warn">
        <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p className="leading-[1.5]">
          Not ready to publish — the article is in{" "}
          <span className="font-mono font-semibold">{state}</span>. Publishing
          unlocks after{" "}
          <span className="font-semibold">F6 Final Review</span>, then the{" "}
          <span className="font-semibold">F7 Pre-Flight Check</span> and the
          Editor [PUB] PASS (→{" "}
          <span className="font-mono">scheduled</span>).
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/articles/${articleId}/review`}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary"
        >
          <Gavel className="h-3.5 w-3.5" />
          Go to F6 Final Review
        </Link>
        <Link
          href={`/articles/${articleId}/pre-flight`}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary"
        >
          <Package className="h-3.5 w-3.5" />
          Go to F7 Pre-Flight Check
        </Link>
      </div>
    </div>
  );
}

function LivePanel({
  articleId,
  log,
  readOnly,
}: {
  articleId: string;
  log: ArticlePublishLogRow;
  readOnly: boolean;
}) {
  const [retracting, setRetracting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retract() {
    setError(null);
    if (!reason.trim()) {
      setError("Reason required.");
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("publish_log_id", log.id);
    fd.set("reason", reason);
    startTransition(async () => {
      const res = await retractArticle(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRetracting(false);
      setReason("");
    });
  }

  return (
    <div className="space-y-3 border-b border-border bg-success/5 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-success">
          live
        </span>
        <span className="text-fg-2">via {PUBLISH_TARGET_LABEL[log.target]}</span>
        {log.external_url ? (
          <a
            href={log.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 underline"
          >
            {log.external_url}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      {!readOnly ? (
        retracting ? (
          <div className="space-y-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
                Retract reason (auto-routes to pack §0)
              </span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
                maxLength={2400}
                placeholder="Why is this being retracted?"
                className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] text-foreground placeholder:text-um-muted disabled:opacity-60"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={retract}
                disabled={pending}
                className="flex h-7 items-center gap-1 rounded-sm border border-destructive/45 bg-destructive/10 px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/15 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Confirm retract
              </button>
              <button
                type="button"
                onClick={() => {
                  setRetracting(false);
                  setReason("");
                  setError(null);
                }}
                disabled={pending}
                className="h-7 rounded-sm border border-border bg-background px-2.5 text-[11px] text-fg-2 hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {error ? (
              <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRetracting(true)}
            className="flex h-7 items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-2.5 text-[11px] font-medium text-warn hover:bg-warn/15"
          >
            <RotateCcw className="h-3 w-3" />
            Retract
          </button>
        )
      ) : null}
    </div>
  );
}

function PublishHistory({ rows }: { rows: ArticlePublishLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-2 text-[10.5px] text-um-muted">
        No publish attempts yet.
      </div>
    );
  }
  return (
    <div className="border-t border-border bg-background/30">
      <div className="px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-2">
        Publish history · {rows.length}
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const tone = PUBLISH_STATUS_TONE[r.status];
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline gap-2 px-3 py-2 text-[11px]"
            >
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em]",
                  tone === "success" &&
                    "border-success/40 bg-success/10 text-success",
                  tone === "destructive" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  tone === "warn" && "border-warn/40 bg-warn/10 text-warn",
                  tone === "info" &&
                    "border-primary/40 bg-primary/10 text-primary",
                  tone === "muted" && "border-border bg-background text-fg-2",
                )}
              >
                {PUBLISH_STATUS_LABEL[r.status]}
              </span>
              <span className="font-mono text-[10px] uppercase text-um-muted">
                {PUBLISH_TARGET_LABEL[r.target]}
              </span>
              <span className="text-fg-2">
                {new Date(r.attempted_at).toLocaleString()}
              </span>
              {r.external_url ? (
                <a
                  href={r.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 truncate text-[11px] text-primary underline"
                >
                  {r.external_url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {r.error ? (
                <span className="ml-auto truncate text-[11px] text-destructive">
                  {r.error}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
