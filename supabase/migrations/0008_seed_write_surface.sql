-- ═══════════════════════════════════════════════════════════
-- Sample revisions + approval decisions for write-surface slice.
-- Idempotent: deletes seed rows before insert (matched by seed-prefixed slugs).
-- ═══════════════════════════════════════════════════════════

delete from public.article_revisions
  where article_id in (select id from public.articles where slug like 'seed-%');

delete from public.approval_decisions
  where article_id in (select id from public.articles where slug like 'seed-%');

-- Reset clearance flags on seed articles so re-running is deterministic.
update public.articles
  set sub_cleared_at = null,
      sub_cleared_by = null,
      legal_cleared_at = null,
      legal_cleared_by = null
  where slug like 'seed-%';

-- ─── Article revisions ──────────────────────────────────────
-- Linear write history: rev 1 = initial file, rev 2 = sub-edit pass,
-- rev 3 = legal-tightened. We only seed for articles in or past 'filed'.
with arts as (
  select id, slug, headline, standfirst from public.articles where slug like 'seed-%'
)
insert into public.article_revisions
  (article_id, revision_no, headline, standfirst, body, summary, created_at)
select arts.id, v.revision_no, arts.headline, arts.standfirst, v.body, v.summary,
       (now() - (v.created_hours_ago || ' hours')::interval)
from arts,
(values
  -- seed-001 (live) — full history
  ('seed-001', 1, 'Initial file from Skyrora reporter.',                          'First draft.',                       96),
  ('seed-001', 2, 'Skyrora secures fresh investment for Shetland launch — sub-edited.', 'Sub-edit pass: tightened lede.',  72),
  ('seed-001', 3, 'Skyrora secures fresh investment for Shetland launch — legal-cleared.', 'Legal: redacted unconfirmed figure.', 48),

  -- seed-002 (live) — full history
  ('seed-002', 1, 'Edinburgh fintech Snugg raises £4m Series A — first draft.',    'Filed.',                              80),
  ('seed-002', 2, 'Edinburgh fintech Snugg raises £4m Series A — sub-edited.',     'Sub-edit pass: house style.',          60),
  ('seed-002', 3, 'Edinburgh fintech Snugg raises £4m Series A — legal-cleared.',  'Legal: confirmed investor names.',     40),

  -- seed-003 (scheduled) — full history
  ('seed-003', 1, 'Glasgow AI lab spins out from Strathclyde — first draft.',      'Filed.',                              60),
  ('seed-003', 2, 'Glasgow AI lab spins out from Strathclyde — sub-edited.',       'Sub-edit pass.',                       48),
  ('seed-003', 3, 'Glasgow AI lab spins out from Strathclyde — legal-cleared.',    'Legal cleared.',                       24),

  -- seed-004 (legal) — sub-edit done, legal in progress
  ('seed-004', 1, 'BioQuarter lease — first draft.',                                'Filed by writer.',                    36),
  ('seed-004', 2, 'BioQuarter lease — sub-edited.',                                 'Sub-edit pass.',                       18),

  -- seed-005 (subbed) — first draft only
  ('seed-005', 1, 'Skyrora investment + Shetland test campaign — first draft.',     'Filed by writer.',                    24),

  -- seed-006 (filed) — first draft only
  ('seed-006', 1, 'Snugg Series A breakdown — first draft.',                        'Filed by writer.',                    12)
) as v(article_slug, revision_no, body, summary, created_hours_ago)
where arts.slug = v.article_slug;

-- ─── Approval decisions ─────────────────────────────────────
-- Decision log mirroring the state advances. Senior-editor identity is null
-- because profiles FK to auth.users blocks synthetic seed actors.
with arts as (
  select id, slug from public.articles where slug like 'seed-%'
)
insert into public.approval_decisions
  (article_id, from_state, to_state, kind, rationale, decided_at)
select arts.id, v.from_state::article_state, v.to_state::article_state,
       v.kind::approval_decision_kind, v.rationale,
       (now() - (v.decided_hours_ago || ' hours')::interval)
from arts,
(values
  -- seed-001 (live) — full review trail
  ('seed-001', 'filed',  'subbed', 'approve', 'Clean copy, ready for sub-edit.',                 72),
  ('seed-001', 'subbed', 'legal',  'approve', 'House-style pass complete; legal check needed.', 48),
  ('seed-001', 'legal',  'scheduled', 'approve', 'Legal cleared. Ready to schedule.',           30),

  -- seed-002 (live)
  ('seed-002', 'filed',  'subbed', 'approve', 'Strong copy.',                                    60),
  ('seed-002', 'subbed', 'legal',  'approve', 'Sub-edit done.',                                  40),
  ('seed-002', 'legal',  'scheduled', 'approve', 'Cleared.',                                     24),

  -- seed-003 (scheduled) — review trail completed; scheduling not yet wired through this gate
  ('seed-003', 'filed',  'subbed', 'approve', 'Solid lede, minor sub-pass needed.',              48),
  ('seed-003', 'subbed', 'legal',  'approve', 'Sub-edit pass complete.',                         24),
  ('seed-003', 'legal',  'scheduled', 'approve', 'Legal cleared.',                               12),

  -- seed-004 (legal) — advanced to legal; awaiting clearance
  ('seed-004', 'filed',  'subbed', 'approve', 'OK to sub-edit.',                                 28),
  ('seed-004', 'subbed', 'legal',  'approve', 'Sub-edit done — send to legal.',                  16),

  -- seed-005 (subbed) — moved to subbed, no further yet
  ('seed-005', 'filed',  'subbed', 'approve', 'Strong, sub-edit can proceed.',                   18),

  -- seed-010 (rejected) — single reject decision
  ('seed-010', 'filed',  'rejected', 'reject', 'Sourcing insufficient — needs at least two on-the-record sources before resubmission.', 60)
) as v(article_slug, from_state, to_state, kind, rationale, decided_hours_ago)
where arts.slug = v.article_slug;

-- ─── Reflect clearance flags on the seed articles ───────────
-- Articles that have crossed the sub gate
update public.articles
  set sub_cleared_at = now() - interval '24 hours'
  where slug in ('seed-001', 'seed-002', 'seed-003', 'seed-004');

-- Articles that have crossed the legal gate
update public.articles
  set legal_cleared_at = now() - interval '12 hours'
  where slug in ('seed-001', 'seed-002', 'seed-003');
