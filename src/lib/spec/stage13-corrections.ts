/**
 * Stage 13 — Corrections Register spec types and helpers.
 *
 * Post-publish, every fix, clarification, update, or retraction is filed
 * as a structured correction row. No silent edits — see Reasonable Steps
 * Doctrine. The reader-facing surface (WP push, archive, public site)
 * appends the public_notice text under the byline.
 */

export const CORRECTION_KINDS = [
  {
    value: "correction" as const,
    label: "Correction",
    short: "FIX",
    tone: "destructive" as const,
    description: "Factual error in the originally published article.",
  },
  {
    value: "clarification" as const,
    label: "Clarification",
    short: "CLAR",
    tone: "warn" as const,
    description: "Wording was ambiguous or could mislead; no factual change.",
  },
  {
    value: "update" as const,
    label: "Update",
    short: "UPD",
    tone: "muted" as const,
    description: "Post-publication development — new info, follow-on event.",
  },
  {
    value: "retraction" as const,
    label: "Retraction",
    short: "RTRX",
    tone: "destructive" as const,
    description: "Article withdrawn in full. The most severe form.",
  },
];

export type CorrectionKind = (typeof CORRECTION_KINDS)[number]["value"];

export const CORRECTION_STATUSES = [
  {
    value: "draft" as const,
    label: "Awaiting Senior",
    short: "DRAFT",
    tone: "warn" as const,
  },
  {
    value: "approved" as const,
    label: "Approved (live)",
    short: "LIVE",
    tone: "success" as const,
  },
  {
    value: "withdrawn" as const,
    label: "Withdrawn",
    short: "WDRN",
    tone: "muted" as const,
  },
];

export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number]["value"];

export type ArticleCorrectionRow = {
  id: string;
  article_id: string;
  title_id: string;
  kind: CorrectionKind;
  status: CorrectionStatus;
  description: string;
  source: string | null;
  public_notice: string;
  fields_changed: Record<string, { before?: string; after?: string }>;
  filed_by: string | null;
  filed_at: string;
  approved_by: string | null;
  approved_at: string | null;
  withdrawn_by: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  sequence: number;
  updated_at: string;
};

/**
 * Default public-notice text per kind. The editor can override.
 */
export function defaultPublicNotice(kind: CorrectionKind): string {
  switch (kind) {
    case "correction":
      return "An earlier version of this article contained a factual error. The piece has since been corrected. Details below.";
    case "clarification":
      return "This article has been clarified to remove ambiguity. The original meaning is unchanged.";
    case "update":
      return "This article was updated after publication with new information. See the timestamped note below.";
    case "retraction":
      return "This article has been retracted in full. The original content is preserved in our archive for accountability.";
  }
}

/**
 * Render an approved correction as the markdown block that gets appended
 * to the article body when it next pushes to WordPress.
 */
export function renderCorrectionMarkdown(
  c: ArticleCorrectionRow,
): string {
  const date = new Date(c.approved_at ?? c.filed_at).toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  const heading =
    c.kind === "retraction"
      ? `> **Retraction · ${date}**`
      : c.kind === "update"
        ? `> **Update #${c.sequence} · ${date}**`
        : c.kind === "clarification"
          ? `> **Clarification #${c.sequence} · ${date}**`
          : `> **Correction #${c.sequence} · ${date}**`;
  const lines = [heading, ">", `> ${c.public_notice}`];
  if (c.source) {
    lines.push(">", `> _Source: ${c.source}_`);
  }
  return lines.join("\n");
}

/**
 * Apply the approved correction trail to an article body for reader-facing
 * surfaces (WordPress republish, archive renderer, public site preview).
 *
 * The original body is left untouched at the top. Approved corrections are
 * appended in `sequence` order under an "Editor's notes" divider so the
 * reader sees the running record of fixes without losing what was first
 * published.
 *
 * Withdrawn and draft corrections are filtered out by the caller before
 * passing the array here.
 */
export function applyApprovedCorrections(
  originalBody: string,
  approvedCorrections: ArticleCorrectionRow[],
): string {
  if (approvedCorrections.length === 0) return originalBody;
  const sorted = [...approvedCorrections].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const blocks = sorted.map(renderCorrectionMarkdown).join("\n\n");
  const divider = "\n\n---\n\n## Editor's notes\n\n";
  return `${originalBody}${divider}${blocks}`;
}

/**
 * True if the approved correction set includes a retraction. Used by
 * republish to decide whether the WP post should be flipped to draft.
 */
export function hasApprovedRetraction(rows: ArticleCorrectionRow[]): boolean {
  return rows.some(
    (r) => r.kind === "retraction" && r.status === "approved",
  );
}

/**
 * Aggregate summary used by the corrections index dashboard.
 */
export type CorrectionsSummary = {
  total: number;
  draft: number;
  approved: number;
  withdrawn: number;
  retractions: number;
};

export function summariseCorrections(
  rows: ArticleCorrectionRow[],
): CorrectionsSummary {
  let draft = 0;
  let approved = 0;
  let withdrawn = 0;
  let retractions = 0;
  for (const r of rows) {
    if (r.status === "draft") draft += 1;
    else if (r.status === "approved") approved += 1;
    else if (r.status === "withdrawn") withdrawn += 1;
    if (r.kind === "retraction" && r.status === "approved") retractions += 1;
  }
  return { total: rows.length, draft, approved, withdrawn, retractions };
}
