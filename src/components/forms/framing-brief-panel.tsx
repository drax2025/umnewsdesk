import { Compass, MapPin, Tag, Target, BookOpen, AlertCircle } from "lucide-react";
import {
  GEOGRAPHIC_TIERS,
  type FramingBrief,
} from "@/lib/spec/f1-triage";
import { cn } from "@/lib/utils";

/**
 * Read-only display of the B9.2 framing brief that travels with the article
 * from F1 Triage → F2 Researcher → F3 Writer → F4 Interlinker → F5 Editor.
 *
 * The brief is authored upstream (F1) and refined at commissioning. On the
 * edit surface the Writer sees it but does not edit it — per spec it is set
 * before drafting. If F7 reframes the article the brief can be modified at
 * the Admin verdict step.
 *
 * Renders all five axes:
 *   - Geographic tier   (B9.1 axis 1)
 *   - Category tags     (B9.1 axis 2 — up to 3)
 *   - Primary frame     (B9.1 axis 3 — one of six B9 frames)
 *   - Scottish anchor   (named entity)
 *   - Per-story brief   (2-3 sentences telling the Writer what to lead with)
 */

type Source = "commission" | "candidate" | null;

export function FramingBriefPanel({
  brief,
  source,
}: {
  brief: FramingBrief | null;
  source: Source;
}) {
  const hasBrief =
    brief &&
    (brief.geographic_tier ||
      brief.primary_frame ||
      brief.scottish_anchor ||
      brief.per_story_brief ||
      (brief.category_tags && brief.category_tags.length > 0));

  const tierLabel =
    brief?.geographic_tier
      ? GEOGRAPHIC_TIERS.find((t) => t.value === brief.geographic_tier)?.label
      : null;
  const tierShort =
    brief?.geographic_tier
      ? GEOGRAPHIC_TIERS.find((t) => t.value === brief.geographic_tier)?.short
      : null;

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Compass className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          Framing brief
        </h2>
        <span className="ml-1 font-mono text-[10px] text-um-muted">
          B9.2
        </span>
        <span className="ml-auto rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
          read-only
        </span>
      </header>

      {!hasBrief ? (
        <EmptyBrief source={source} />
      ) : (
        <div className="divide-y divide-border">
          {/* Geographic tier */}
          <Row icon={MapPin} label="Geographic tier">
            {tierLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-fg-2">
                  {tierShort}
                </span>
                <span className="text-[12px] text-foreground">{tierLabel}</span>
              </span>
            ) : (
              <EmptyVal>not set</EmptyVal>
            )}
          </Row>

          {/* Category tags (up to 3) */}
          <Row icon={Tag} label="Category tags">
            {brief?.category_tags && brief.category_tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {brief.category_tags.map((t, i) => (
                  <span
                    key={t}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                      i === 0
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border-mid bg-secondary text-fg-2",
                    )}
                    title={
                      i === 0
                        ? "Primary tag"
                        : i === 1
                          ? "Secondary tag"
                          : "Tertiary tag"
                    }
                  >
                    {t}
                  </span>
                ))}
                <span className="font-mono text-[10px] text-um-muted">
                  · {brief.category_tags.length}/3
                </span>
              </div>
            ) : (
              <EmptyVal>not set</EmptyVal>
            )}
          </Row>

          {/* Primary frame */}
          <Row icon={Target} label="Primary frame">
            {brief?.primary_frame ? (
              <span className="text-[12px] text-foreground">
                {brief.primary_frame}
              </span>
            ) : (
              <EmptyVal>not set</EmptyVal>
            )}
          </Row>

          {/* Scottish anchor */}
          <Row icon={MapPin} label="Scottish anchor">
            {brief?.scottish_anchor ? (
              <span className="text-[12px] text-foreground">
                {brief.scottish_anchor}
              </span>
            ) : (
              <EmptyVal>not set</EmptyVal>
            )}
          </Row>

          {/* Per-story brief */}
          <Row icon={BookOpen} label="Per-story brief">
            {brief?.per_story_brief ? (
              <p className="whitespace-pre-line text-[12px] leading-[1.55] text-foreground">
                {brief.per_story_brief}
              </p>
            ) : (
              <EmptyVal>not set</EmptyVal>
            )}
          </Row>
        </div>
      )}

      <footer className="border-t border-border bg-background/40 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
        Travels with the article through F2 / F3 / F4 / F5. The Writer drafts
        to the per-story brief; F7 confirms or modifies at the verdict step.
        {source ? (
          <span className="ml-1">
            Source: <span className="font-mono">{source}</span>.
          </span>
        ) : null}
      </footer>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Compass;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 px-3 py-2">
      <div className="flex items-start gap-1.5 pt-0.5">
        <Icon className="mt-0.5 h-3 w-3 flex-shrink-0 text-um-muted" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-um-muted">
          {label}
        </span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function EmptyVal({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] italic text-um-muted">
      — {children}
    </span>
  );
}

function EmptyBrief({ source }: { source: Source }) {
  return (
    <div className="flex items-start gap-2 px-3 py-3">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warn" />
      <div className="text-[11.5px] leading-[1.5] text-fg-2">
        <p className="font-semibold text-foreground">No framing brief yet.</p>
        <p className="mt-0.5">
          {source === "commission"
            ? "The commission row has no framing brief attached. Set one when commissioning so the Writer has a brief to draft against."
            : "F1 Triage has not authored a framing brief. Without one the Writer is drafting in the dark — set it on the candidate or commission first."}
        </p>
      </div>
    </div>
  );
}
