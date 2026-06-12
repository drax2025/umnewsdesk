/**
 * A3 Editorial opportunities pipeline + K5 Friday sweep — types + labels.
 *
 * The opportunities ledger is the title-scoped rolling list of future
 * story possibilities surfaced by F2 Researcher (and manually by
 * editors). Each row sits in one of five sections and carries a K5
 * verdict that the Senior Editor stamps in the Friday weekly sweep.
 *
 * K5 verdict policy (from spec K5):
 *   - 'pending' rows live in the active list
 *   - 'commission' promotes to the rota (manual step)
 *   - 'park' rows stay visible; >90 days parked = auto-archive (filter UI)
 *   - 'drop' archives the row
 *   - Rows that have been touched by 4 sweeps without a verdict default to DROP
 */

export const OPPORTUNITY_SECTIONS = [
  {
    value: "a_profile" as const,
    code: "A",
    label: "Profile",
    description:
      "Subject-led feature pieces (founder, scientist, institution profile).",
  },
  {
    value: "b_followup" as const,
    code: "B",
    label: "Follow-up",
    description:
      "Direct follow-up to a recently-published article (new development, source response).",
  },
  {
    value: "c_cluster_build" as const,
    code: "C",
    label: "Cluster-build",
    description:
      "Multi-article series on a theme (a 3-piece cluster, a sector explainer).",
  },
  {
    value: "d_cross_pub" as const,
    code: "D",
    label: "Cross-pub",
    description:
      "The same story angle re-pitched into another Union Media title.",
  },
  {
    value: "e_recurring_beat" as const,
    code: "E",
    label: "Recurring beat",
    description:
      "A standing watch / tracker (e.g. spinout pipeline, regulator filings).",
  },
];

export type OpportunitySection =
  (typeof OPPORTUNITY_SECTIONS)[number]["value"];

export const OPPORTUNITY_SECTION_LABEL: Record<
  OpportunitySection,
  string
> = Object.fromEntries(
  OPPORTUNITY_SECTIONS.map((s) => [s.value, s.label]),
) as Record<OpportunitySection, string>;

export const OPPORTUNITY_SECTION_CODE: Record<
  OpportunitySection,
  string
> = Object.fromEntries(
  OPPORTUNITY_SECTIONS.map((s) => [s.value, s.code]),
) as Record<OpportunitySection, string>;

export const OPPORTUNITY_VERDICTS = [
  {
    value: "pending" as const,
    label: "Pending",
    short: "PENDING",
    tone: "muted" as const,
  },
  {
    value: "commission" as const,
    label: "Commission",
    short: "COMMISSION",
    tone: "success" as const,
  },
  {
    value: "park" as const,
    label: "Park",
    short: "PARK",
    tone: "warn" as const,
  },
  {
    value: "drop" as const,
    label: "Drop",
    short: "DROP",
    tone: "destructive" as const,
  },
];

export type OpportunityVerdict =
  (typeof OPPORTUNITY_VERDICTS)[number]["value"];

export const OPPORTUNITY_VERDICT_LABEL: Record<
  OpportunityVerdict,
  string
> = Object.fromEntries(
  OPPORTUNITY_VERDICTS.map((v) => [v.value, v.label]),
) as Record<OpportunityVerdict, string>;

export type ArticlePipelineOpportunityRow = {
  id: string;
  article_id: string;
  title_id: string | null;
  section: OpportunitySection;
  title: string;
  category: string | null;
  priority: 1 | 2 | 3 | null;
  notes: string | null;
  verdict: OpportunityVerdict;
  verdict_at: string | null;
  verdict_by: string | null;
  verdict_notes: string | null;
  sweep_count: number;
  last_swept_at: string | null;
  created_at: string;
  created_by: string | null;
};

/* -------------------------------------------------------------------------- */
/*  K5 sweep helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A parked row that has been on the list >90 days is treated as
 * archived in the K5 view. (K5 policy.)
 */
export function isAutoArchived(row: ArticlePipelineOpportunityRow): boolean {
  if (row.verdict !== "park") return false;
  const verdictTs = row.verdict_at ? Date.parse(row.verdict_at) : NaN;
  if (Number.isNaN(verdictTs)) return false;
  const ageDays = (Date.now() - verdictTs) / (1000 * 60 * 60 * 24);
  return ageDays > 90;
}

/**
 * K5 policy: a row touched by 4 sweeps without a verdict defaults to
 * DROP. The sweep_count counter is bumped each Friday-touch.
 */
export function isStaleForAutoDrop(
  row: ArticlePipelineOpportunityRow,
): boolean {
  return row.verdict === "pending" && row.sweep_count >= 4;
}

export type OpportunitySectionSummary = {
  section: OpportunitySection;
  total: number;
  pending: number;
  commission: number;
  park: number;
  drop: number;
};

export function summariseBySection(
  rows: ArticlePipelineOpportunityRow[],
): OpportunitySectionSummary[] {
  const base: Record<OpportunitySection, OpportunitySectionSummary> = {
    a_profile: blank("a_profile"),
    b_followup: blank("b_followup"),
    c_cluster_build: blank("c_cluster_build"),
    d_cross_pub: blank("d_cross_pub"),
    e_recurring_beat: blank("e_recurring_beat"),
  };
  for (const r of rows) {
    const s = base[r.section];
    s.total += 1;
    s[r.verdict] += 1;
  }
  return OPPORTUNITY_SECTIONS.map((d) => base[d.value]);
}

function blank(section: OpportunitySection): OpportunitySectionSummary {
  return {
    section,
    total: 0,
    pending: 0,
    commission: 0,
    park: 0,
    drop: 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Reject queue K5 sweep                                                     */
/* -------------------------------------------------------------------------- */

export const REJECT_SWEEP_VERDICTS = [
  {
    value: "pursue_manual" as const,
    label: "Pursue manually",
    short: "PURSUE",
    tone: "success" as const,
    description: "Editor takes the story off-pipeline.",
  },
  {
    value: "hold" as const,
    label: "Hold",
    short: "HOLD",
    tone: "warn" as const,
    description: "Keep in queue for next Friday's sweep.",
  },
  {
    value: "drop" as const,
    label: "Drop",
    short: "DROP",
    tone: "destructive" as const,
    description: "Archive — no further consideration.",
  },
];

export type RejectSweepVerdict =
  (typeof REJECT_SWEEP_VERDICTS)[number]["value"];

export type RejectQueueSweepRow = {
  id: string;
  article_id: string;
  verdict: RejectSweepVerdict;
  notes: string | null;
  swept_at: string;
  swept_by: string | null;
  iteration: number;
};
