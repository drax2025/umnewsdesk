/**
 * F8 Post-Publish — spec types and the canonical 17-artefact prohibited-use
 * list referenced by the B2 standing rule.
 *
 * Three signal-only outlets are sequestered by the spec:
 *
 *   - DIGIT          (Scottish tech trade press)
 *   - Futurescot     (Scottish public-sector + tech trade press)
 *   - SFN            (Scottish Financial News — newsletter)
 *
 * They are SIGNAL ONLY. Union Media may use them to detect that a story
 * exists, but may not lift any of the 17 artefacts enumerated below. F8
 * does a final sweep at publish time to confirm no contamination slipped
 * past F9.
 */

/* -------------------------------------------------------------------------- */
/*  Artefact catalogue                                                        */
/* -------------------------------------------------------------------------- */

export type ArtefactOutlet = "digit" | "futurescot" | "sfn";

export type ArtefactCode =
  | "digit_headline_lift"
  | "digit_body_lift"
  | "digit_subhead_lift"
  | "digit_social_embed"
  | "digit_image_asset"
  | "digit_phrase_quote"
  | "futurescot_headline_lift"
  | "futurescot_body_lift"
  | "futurescot_subhead_lift"
  | "futurescot_social_embed"
  | "futurescot_image_asset"
  | "futurescot_phrase_quote"
  | "sfn_newsletter_blurb"
  | "sfn_headline_lift"
  | "sfn_body_lift"
  | "sfn_image_asset"
  | "sfn_forwarded_mail";

export type ArtefactDef = {
  code: ArtefactCode;
  outlet: ArtefactOutlet;
  label: string;
  description: string;
};

export const ARTEFACTS: ArtefactDef[] = [
  // DIGIT — 6 artefact types
  {
    code: "digit_headline_lift",
    outlet: "digit",
    label: "DIGIT headline lifted",
    description:
      "Live headline derives directly from DIGIT's headline (verbatim, near-verbatim, or distinctive phrasing).",
  },
  {
    code: "digit_body_lift",
    outlet: "digit",
    label: "DIGIT body paragraph lifted",
    description:
      "Any paragraph or sentence in body text traces back to DIGIT prose rather than the underlying primary.",
  },
  {
    code: "digit_subhead_lift",
    outlet: "digit",
    label: "DIGIT subhead / standfirst lifted",
    description:
      "Standfirst or section subhead reuses DIGIT's framing or phrasing.",
  },
  {
    code: "digit_social_embed",
    outlet: "digit",
    label: "DIGIT tweet / social embed",
    description: "An embedded DIGIT social-media post appears in the article.",
  },
  {
    code: "digit_image_asset",
    outlet: "digit",
    label: "DIGIT image / asset reuse",
    description:
      "An image, chart, or asset attributed to DIGIT is republished or recropped.",
  },
  {
    code: "digit_phrase_quote",
    outlet: "digit",
    label: "DIGIT distinctive phrase or quote",
    description:
      "A distinctive turn of phrase, callout, or pull-quote sourced from DIGIT (not from the underlying primary).",
  },

  // Futurescot — 6 artefact types
  {
    code: "futurescot_headline_lift",
    outlet: "futurescot",
    label: "Futurescot headline lifted",
    description:
      "Live headline derives directly from Futurescot's headline (verbatim, near-verbatim, or distinctive phrasing).",
  },
  {
    code: "futurescot_body_lift",
    outlet: "futurescot",
    label: "Futurescot body paragraph lifted",
    description:
      "Any paragraph or sentence in body text traces back to Futurescot prose rather than the underlying primary.",
  },
  {
    code: "futurescot_subhead_lift",
    outlet: "futurescot",
    label: "Futurescot subhead / standfirst lifted",
    description:
      "Standfirst or section subhead reuses Futurescot's framing or phrasing.",
  },
  {
    code: "futurescot_social_embed",
    outlet: "futurescot",
    label: "Futurescot tweet / social embed",
    description:
      "An embedded Futurescot social-media post appears in the article.",
  },
  {
    code: "futurescot_image_asset",
    outlet: "futurescot",
    label: "Futurescot image / asset reuse",
    description:
      "An image, chart, or asset attributed to Futurescot is republished or recropped.",
  },
  {
    code: "futurescot_phrase_quote",
    outlet: "futurescot",
    label: "Futurescot distinctive phrase or quote",
    description:
      "A distinctive turn of phrase, callout, or pull-quote sourced from Futurescot (not from the underlying primary).",
  },

  // SFN — 5 artefact types (newsletter focus, no bespoke subhead)
  {
    code: "sfn_newsletter_blurb",
    outlet: "sfn",
    label: "SFN newsletter blurb lifted",
    description:
      "Any portion of an SFN newsletter blurb (intro card, link blurb, sponsor line) is republished.",
  },
  {
    code: "sfn_headline_lift",
    outlet: "sfn",
    label: "SFN headline lifted",
    description:
      "Live headline derives directly from SFN's site or newsletter headline.",
  },
  {
    code: "sfn_body_lift",
    outlet: "sfn",
    label: "SFN body paragraph lifted",
    description:
      "Any paragraph or sentence in body text traces back to SFN prose rather than the underlying primary.",
  },
  {
    code: "sfn_image_asset",
    outlet: "sfn",
    label: "SFN image / asset reuse",
    description:
      "An image, chart, or asset attributed to SFN is republished or recropped.",
  },
  {
    code: "sfn_forwarded_mail",
    outlet: "sfn",
    label: "SFN forwarded mail / embed",
    description:
      "A forwarded SFN newsletter or embedded SFN mail appears in or alongside the article.",
  },
];

export const ARTEFACT_CODES: ArtefactCode[] = ARTEFACTS.map((a) => a.code);
export const ARTEFACT_CODE_SET = new Set<ArtefactCode>(ARTEFACT_CODES);

export function artefactsByOutlet(outlet: ArtefactOutlet): ArtefactDef[] {
  return ARTEFACTS.filter((a) => a.outlet === outlet);
}

export const ARTEFACT_OUTLET_LABEL: Record<ArtefactOutlet, string> = {
  digit: "DIGIT",
  futurescot: "Futurescot",
  sfn: "Scottish Financial News",
};

/* -------------------------------------------------------------------------- */
/*  Sweep status + row shape                                                  */
/* -------------------------------------------------------------------------- */

export type ArtefactSweepStatus =
  | "pending"
  | "swept_clean"
  | "contamination_found"
  | "na";

export type ArtefactSweepEntry = {
  status: ArtefactSweepStatus;
  note: string | null;
};

export type ArtefactSweepResults = Partial<
  Record<ArtefactCode, ArtefactSweepEntry>
>;

export type ArticleArtefactSweepRow = {
  article_id: string;
  results: ArtefactSweepResults | null;
  completed_at: string | null;
  completed_by: string | null;
  updated_at: string;
};

export const ARTEFACT_SWEEP_STATUS: {
  value: ArtefactSweepStatus;
  short: string;
  tone: "muted" | "success" | "destructive" | "warn";
}[] = [
  { value: "pending", short: "PENDING", tone: "muted" },
  { value: "swept_clean", short: "CLEAN", tone: "success" },
  { value: "contamination_found", short: "FOUND", tone: "destructive" },
  { value: "na", short: "N/A", tone: "warn" },
];

/* -------------------------------------------------------------------------- */
/*  Coercion + summary                                                        */
/* -------------------------------------------------------------------------- */

function asStatus(raw: unknown): ArtefactSweepStatus {
  const s = String(raw ?? "").trim();
  if (
    s === "swept_clean" ||
    s === "contamination_found" ||
    s === "na" ||
    s === "pending"
  ) {
    return s;
  }
  return "pending";
}

export function normaliseSweepResults(raw: unknown): ArtefactSweepResults {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: ArtefactSweepResults = {};
  for (const def of ARTEFACTS) {
    const entry = src[def.code];
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      out[def.code] = {
        status: asStatus(e.status),
        note:
          typeof e.note === "string" && e.note.trim().length > 0
            ? e.note.trim().slice(0, 2400)
            : null,
      };
    } else {
      out[def.code] = { status: "pending", note: null };
    }
  }
  return out;
}

export function statusForArtefact(
  results: ArtefactSweepResults | null,
  code: ArtefactCode,
): ArtefactSweepStatus {
  return results?.[code]?.status ?? "pending";
}

export function noteForArtefact(
  results: ArtefactSweepResults | null,
  code: ArtefactCode,
): string | null {
  return results?.[code]?.note ?? null;
}

export type ArtefactSweepSummary = {
  clean: number;
  found: number;
  na: number;
  pending: number;
  total: number;
  /** Every artefact swept (clean / found / na). */
  complete: boolean;
  /** No contamination_found rows. Required for publish push. */
  cleanForPush: boolean;
  /** Any N/A row missing its justification. */
  missingNAJustification: ArtefactCode[];
};

export function summariseSweep(
  row: ArticleArtefactSweepRow | null,
): ArtefactSweepSummary {
  const results = normaliseSweepResults(row?.results ?? null);
  let clean = 0;
  let found = 0;
  let na = 0;
  let pending = 0;
  const missing: ArtefactCode[] = [];
  for (const def of ARTEFACTS) {
    const entry = results[def.code];
    if (!entry || entry.status === "pending") {
      pending += 1;
      continue;
    }
    if (entry.status === "swept_clean") clean += 1;
    else if (entry.status === "contamination_found") found += 1;
    else if (entry.status === "na") {
      na += 1;
      if (!entry.note) missing.push(def.code);
    }
  }
  const total = ARTEFACTS.length;
  return {
    clean,
    found,
    na,
    pending,
    total,
    complete: pending === 0 && missing.length === 0,
    cleanForPush: pending === 0 && found === 0 && missing.length === 0,
    missingNAJustification: missing,
  };
}

/* -------------------------------------------------------------------------- */
/*  Publish log                                                               */
/* -------------------------------------------------------------------------- */

export type PublishTarget = "wordpress" | "manual" | "draft_only";

export type PublishStatus =
  | "queued"
  | "publishing"
  | "published"
  | "failed"
  | "retracted";

export type ArticlePublishLogRow = {
  id: string;
  article_id: string;
  target: PublishTarget;
  status: PublishStatus;
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  payload: unknown | null;
  attempted_at: string;
  completed_at: string | null;
  created_by: string | null;
};

export const PUBLISH_TARGET_LABEL: Record<PublishTarget, string> = {
  wordpress: "WordPress",
  manual: "Manual",
  draft_only: "WP Draft",
};

export const PUBLISH_STATUS_LABEL: Record<PublishStatus, string> = {
  queued: "Queued",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  retracted: "Retracted",
};

export const PUBLISH_STATUS_TONE: Record<
  PublishStatus,
  "muted" | "success" | "destructive" | "warn" | "info"
> = {
  queued: "muted",
  publishing: "info",
  published: "success",
  failed: "destructive",
  retracted: "warn",
};

export function latestPublishedLog(
  rows: ArticlePublishLogRow[],
): ArticlePublishLogRow | null {
  for (const r of rows) {
    if (r.status === "published") return r;
  }
  return null;
}
