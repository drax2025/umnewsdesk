/**
 * F2 Researcher constants & types, lifted from spec v3.0:
 *   - F2          operational sequence (primary, signal-only gate, independent confirmation, …)
 *   - B1, C1, C3  verbatim audit + paragraph-break preservation
 *   - B2          signal-only outlets (DIGIT, Futurescot, SFN)
 *   - B7          pipeline opportunities ledger (4-5 per article)
 *   - B8, C9      NFP footer
 *
 * Single source of truth for the page + components + server actions.
 */

/* -------------------------------------------------------------------------- */
/*  Source pack kinds                                                         */
/* -------------------------------------------------------------------------- */

export type SourceKind =
  | "primary"
  | "independent"
  | "subject_response"
  | "context";

export const SOURCE_KINDS: { value: SourceKind; label: string; hint: string }[] = [
  {
    value: "primary",
    label: "Primary",
    hint: "Press release, official statement, peer-reviewed paper, regulatory filing, first-person LinkedIn/blog.",
  },
  {
    value: "independent",
    label: "Independent confirmation",
    hint: "Different outlet confirming the primary. Two required for controversial stories.",
  },
  {
    value: "subject_response",
    label: "Subject right-of-reply",
    hint: "Tier 2 only — subject's public-record response (statement, social, regulatory filing).",
  },
  {
    value: "context",
    label: "Framing context",
    hint: "Material the assigned frame requires. Cap at 4 per F2 step 5.",
  },
];

export const MAX_CONTEXT_SOURCES = 4;

/* -------------------------------------------------------------------------- */
/*  B2 signal-only outlets                                                    */
/* -------------------------------------------------------------------------- */

/** Domains treated as signal-only per B2 (DIGIT, Futurescot, SFN). */
export const SIGNAL_ONLY_DOMAINS = [
  "digit.fyi",
  "futurescot.com",
  "scottishfinancialnews.com",
] as const;

/** Returns true if the URL's hostname matches a signal-only outlet. */
export function isSignalOnlyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return SIGNAL_ONLY_DOMAINS.some(
      (d) => host === d || host.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Framing feasibility verdict                                               */
/* -------------------------------------------------------------------------- */

export type FramingFeasibility = "supported" | "weak" | "unsupported";

export const FEASIBILITY: {
  value: FramingFeasibility;
  label: string;
  hint: string;
  tone: "success" | "warn" | "destructive";
}[] = [
  {
    value: "supported",
    label: "FRAME-SUPPORTED",
    hint: "Public-record material supports the assigned frame. Proceed to F3.",
    tone: "success",
  },
  {
    value: "weak",
    label: "FRAME-WEAK",
    hint: "Marginal — hand back to F1 with evidence; F1 reframes or DISQUALIFIES.",
    tone: "warn",
  },
  {
    value: "unsupported",
    label: "FRAME-UNSUPPORTED",
    hint: "No public-record support. Hand back to F1.",
    tone: "destructive",
  },
];

/* -------------------------------------------------------------------------- */
/*  Dependency status                                                         */
/* -------------------------------------------------------------------------- */

export type DependencyStatus =
  | "clean"
  | "digit_exposed"
  | "futurescot_exposed"
  | "sfn_exposed";

export const DEPENDENCY_STATUS: {
  value: DependencyStatus;
  label: string;
  short: string;
  tone: "success" | "warn" | "destructive";
}[] = [
  { value: "clean",                label: "CLEAN",               short: "CLEAN",      tone: "success"     },
  { value: "digit_exposed",        label: "DIGIT-EXPOSED",       short: "DIGIT",      tone: "destructive" },
  { value: "futurescot_exposed",   label: "FUTURESCOT-EXPOSED",  short: "FUTURESCOT", tone: "destructive" },
  { value: "sfn_exposed",          label: "SFN-EXPOSED",         short: "SFN",        tone: "destructive" },
];

/* -------------------------------------------------------------------------- */
/*  F2 verdict                                                                */
/* -------------------------------------------------------------------------- */

export type F2Verdict = "hand_to_f3" | "hand_back_to_f1" | "route_to_reject";

export const VERDICTS: {
  value: F2Verdict;
  label: string;
  hint: string;
  tone: "success" | "warn" | "destructive";
}[] = [
  {
    value: "hand_to_f3",
    label: "Hand to F3 Writer",
    hint: "Source pack complete, frame supported. Article advances to drafting.",
    tone: "success",
  },
  {
    value: "hand_back_to_f1",
    label: "Hand back to F1",
    hint: "Framing weak/unsupported. F1 reframes or DISQUALIFIES.",
    tone: "warn",
  },
  {
    value: "route_to_reject",
    label: "Route to reject queue",
    hint: "Primary paywalled or otherwise un-sourceable. [REJ] channel.",
    tone: "destructive",
  },
];

/* -------------------------------------------------------------------------- */
/*  Pipeline opportunities (B7)                                               */
/* -------------------------------------------------------------------------- */

export type OpportunityPriority = 1 | 2 | 3;

export const PRIORITIES: { value: OpportunityPriority; label: string; tone: string }[] = [
  { value: 1, label: "High", tone: "text-destructive" },
  { value: 2, label: "Med",  tone: "text-warn"        },
  { value: 3, label: "Low",  tone: "text-fg-2"        },
];

export const MIN_OPPORTUNITIES = 4;
export const MAX_OPPORTUNITIES = 5;

/* -------------------------------------------------------------------------- */
/*  Row types (mirror SQL columns 1:1)                                        */
/* -------------------------------------------------------------------------- */

export type ArticleSourceRow = {
  id: string;
  article_id: string;
  kind: SourceKind;
  url: string;
  title: string | null;
  publisher: string | null;
  published_at: string | null;
  author: string | null;
  content: string | null;
  is_signal_only: boolean;
  is_paywalled: boolean;
  notes: string | null;
  order_idx: number;
  fetched_at: string;
};

export type ArticleQuoteRow = {
  id: string;
  article_id: string;
  source_id: string | null;
  quote_text: string;
  speaker: string | null;
  role: string | null;
  institution: string | null;
  order_idx: number;
  created_at: string;
};

export type ArticleResearchRow = {
  article_id: string;
  framing_feasibility: FramingFeasibility | null;
  feasibility_evidence: string | null;
  dependency_status: DependencyStatus | null;
  primary_paywalled: boolean;
  nfp_footer_draft: string | null;
  verdict: F2Verdict | null;
  verdict_at: string | null;
  verdict_rationale: string | null;
  updated_at: string;
};

export type PipelineOpportunityRow = {
  id: string;
  article_id: string;
  title: string;
  category: string | null;
  priority: OpportunityPriority | null;
  notes: string | null;
  created_at: string;
};
