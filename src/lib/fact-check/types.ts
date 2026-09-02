/**
 * Advisory fact-check: what the candidate says, against what its source says.
 *
 * Advisory is the whole design. Nothing is blocked on this — a candidate with
 * three findings sends exactly like one with none, and a check that could not
 * run sends too. The notes are for the person editing in V1, who can see the
 * source themselves and decide.
 *
 * `state` is deliberately three-valued. "clean" and "unavailable" both produce
 * an empty findings list, and collapsing them would let a page that failed to
 * fetch read as a page that checked out.
 */

export type FindingKind =
  | "unsupported_claim"
  | "differing_figure"
  | "quote_not_found";

export type FactCheckFinding = {
  kind: FindingKind;
  /** What the candidate says. Quoted from it, so it can be found on the page. */
  claim: string;
  /** What the source says instead, where the source says anything at all. */
  source: string | null;
  confidence: "high" | "med" | "low";
};

export type FactCheck = {
  state: "clean" | "notes" | "unavailable";
  findings: FactCheckFinding[];
  /** Why the check could not run. Only set when state is "unavailable". */
  error?: string;
  sourceUrl: string;
  sourceChars: number;
  /** True when the page was longer than the cap and the tail was not seen. */
  truncated: boolean;
  model: string;
  checkedAt: string;
};

export const FINDING_LABEL: Record<FindingKind, string> = {
  unsupported_claim: "Not in the source",
  differing_figure: "Figure differs",
  quote_not_found: "Quote not found",
};

/** An empty result that still records why there is nothing to show. */
export const unavailable = (
  sourceUrl: string,
  error: string,
  model: string,
): FactCheck => ({
  state: "unavailable",
  findings: [],
  error,
  sourceUrl,
  sourceChars: 0,
  truncated: false,
  model,
  checkedAt: new Date().toISOString(),
});
