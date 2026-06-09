-- ═══════════════════════════════════════════════════════════
-- Sample commissions + schedule entries for commissioning slice.
-- Idempotent: deletes seed rows before insert (matched by code prefix).
-- ═══════════════════════════════════════════════════════════

delete from public.schedule_entries where code like 'SCH-2026-%';
delete from public.commissions      where code like 'COM-2026-%';

-- ─── Commissions ────────────────────────────────────────────
-- One per article. Status mirrors article state where it makes sense.
with arts as (
  select id, slug, state from public.articles where slug like 'seed-%'
),
cands as (
  select id, code from public.candidates where code like 'REC-9%'
)
insert into public.commissions
  (code, article_id, candidate_id, brief, deadline_at,
   status, commissioned_at, accepted_at, declined_reason)
select v.code, arts.id, cands.id, v.brief,
       (now() + (v.deadline_hours || ' hours')::interval),
       v.status::commission_status,
       (now() - (v.commissioned_hours_ago || ' hours')::interval),
       case when v.accepted_hours_ago is not null
            then now() - (v.accepted_hours_ago || ' hours')::interval
            else null end,
       v.declined_reason
from arts
left join cands on cands.code = (
  -- Only link the F1 candidate to the briefed commission demo
  case when arts.slug = 'seed-007' then 'REC-9115' else null end
),
(values
  -- New brief, awaiting writer response — linked to F1-accepted candidate
  ('COM-2026-006', 'seed-007',
   'Strathclyde optimisation lab spinout — confirm round size, lead investor, hiring plan, target markets. 600–700 words.',
   48, 'briefed', 6, null::int, null::text),

  -- Briefed, writer accepted, hasn''t filed yet
  ('COM-2026-005', 'seed-008',
   'Robotrak scheme of arrangement — what triggered restructuring, creditor map, impact on Aberdeen ops. 800 words.',
   72, 'accepted', 28, 22, null),

  -- Filed and onward (article state >= filed) — commission lifecycle closed
  ('COM-2026-004', 'seed-006',
   'Snugg Series A breakdown — round dynamics, growth metrics, heat-pump market context. 750 words.',
   -12, 'filed', 96, 90, null),
  ('COM-2026-003', 'seed-005',
   'Skyrora investment + Shetland test campaign — money trail, test cadence, regulator status. 900 words.',
   -24, 'filed', 120, 116, null),
  ('COM-2026-002', 'seed-004',
   'BioQuarter lease — tenant background, lease structure, Edinburgh life-sci cluster context. 600 words.',
   -48, 'filed', 144, 138, null),
  ('COM-2026-001', 'seed-003',
   'Glasgow AI spinout — Strathclyde IP, founding team, first commercial pilots, funding runway. 700 words.',
   -72, 'filed', 168, 162, null)
) as v(code, article_slug, brief, deadline_hours,
       status, commissioned_hours_ago, accepted_hours_ago, declined_reason)
where arts.slug = v.article_slug;

-- ─── Schedule entries ───────────────────────────────────────
with arts as (
  select id, slug from public.articles where slug like 'seed-%'
)
insert into public.schedule_entries
  (code, article_id, publish_at, slot_window, priority, notes, status, scheduled_at)
select v.code, arts.id,
       (now() + (v.publish_hours || ' hours')::interval),
       v.slot::schedule_slot,
       v.priority, v.notes, v.status::schedule_status,
       (now() - (v.scheduled_hours_ago || ' hours')::interval)
from arts,
(values
  -- Already published (live article, retained slot record)
  ('SCH-2026-001', 'seed-002', -5,   'am',       1, 'Lead morning — fintech anchor.',                    'published', 26),
  -- Today PM
  ('SCH-2026-002', 'seed-003', 4,    'pm',       2, 'Spinout — pair with comment piece in PM newsletter.','pending',    8),
  -- Tomorrow AM
  ('SCH-2026-003', 'seed-005', 22,   'am',       1, 'Skyrora — anchor space-vertical roundup.',           'pending',   12),
  -- Tomorrow PM
  ('SCH-2026-004', 'seed-006', 32,   'pm',       3, 'Snugg — bundle with energy-finance digest.',         'pending',    4),
  -- Day after AM (breaking-ready)
  ('SCH-2026-005', 'seed-004', 54,   'breaking', 2, 'BioQuarter — embargo lifts 06:00; standing breaking slot.', 'pending', 2)
) as v(code, article_slug, publish_hours, slot, priority, notes, status, scheduled_hours_ago)
where arts.slug = v.article_slug;
