"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  ShieldX,
  ThumbsUp,
} from "lucide-react";
import {
  assemblePack,
  setPubVerdict,
  type PreFlightActionResult,
} from "@/lib/actions/pre-flight";
import { renderPack, type RenderPackResult } from "@/lib/actions/pack-render";
import {
  PACK_HARD_CAP,
  PUB_VERDICTS,
  type ArticlePreFlightRow,
  type PreFlightPackRow,
  type PubVerdict,
} from "@/lib/spec/f7-pre-flight";
import { cn } from "@/lib/utils";

/**
 * F7 Pack panel.
 *
 *   - Top half: pack assembly. If the article has no pack_ref, expose two
 *     mint/join controls (origin sweep ID, optional existing pack ref).
 *   - Bottom half: Admin [PUB] APPROVE / MODIFY / REJECT stamp.
 *
 * The [PUB] section only renders for admin and only once the F7
 * verdict is HAND TO SENIOR EDITOR and a pack_ref is bound.
 */

const labelCls =
  "block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted";
const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";
const textareaCls =
  "min-h-[72px] w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] leading-[1.5] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none";

type Props = {
  articleId: string;
  row: ArticlePreFlightRow | null;
  pack: PreFlightPackRow | null;
  canStampPub: boolean;
};

export function F7PackPanel({ articleId, row, pack, canStampPub }: Props) {
  const f7Ready = row?.verdict === "hand_to_senior_editor";
  const hasPack = Boolean(row?.pack_ref);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-um-muted" />
          <h2 className="text-[12.5px] font-semibold text-foreground">
            Pre-Flight Pack
          </h2>
          {row?.pack_ref ? (
            <span className="font-mono text-[10.5px] text-fg-2">
              · {row.pack_ref}
            </span>
          ) : null}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {hasPack ? (
          <PackSummary row={row} pack={pack} />
        ) : (
          <AssembleForm
            articleId={articleId}
            disabled={!f7Ready}
            reason={
              f7Ready
                ? null
                : "F7 verdict must be HAND TO SENIOR EDITOR before the article can join a pack."
            }
          />
        )}

        {canStampPub && hasPack ? (
          <PubVerdictForm articleId={articleId} row={row} />
        ) : null}

        {!canStampPub && hasPack ? (
          <p className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-[11px] text-um-muted">
            Admin verdict is signed off in the [PUB] channel by a
            admin role.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AssembleForm({
  articleId,
  disabled,
  reason,
}: {
  articleId: string;
  disabled: boolean;
  reason: string | null;
}) {
  const [originSweep, setOriginSweep] = useState<string>("");
  const [existingRef, setExistingRef] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    setNotice(null);
    fd.set("article_id", articleId);
    fd.set("origin_sweep_id", originSweep);
    fd.set("pack_ref", existingRef);
    startTransition(async () => {
      const res: PreFlightActionResult = await assemblePack(fd);
      if (!res.ok) setError(res.error);
      else if ("pack_ref" in res) setNotice(`Pack ${res.pack_ref} assembled.`);
      else setNotice("Pack assembled.");
    });
  }

  return (
    <form action={submit} className="space-y-2.5">
      {reason ? (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
          {reason}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls} htmlFor="pf-sweep">
            Origin sweep ID
          </label>
          <input
            id="pf-sweep"
            type="text"
            value={originSweep}
            onChange={(e) => setOriginSweep(e.target.value)}
            placeholder="F-RR breadcrumb (one line)"
            className={cn(inputCls, "mt-1 font-mono")}
            disabled={disabled}
            maxLength={240}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="pf-ref">
            Join existing pack (optional)
          </label>
          <input
            id="pf-ref"
            type="text"
            value={existingRef}
            onChange={(e) => setExistingRef(e.target.value)}
            placeholder="PFP-YYYY-MM-DD-NNN"
            className={cn(inputCls, "mt-1 font-mono")}
            disabled={disabled}
            maxLength={64}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[10.5px] text-um-muted">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : notice ? (
            <span className="text-success">{notice}</span>
          ) : (
            <span>
              Leave the pack ref blank to mint a new pack. Hard cap is{" "}
              {PACK_HARD_CAP} articles per pack.
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={disabled || pending}
          className="h-7 rounded-md border border-primary/45 bg-primary/15 px-3 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
        >
          {pending ? "Assembling…" : "Assemble pack"}
        </button>
      </div>
    </form>
  );
}

function PackSummary({
  row,
  pack,
}: {
  row: ArticlePreFlightRow | null;
  pack: PreFlightPackRow | null;
}) {
  const ref = row?.pack_ref ?? null;
  const archive = row?.pack_archive_path ?? pack?.archive_path ?? null;
  const sweep = row?.origin_sweep_id ?? pack?.origin_sweep_id ?? null;
  const slotCount = pack
    ? [pack.article_1_id, pack.article_2_id, pack.article_3_id].filter(Boolean).length
    : 1;
  const posted = pack?.pub_channel_posted_at ?? null;
  const renderedAt = pack?.rendered_at ?? null;
  const signature = pack?.archive_signature ?? null;

  return (
    <div className="space-y-2 rounded-md border border-success/30 bg-success/5 px-3 py-2.5 text-[11.5px]">
      <div className="flex items-baseline gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {ref}
        </span>
        <span className="text-[10.5px] text-um-muted">
          · {slotCount}/{PACK_HARD_CAP} slots filled
        </span>
      </div>
      {archive ? (
        <p className="font-mono text-[10.5px] text-fg-2">archive: {archive}</p>
      ) : null}
      {sweep ? (
        <p className="font-mono text-[10.5px] text-fg-2">sweep: {sweep}</p>
      ) : null}
      {posted ? (
        <p className="text-[10.5px] text-um-muted">
          [PUB] posted{" "}
          {new Date(posted).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}

      {ref ? (
        <RenderPackControls
          packRef={ref}
          renderedAt={renderedAt}
          signature={signature}
        />
      ) : null}
    </div>
  );
}

function RenderPackControls({
  packRef,
  renderedAt,
  signature,
}: {
  packRef: string;
  renderedAt: string | null;
  signature: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function fire() {
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("pack_ref", packRef);
    startTransition(async () => {
      const res: RenderPackResult = await renderPack(fd);
      if (!res.ok) setError(res.error);
      else
        setNotice(
          `Rendered ${res.bytes.toLocaleString()} bytes · sig ${res.signature.slice(0, 10)}…`,
        );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-success/20 pt-2">
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className="flex h-7 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <FileText className="h-3 w-3" />
        )}
        {renderedAt ? "Re-render pack" : "Render pack"}
      </button>
      <a
        href={`/api/packs/${packRef}/markdown`}
        className="h-7 rounded-md border border-border bg-background px-2.5 text-[11px] leading-7 text-fg-2 hover:bg-secondary"
        target="_blank"
        rel="noreferrer"
      >
        Open markdown
      </a>
      <div className="ml-auto text-right font-mono text-[10px] text-um-muted">
        {renderedAt ? (
          <div>
            rendered{" "}
            {new Date(renderedAt).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        ) : (
          <div>not rendered yet</div>
        )}
        {signature ? <div>sig {signature.slice(0, 12)}…</div> : null}
      </div>
      {error ? (
        <div className="w-full rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="w-full rounded-sm border border-success/40 bg-success/10 px-2 py-1 text-[11px] text-success">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where each [PUB] verdict lands the editor next.
 *
 *   APPROVE → article is 'scheduled', pack auto-renders → next stop is F8
 *             Publish, where artefact sweep + publish log live.
 *   MODIFY  → article goes back through the agent loop; dossier is the
 *             jumping-off point because the editor picks which F-stage to
 *             return to based on the notes.
 *   REJECT  → article is dead — surfaces in the global reject queue.
 */
function pubDestination(
  verdict: PubVerdict,
  articleId: string,
): { href: string; label: string } | null {
  switch (verdict) {
    case "approve":
      return {
        href: `/articles/${articleId}/publish`,
        label: "F8 Publish",
      };
    case "modify":
      return { href: `/articles/${articleId}`, label: "article dossier" };
    case "reject":
      return { href: `/queues/reject`, label: "reject queue" };
    case "pending":
      return null;
  }
}

function PubVerdictForm({
  articleId,
  row,
}: {
  articleId: string;
  row: ArticlePreFlightRow | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<string>(row?.pub_verdict_notes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(verdict: PubVerdict) {
    setError(null);
    setNotice(null);
    if (!notes.trim()) {
      setError("Notes are required for the Admin stamp.");
      return;
    }
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("pub_verdict", verdict);
    fd.set("pub_verdict_notes", notes);
    startTransition(async () => {
      const res: PreFlightActionResult = await setPubVerdict(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Same UX contract as F6 / F7 verdict panels — don't leave the editor
      // staring at a stamped pill on a dead page. Route to the next stage.
      const dest = pubDestination(verdict, articleId);
      if (dest) {
        setNotice(`Admin verdict stamped — routing to ${dest.label}…`);
        router.push(dest.href);
      } else {
        setNotice("Admin verdict stamped.");
        router.refresh();
      }
    });
  }

  const current = row?.pub_verdict ?? "pending";

  return (
    <div className="space-y-2.5 border-t border-border pt-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Admin verdict — [PUB]
        </h3>
        <span className="font-mono text-[10.5px] text-fg-2">
          current:{" "}
          <span className="uppercase">
            {PUB_VERDICTS.find((v) => v.value === current)?.short}
          </span>
          {row?.pub_verdict_at ? (
            <span className="ml-1 text-um-muted">
              ·{" "}
              {new Date(row.pub_verdict_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </span>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="MODIFY: specific change requests. REJECT: reason. APPROVE: confirm pack ready to publish."
        className={textareaCls}
        maxLength={2400}
      />

      <div className="grid grid-cols-3 gap-1.5">
        <VerdictButton
          icon={ThumbsUp}
          label="APPROVE"
          hint="Pack publishes."
          tone="success"
          disabled={pending}
          onClick={() => submit("approve")}
        />
        <VerdictButton
          icon={Layers}
          label="MODIFY"
          hint="Specific change requests."
          tone="warn"
          disabled={pending}
          onClick={() => submit("modify")}
        />
        <VerdictButton
          icon={ShieldX}
          label="REJECT"
          hint="Article does not publish."
          tone="destructive"
          disabled={pending}
          onClick={() => submit("reject")}
        />
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {error}
        </div>
      ) : null}
      {notice && !error ? (
        <div className="rounded-md border border-success/35 bg-success/10 px-2.5 py-1.5 text-[11.5px] text-success">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function VerdictButton({
  icon: Icon,
  label,
  hint,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  tone: "success" | "warn" | "destructive";
  disabled?: boolean;
  onClick: () => void;
}) {
  const cls =
    tone === "success"
      ? "border-success/45 bg-success/10 text-success hover:bg-success/15"
      : tone === "warn"
        ? "border-warn/45 bg-warn/10 text-warn hover:bg-warn/15"
        : "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
        cls,
      )}
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.04em]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="text-[10px] text-um-muted">{hint}</span>
    </button>
  );
}
