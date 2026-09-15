/**
 * Closing sweeps that were opened and never reported.
 *
 * n8n opens a sweep (`POST /api/ingest/sweep`), does the work, then calls
 * `/complete`. If the workflow dies in between, the row sits at `running` for
 * ever. Twenty-eight of them had accumulated by 15 September 2026, the oldest
 * from 9 June, and the newest from that same afternoon — so this is not a
 * historical mess, it is a leak that was still running.
 *
 * Nothing blocks on those rows: a new sweep opens regardless. The harm is that
 * the desk's dashboard shows sweeps in progress that stopped months ago, and
 * every figure drawn across sweeps is computed over rows that never finished.
 *
 * Everything here is pure. The database work is in the cron route, so the two
 * decisions worth being sure about — when a sweep is certainly dead, and what
 * to call it — can be tested without one.
 */

export type SweepStatus = 'running' | 'complete' | 'partial' | 'failed' | 'abandoned';

/**
 * How long a sweep may run before we are certain it is not coming back.
 *
 * Measured, not guessed. Across 162 completed sweeps on 15 September 2026:
 * median 50s, p90 52s, p99 1140s, slowest ever 1320s — twenty-two minutes. The
 * youngest row stuck at `running` was seven hours old.
 *
 * Two hours is five times the slowest sweep that has ever finished and a third
 * of the age of the youngest corpse, so there is no overlap to get wrong. The
 * cost of being too eager is closing a live sweep, which would lose its results;
 * the cost of being too slow is a stale row for another hour. They are not
 * symmetrical, so this errs long.
 */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export const ageMs = (startedAt: string | Date, now: Date): number =>
  now.getTime() - new Date(startedAt).getTime();

/**
 * Is this sweep certainly dead?
 *
 * Only ever true for something still marked `running`: a sweep that reported
 * any outcome is finished business and is never touched again, however old.
 */
export const isStale = (
  sweep: { status: SweepStatus; started_at: string | Date },
  now: Date,
  staleAfterMs = STALE_AFTER_MS,
): boolean => {
  if (sweep.status !== 'running') return false;
  if (!sweep.started_at) return false;
  const age = ageMs(sweep.started_at, now);
  return Number.isFinite(age) && age > staleAfterMs;
};

/**
 * What a reaped sweep did before it died.
 *
 * `sweep_site_results` and `candidates` both carry `sweep_run_id`, so this is
 * recoverable rather than guesswork — which is the difference between writing
 * down what happened and writing zeros over it.
 */
export interface SweepEvidence {
  siteResults: Array<{ outcome: string }>;
  candidateCount: number;
}

export interface ReapedCounters {
  sites_total: number;
  reached_with_items: number;
  reached_no_items: number;
  parse_failures: number;
  not_reached: number;
  candidates_total: number;
}

/** Count up the site results exactly as the /complete route counts them. */
export const countersFrom = (evidence: SweepEvidence): ReapedCounters => {
  const results = Array.isArray(evidence?.siteResults) ? evidence.siteResults : [];
  const tally = (outcome: string) => results.filter(r => r?.outcome === outcome).length;
  return {
    sites_total: results.length,
    reached_with_items: tally('reached_items'),
    reached_no_items: tally('reached_empty'),
    parse_failures: tally('parse_failure'),
    not_reached: tally('not_reached'),
    candidates_total: Math.max(0, Number(evidence?.candidateCount) || 0),
  };
};

/**
 * What to call it.
 *
 * Always `abandoned`, whatever it managed first.
 *
 * The temptation is to call a sweep that produced candidates `partial` and one
 * that produced nothing `failed`, so the dashboard reads more naturally. That
 * would be wrong: those two words mean the sweep reported an outcome, and this
 * one did not report anything. The counters record what it achieved; the status
 * records that nobody ever heard back. Conflating the two is exactly what makes
 * a reliability figure lie.
 */
export const statusForReaped = (): SweepStatus => 'abandoned';

/**
 * `duration_seconds` is deliberately left null.
 *
 * We know when it started and when we noticed, not when it stopped. Writing the
 * gap between those would put a two-hour sweep into a table whose real maximum
 * is twenty-two minutes, and the next person to work out how long a sweep takes
 * would get a wrong answer from a number we invented. Null says what is true.
 */
export const DURATION_FOR_REAPED = null;

/** One sweep's worth of decision, ready for the update. */
export const reapPlan = (
  sweep: { id: string; code: string; status: SweepStatus; started_at: string | Date },
  evidence: SweepEvidence,
  now: Date,
) => ({
  id: sweep.id,
  code: sweep.code,
  update: {
    status: statusForReaped(),
    completed_at: now.toISOString(),
    duration_seconds: DURATION_FOR_REAPED,
    ...countersFrom(evidence),
  },
});
