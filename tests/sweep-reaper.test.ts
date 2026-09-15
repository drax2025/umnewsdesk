/**
 * Run: npx tsx tests/sweep-reaper.test.ts
 *
 * The two decisions that matter are when a sweep is certainly dead, and what to
 * call it once it is. Getting the first wrong closes a live sweep and loses its
 * results; getting the second wrong makes every later reliability figure lie.
 */
import assert from 'node:assert';
import {
  isStale, ageMs, countersFrom, statusForReaped, reapPlan,
  STALE_AFTER_MS, DURATION_FOR_REAPED,
  type SweepStatus,
} from '../src/lib/ingest/sweep-reaper';

let passed = 0, failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); passed++; }
  catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

const NOW = new Date('2026-09-15T12:00:00Z');
const agoMinutes = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

/* --- when a sweep is certainly dead. The measured maximum for a real sweep
       that finished is 22 minutes; the youngest corpse was 7 hours. ------- */

check('the threshold clears the slowest sweep that has ever finished', () => {
  const slowestRealSweepMs = 1320 * 1000; // measured, 15 September 2026
  assert.ok(STALE_AFTER_MS > slowestRealSweepMs * 4,
    'the threshold is not comfortably clear of a real sweep');
});

check('a sweep still well inside the window is left alone', () => {
  assert.equal(isStale({ status: 'running', started_at: agoMinutes(22) }, NOW), false);
  assert.equal(isStale({ status: 'running', started_at: agoMinutes(119) }, NOW), false);
});

check('a sweep past the window is reaped', () => {
  assert.equal(isStale({ status: 'running', started_at: agoMinutes(121) }, NOW), true);
  assert.equal(isStale({ status: 'running', started_at: agoMinutes(60 * 24 * 90) }, NOW), true);
});

check('exactly on the threshold is not yet stale', () => {
  const exactly = new Date(NOW.getTime() - STALE_AFTER_MS).toISOString();
  assert.equal(isStale({ status: 'running', started_at: exactly }, NOW), false);
});

check('a sweep that reported an outcome is never touched, however old', () => {
  const ancient = agoMinutes(60 * 24 * 365);
  for (const status of ['complete', 'partial', 'failed', 'abandoned'] as SweepStatus[]) {
    assert.equal(isStale({ status, started_at: ancient }, NOW), false, `${status} was reaped`);
  }
});

check('a row with no start time is left alone rather than guessed about', () => {
  assert.equal(isStale({ status: 'running', started_at: '' as any }, NOW), false);
  assert.equal(isStale({ status: 'running', started_at: null as any }, NOW), false);
  assert.equal(isStale({ status: 'running', started_at: 'not a date' }, NOW), false);
});

check('a start time in the future is not stale', () => {
  const future = new Date(NOW.getTime() + 60_000).toISOString();
  assert.equal(isStale({ status: 'running', started_at: future }, NOW), false);
});

check('the age is measured from the start, in milliseconds', () => {
  assert.equal(ageMs(agoMinutes(60), NOW), 60 * 60 * 1000);
});

/* --- what it is called. The whole point of a separate word ------------- */

check('a reaped sweep is abandoned, never failed or partial', () => {
  assert.equal(statusForReaped(), 'abandoned');
});

check('what it achieved does not change what it is called', () => {
  // The counters say what it managed; the status says nobody heard back. A
  // sweep that produced fifty candidates and then died is still abandoned.
  assert.equal(statusForReaped(), 'abandoned');
  const busy = reapPlan(
    { id: '1', code: 'RR-1', status: 'running', started_at: agoMinutes(200) },
    { siteResults: [{ outcome: 'reached_items' }], candidateCount: 50 }, NOW);
  const empty = reapPlan(
    { id: '2', code: 'RR-2', status: 'running', started_at: agoMinutes(200) },
    { siteResults: [], candidateCount: 0 }, NOW);
  assert.equal(busy.update.status, 'abandoned');
  assert.equal(empty.update.status, 'abandoned');
});

check('the duration is left null, not invented from when we noticed', () => {
  assert.equal(DURATION_FOR_REAPED, null);
  const plan = reapPlan(
    { id: '1', code: 'RR-1', status: 'running', started_at: agoMinutes(5000) },
    { siteResults: [], candidateCount: 0 }, NOW);
  assert.equal(plan.update.duration_seconds, null);
});

/* --- what it achieved, recovered rather than zeroed -------------------- */

check('site results are counted the way /complete counts them', () => {
  const c = countersFrom({
    siteResults: [
      { outcome: 'reached_items' }, { outcome: 'reached_items' },
      { outcome: 'reached_empty' },
      { outcome: 'parse_failure' },
      { outcome: 'not_reached' }, { outcome: 'not_reached' }, { outcome: 'not_reached' },
    ],
    candidateCount: 9,
  });
  assert.equal(c.sites_total, 7);
  assert.equal(c.reached_with_items, 2);
  assert.equal(c.reached_no_items, 1);
  assert.equal(c.parse_failures, 1);
  assert.equal(c.not_reached, 3);
  assert.equal(c.candidates_total, 9);
});

check('the parts always add up to the total', () => {
  const c = countersFrom({
    siteResults: [{ outcome: 'reached_items' }, { outcome: 'not_reached' }, { outcome: 'reached_empty' }],
    candidateCount: 0,
  });
  assert.equal(c.reached_with_items + c.reached_no_items + c.parse_failures + c.not_reached,
    c.sites_total);
});

check('an unknown outcome is counted in the total but not miscategorised', () => {
  const c = countersFrom({ siteResults: [{ outcome: 'something_new' }], candidateCount: 0 });
  assert.equal(c.sites_total, 1);
  assert.equal(c.reached_with_items + c.reached_no_items + c.parse_failures + c.not_reached, 0);
});

check('a sweep that got nowhere records zeros, which is what happened', () => {
  const c = countersFrom({ siteResults: [], candidateCount: 0 });
  assert.deepEqual(c, {
    sites_total: 0, reached_with_items: 0, reached_no_items: 0,
    parse_failures: 0, not_reached: 0, candidates_total: 0,
  });
});

check('missing or malformed evidence does not throw', () => {
  assert.equal(countersFrom({} as any).sites_total, 0);
  assert.equal(countersFrom({ siteResults: null, candidateCount: NaN } as any).candidates_total, 0);
  assert.equal(countersFrom({ siteResults: [null, { outcome: 'not_reached' }] } as any).not_reached, 1);
});

check('a negative candidate count cannot be written', () => {
  assert.equal(countersFrom({ siteResults: [], candidateCount: -5 }).candidates_total, 0);
});

/* --- the plan handed to the update ------------------------------------- */

check('the plan carries the id and code, and stamps when it was noticed', () => {
  const plan = reapPlan(
    { id: 'abc', code: 'RR-2026-9229', status: 'running', started_at: agoMinutes(400) },
    { siteResults: [{ outcome: 'reached_items' }], candidateCount: 3 }, NOW);
  assert.equal(plan.id, 'abc');
  assert.equal(plan.code, 'RR-2026-9229');
  assert.equal(plan.update.completed_at, NOW.toISOString());
  assert.equal(plan.update.candidates_total, 3);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
