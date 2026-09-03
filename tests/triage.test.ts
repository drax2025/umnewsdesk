/**
 * Run: npx tsx tests/triage.test.ts
 *
 * Ported from Newsroom V1 with the rules themselves. These four cases are the
 * ones that were got wrong on live mail first time round — the newsroom's own
 * digest being filed as a press release, and commercial wording losing to
 * release wording — so they travel with the code that fixed them.
 */
import assert from 'node:assert';
import { triage } from '../src/lib/ingest/triage';

let passed = 0, failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); passed++; }
  catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

check('the newsroom\'s own digest is left in the inbox', () => {
  const d = triage({
    fromEmail: 'editorial@unionmedia.news',
    subject: 'Newsroom digest — week to 27 August',
    bodySample: 'Published this week: press release from ... FOR IMMEDIATE RELEASE ...',
    forwardedByUs: true,          // our own domain, so this is set
    sentByTheApp: true,
  });
  assert.equal(d.moveTo, null, 'it must not be filed as PR');
  assert.match(d.reason, /newsroom itself/);
});

check('the same message without the header would have been filed as PR', () => {
  const d = triage({
    fromEmail: 'editorial@unionmedia.news',
    subject: 'Newsroom digest — week to 27 August',
    bodySample: 'Published this week: ...',
    forwardedByUs: true,
  });
  assert.notEqual(d.moveTo, null, 'this is the behaviour the header guards against');
});

check('a genuine desk forward is still treated as a release', () => {
  const d = triage({
    fromEmail: 'dave.simpson@unionmedia.news',
    subject: 'Fwd: Press release from an agency',
    bodySample: 'FOR IMMEDIATE RELEASE ...',
    forwardedByUs: true,
  });
  assert.equal(d.category, 'pr');
});

check('an ordinary release from outside is unaffected', () => {
  const d = triage({
    fromEmail: 'hello@example-agency.co.uk',
    subject: 'Press release: something happened',
    bodySample: 'FOR IMMEDIATE RELEASE. Notes to editors.',
  });
  assert.equal(d.category, 'pr');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
