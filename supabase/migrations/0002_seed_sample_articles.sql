-- ═══════════════════════════════════════════════════════════
-- Sample articles for dashboard development.
-- Idempotent: deletes seed rows before insert (matched by slug prefix).
-- ═══════════════════════════════════════════════════════════

delete from public.articles where slug like 'seed-%';

with t as (
  select id from public.titles where slug = 'silicon-scotland'
)
insert into public.articles
  (title_id, slug, headline, standfirst, state, primary_frame, geo_tier, sectors, published_at)
select t.id, slug, headline, standfirst, state, primary_frame, geo_tier, sectors, published_at
from t,
(values
  ('seed-001', 'Skyrora secures fresh investment for Shetland launch',
   'Scottish space firm raises follow-on funding ahead of vertical test campaign.',
   'live'::article_state, 'frame_1'::article_frame, 'tier_1'::geo_tier,
   array['Space','Funding'], now() - interval '2 hours'),

  ('seed-002', 'Edinburgh fintech Snugg raises £4m Series A',
   'Energy-finance startup banks growth round to scale heat-pump lending.',
   'live'::article_state, 'frame_2'::article_frame, 'tier_1'::geo_tier,
   array['FinTech','Funding'], now() - interval '5 hours'),

  ('seed-003', 'Glasgow AI lab spins out from Strathclyde',
   'University commercialises optimisation research with seed-stage spinout.',
   'scheduled'::article_state, 'frame_1'::article_frame, 'tier_1'::geo_tier,
   array['AI','Spinout'], now() + interval '3 hours'),

  ('seed-004', 'Aberdeen subsea robotics firm wins MoD contract',
   'Defence procurement award expands Scotland''s underwater autonomy cluster.',
   'legal'::article_state, 'frame_3'::article_frame, 'tier_1'::geo_tier,
   array['Robotics','Defence'], null),

  ('seed-005', 'NHS Scotland trials AI diagnostic tool in Tayside',
   'Pilot programme assesses triage accuracy for routine referrals.',
   'subbed'::article_state, 'frame_2'::article_frame, 'tier_1'::geo_tier,
   array['AI','Health'], null),

  ('seed-006', 'Cyber firm Sapphire opens Glasgow SOC',
   'Managed-security provider expands operations footprint outside Edinburgh.',
   'filed'::article_state, 'frame_4'::article_frame, 'tier_1'::geo_tier,
   array['Cyber'], null),

  ('seed-007', 'Dundee games studio Pawprint acquired',
   'Mobile developer joins international group in undisclosed deal.',
   'commissioned'::article_state, 'frame_5'::article_frame, 'tier_1'::geo_tier,
   array['Games','M&A'], null),

  ('seed-008', 'Highland renewables firm signs grid-scale storage deal',
   'Battery project to balance North Scotland transmission constraints.',
   'commissioned'::article_state, 'frame_3'::article_frame, 'tier_1'::geo_tier,
   array['Energy','Infrastructure'], null),

  ('seed-009', 'Life-sciences cluster Edinburgh BioQuarter expands',
   'New incubator wing to house thirty additional companies.',
   'pitched'::article_state, 'frame_1'::article_frame, 'tier_1'::geo_tier,
   array['Life Sciences','Property'], null),

  ('seed-010', 'Quoted figure''s claim cannot be independently verified',
   'Triage flagged single-source assertion lacking corroborating evidence.',
   'rejected'::article_state, 'frame_6'::article_frame, 'tier_1'::geo_tier,
   array['General Tech'], null)
) as v(slug, headline, standfirst, state, primary_frame, geo_tier, sectors, published_at);
