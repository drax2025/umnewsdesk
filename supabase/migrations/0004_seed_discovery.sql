-- ═══════════════════════════════════════════════════════════
-- Sample discovery data — Silicon Scotland sweep day
-- Idempotent: wipes seed rows (matched by `seed-` prefix codes
-- where present, or by stream slug) before insert.
-- ═══════════════════════════════════════════════════════════

-- Clean prior seed rows in dependency-safe order
delete from public.ops_rr_alerts        where code like 'OPS-RR-9%';
delete from public.candidates           where code like 'REC-9%';
delete from public.sweep_site_results
  using public.sweep_runs sr
  where sweep_site_results.sweep_run_id = sr.id and sr.code like 'RR-9%';
delete from public.sweep_runs           where code like 'RR-9%';
delete from public.discovery_sources    where code like 'SRC-9%';
delete from public.discovery_streams    where slug like 'seed-%';

-- ─── Streams ─────────────────────────────────────────────────
insert into public.discovery_streams (slug, name) values
  ('seed-space',     'Space & Aerospace'),
  ('seed-fintech',   'FinTech'),
  ('seed-ai',        'AI & Data'),
  ('seed-energy',    'Energy & Renewables'),
  ('seed-life-sci',  'Life Sciences'),
  ('seed-cyber',     'Cyber & Defence'),
  ('seed-games',     'Games & Creative');

-- ─── Sources ─────────────────────────────────────────────────
with s as (
  select slug, id from public.discovery_streams where slug like 'seed-%'
)
insert into public.discovery_sources
  (code, name, feed_url, crawl_method, layer, stream_id, status,
   exclusivity_window_hours, signal_only_eligible, monitored_since)
select v.code, v.name, v.url, v.method, v.layer::source_layer,
       s.id, v.status::source_status, v.excl, v.signal, now() - (v.age || ' days')::interval
from (values
  ('SRC-9001', 'Skyrora Press Office',        'https://www.skyrora.com/press', 'html_scrape', 'l1', 'seed-space',    'active',   24, false, 412),
  ('SRC-9002', 'Edinburgh BioQuarter News',   'https://edinburghbioquarter.com/news/feed', 'rss', 'l1', 'seed-life-sci', 'active', 48, false, 380),
  ('SRC-9003', 'Strathclyde Innovation Wire', 'https://www.strath.ac.uk/news/feed', 'rss', 'l1', 'seed-ai',         'warning',  48, false, 290),
  ('SRC-9004', 'Companies House (Scotland)',  'https://api.company-information.service.gov.uk/scotland', 'api', 'l2', 'seed-fintech', 'active', 0, true, 600),
  ('SRC-9005', 'Sapphire Systems Blog',       'https://www.sapphire.net/blog/rss', 'rss', 'l3', 'seed-cyber',      'active',   72, false, 180),
  ('SRC-9006', 'Snugg PR Wire',               'https://www.snugg.co.uk/press', 'html_scrape', 'l2', 'seed-fintech', 'critical', 48, false, 120),
  ('SRC-9007', 'Pawprint Games Blog',         'https://pawprintgames.com/blog/feed', 'rss', 'l3', 'seed-games',    'active',   72, true,  88),
  ('SRC-9008', 'NHS Tayside Newsroom',        'https://www.nhstayside.scot.nhs.uk/news', 'html_scrape', 'l1', 'seed-ai', 'active', 24, false, 210),
  ('SRC-9009', 'SSEN Transmission Notices',   'https://www.ssen-transmission.co.uk/news/feed', 'rss', 'l2', 'seed-energy', 'active', 48, false, 340),
  ('SRC-9010', 'Aberdeen Subsea Cluster',     'https://www.subseauk.com/news', 'html_scrape', 'l2', 'seed-energy', 'warning', 48, false, 195),
  ('SRC-9011', 'TechScotland Newsletter',     'https://techscotland.com/feed', 'rss', 'l3', 'seed-ai', 'active', 72, true, 410),
  ('SRC-9012', 'MoD Procurement (Scotland)',  'https://www.contractsfinder.service.gov.uk/scotland.atom', 'rss', 'l1', 'seed-cyber', 'active', 24, false, 720),
  ('SRC-9013', 'Highland Energy Daily',       'https://highlandenergy.co/feed', 'rss', 'l3', 'seed-energy', 'paused', 48, true, 80),
  ('SRC-9014', 'Dundee Innovation Hub',       'https://dundeeinnovation.com/news', 'html_scrape', 'l2', 'seed-ai', 'active', 48, false, 156),
  ('SRC-9015', 'Scottish Enterprise Releases','https://www.scottish-enterprise.com/news/feed', 'rss', 'l1', 'seed-energy', 'active', 24, false, 1100)
) as v(code, name, url, method, layer, stream_slug, status, excl, signal, age)
join s on s.slug = v.stream_slug;

-- ─── Sweep runs ──────────────────────────────────────────────
-- Two completed runs (PM yesterday, AM today) and one currently running PM.
insert into public.sweep_runs
  (code, slot, status, started_at, completed_at, duration_seconds,
   sites_total, reached_with_items, reached_no_items, parse_failures,
   not_reached, candidates_total, dedup_holds)
values
  ('RR-9039', 'pm', 'complete',
   now() - interval '17 hours', now() - interval '16 hours 41 minutes', 1140,
   15, 11, 2, 1, 1, 27, 4),
  ('RR-9040', 'am', 'complete',
   now() - interval '5 hours', now() - interval '4 hours 38 minutes', 1320,
   15, 12, 1, 2, 0, 34, 6),
  ('RR-9041', 'pm', 'running',
   now() - interval '8 minutes', null, null,
   15, 9, 1, 1, 0, 18, 2);

-- ─── Sweep site results (just for the current PM run RR-9041) ─
with run as (select id from public.sweep_runs where code = 'RR-9041'),
     src as (select code, id from public.discovery_sources where code like 'SRC-9%')
insert into public.sweep_site_results
  (sweep_run_id, source_id, outcome, http_status, candidate_count,
   parse_issue_count, failure_streak, resolved_primary_url)
select run.id, src.id, v.outcome::site_outcome, v.http, v.cand, v.parse, v.streak, v.url
from run,
     src,
(values
  ('SRC-9001', 'reached_items',  200, 2, 0, 0, 'https://www.skyrora.com/press'),
  ('SRC-9002', 'reached_items',  200, 1, 0, 0, 'https://edinburghbioquarter.com/news'),
  ('SRC-9003', 'parse_failure',  200, 0, 3, 4, 'https://www.strath.ac.uk/news'),
  ('SRC-9004', 'reached_items',  200, 4, 0, 0, 'https://api.company-information.service.gov.uk/scotland'),
  ('SRC-9005', 'reached_items',  200, 1, 0, 0, 'https://www.sapphire.net/blog'),
  ('SRC-9006', 'not_reached',    503, 0, 0, 7, 'https://www.snugg.co.uk/press'),
  ('SRC-9007', 'reached_items',  200, 1, 0, 0, 'https://pawprintgames.com/blog'),
  ('SRC-9008', 'reached_items',  200, 2, 0, 0, 'https://www.nhstayside.scot.nhs.uk/news'),
  ('SRC-9009', 'reached_items',  200, 3, 0, 0, 'https://www.ssen-transmission.co.uk/news'),
  ('SRC-9010', 'reached_empty',  200, 0, 0, 1, 'https://www.subseauk.com/news'),
  ('SRC-9011', 'reached_items',  200, 1, 0, 0, 'https://techscotland.com'),
  ('SRC-9012', 'reached_items',  200, 1, 0, 0, 'https://www.contractsfinder.service.gov.uk/scotland'),
  ('SRC-9013', 'reached_items',  200, 1, 0, 0, 'https://highlandenergy.co'),
  ('SRC-9014', 'reached_items',  200, 1, 0, 0, 'https://dundeeinnovation.com/news'),
  ('SRC-9015', 'reached_items',  200, 0, 0, 0, 'https://www.scottish-enterprise.com/news')
) as v(code, outcome, http, cand, parse, streak, url)
where src.code = v.code;

-- ─── Candidates ──────────────────────────────────────────────
-- A mix of triage states from the current run.
with run as (select id, code from public.sweep_runs where code in ('RR-9040','RR-9041')),
     src as (select code, id, stream_id, layer from public.discovery_sources where code like 'SRC-9%')
insert into public.candidates
  (code, sweep_run_id, source_id, stream_id, layer,
   working_headline, primary_url, dedup_state, verification_state,
   triage_state, risk, score, recommended_option, surfaced_at)
select v.code, run.id, src.id, src.stream_id, src.layer,
       v.headline, v.url,
       v.dedup::candidate_dedup_state,
       v.verify::candidate_verification_state,
       v.triage::candidate_triage_state,
       v.risk::candidate_risk,
       v.score, v.opt,
       now() - (v.minutes_ago || ' minutes')::interval
from src,
     run,
(values
  -- Current PM run (RR-9041) — fresh
  ('REC-9101', 'RR-9041', 'SRC-9001', 'Skyrora confirms next Shetland test campaign window',                            'https://example.com/skyrora-window',     'clear',        'verified',  'ready',         'low',  0.86, 1,  4),
  ('REC-9102', 'RR-9041', 'SRC-9001', 'Skyrora hiring spree signals scale-up — 38 roles posted',                        'https://example.com/skyrora-hires',     'clear',        'pending',   'ready',         'low',  0.71, 2,  3),
  ('REC-9103', 'RR-9041', 'SRC-9002', 'BioQuarter signs three-year lease with stem-cell scale-up',                       'https://example.com/bioquarter-lease',  'clear',        'verified',  'ready',         'low',  0.78, 1,  6),
  ('REC-9104', 'RR-9041', 'SRC-9004', 'Snugg Ltd files updated share allotment at Companies House',                      'https://example.com/snugg-shares',      'duplicate',    'verified',  'held_dedup',    'med',  0.62, 3,  2),
  ('REC-9105', 'RR-9041', 'SRC-9004', 'Aberdeen-based Robotrak files for scheme of arrangement',                         'https://example.com/robotrak-scheme',   'clear',        'pending',   'needs_review', 'high', 0.52, 3,  2),
  ('REC-9106', 'RR-9041', 'SRC-9004', 'New incorporation: Pictish AI Holdings Ltd',                                      'https://example.com/pictish-ai',         'clear',        'pending',   'ready',         'low',  0.44, 2,  1),
  ('REC-9107', 'RR-9041', 'SRC-9004', 'TartanBio Ltd raises further capital — annual return shows new investors',        'https://example.com/tartanbio-cap',     'clear',        'pending',   'ready',         'low',  0.49, 2,  1),
  ('REC-9108', 'RR-9041', 'SRC-9005', 'Sapphire opens dedicated SOC in Glasgow — 60 hires planned',                      'https://example.com/sapphire-soc',      'clear',        'verified',  'ready',         'low',  0.83, 1,  5),
  ('REC-9109', 'RR-9041', 'SRC-9007', 'Pawprint Studios sold to Scandinavian games group',                               'https://example.com/pawprint-sale',     'pointer',      'verified',  'pointer',       'low',  0.91, 1,  6),
  ('REC-9110', 'RR-9041', 'SRC-9008', 'NHS Tayside extends AI triage pilot to Perth & Kinross',                          'https://example.com/tayside-extend',    'clear',        'verified',  'ready',         'med',  0.74, 1,  7),
  ('REC-9111', 'RR-9041', 'SRC-9008', 'Concerns raised by clinicians over expanded AI triage scope',                     'https://example.com/tayside-concerns',  'needs_review', 'unverified','needs_review', 'high', 0.58, 3,  5),
  ('REC-9112', 'RR-9041', 'SRC-9009', 'SSEN Transmission greenlights £180m Highland reinforcement project',              'https://example.com/ssen-greenlight',   'clear',        'verified',  'ready',         'low',  0.80, 1,  4),
  ('REC-9113', 'RR-9041', 'SRC-9009', 'Battery storage developer signs grid agreement with SSEN',                        'https://example.com/ssen-battery',      'clear',        'pending',   'ready',         'low',  0.66, 2,  4),
  ('REC-9114', 'RR-9041', 'SRC-9009', 'Local authority opposition emerges over substation siting',                       'https://example.com/ssen-siting',       'clear',        'pending',   'held_source',   'med',  0.55, 3,  3),
  ('REC-9115', 'RR-9041', 'SRC-9011', 'Strathclyde optimisation spinout closes seed round at £3m',                       'https://example.com/strath-spinout',    'clear',        'verified',  'sent_to_f1',    'low',  0.79, 1,  8),
  ('REC-9116', 'RR-9041', 'SRC-9012', 'MoD awards £24m subsea autonomy contract to Aberdeen firm',                       'https://example.com/mod-subsea',        'clear',        'verified',  'ready',         'med',  0.84, 1,  6),
  ('REC-9117', 'RR-9041', 'SRC-9013', 'Highland renewable firm signals job losses ahead of restructuring',               'https://example.com/highland-jobs',     'clear',        'pending',   'escalated',     'high', 0.61, 3,  2),
  ('REC-9118', 'RR-9041', 'SRC-9014', 'Dundee studio Pictographic prototypes generative cinematics tool',                'https://example.com/dundee-pictographic','clear',       'pending',   'ready',         'low',  0.57, 2,  1)
) as v(code, run_code, src_code, headline, url, dedup, verify, triage, risk, score, opt, minutes_ago)
where src.code = v.src_code and run.code = v.run_code;

-- ─── OPS-RR alerts ───────────────────────────────────────────
with src as (select code, id from public.discovery_sources where code like 'SRC-9%'),
     run as (select code, id from public.sweep_runs where code like 'RR-9%')
insert into public.ops_rr_alerts
  (code, source_id, sweep_run_id, severity, issue_type, status,
   description, sla_deadline_at, auto_raised, created_at)
select v.code, src.id, run.id,
       v.sev::ops_rr_severity, v.issue::ops_rr_issue_type, v.status::ops_rr_status,
       v.desc, now() + (v.sla_h || ' hours')::interval, true,
       now() - (v.age_min || ' minutes')::interval
from src, run,
(values
  ('OPS-RR-9001', 'SRC-9006', 'RR-9041', 'p1', 'unreachable',     'open',          'snugg.co.uk returning 503 for 7 consecutive sweeps. Likely cloudflare rule change.', 2, 8),
  ('OPS-RR-9002', 'SRC-9003', 'RR-9041', 'p2', 'parse_failure',   'investigating', 'Strathclyde news RSS schema changed — pubDate parse failure on 3/8 items.',         4, 12),
  ('OPS-RR-9003', 'SRC-9010', 'RR-9040', 'p3', 'volume_anomaly',  'open',          'Subsea cluster news count fell to zero across last two AM sweeps (avg 4).',         24, 270),
  ('OPS-RR-9004', 'SRC-9013', 'RR-9039', 'p2', 'rate_limit',      'deferred',      'Highland Energy Daily feed rate-limited at 60req/h. Awaiting whitelist response.',  48, 1020),
  ('OPS-RR-9005', 'SRC-9007', 'RR-9040', 'p3', 'wordpress_check', 'resolved',      'WP version 5.8 detected; recommended ≥6.0 for sitemap reliability. Site upgraded.', null, 580),
  ('OPS-RR-9006', 'SRC-9011', 'RR-9041', 'p2', 'schema_drift',    'open',          'TechScotland feed now omits <category> tag; stream classification weakens.',        6, 32),
  ('OPS-RR-9007', 'SRC-9009', 'RR-9040', 'p3', 'timeout',         'open',          'SSEN Transmission feed exceeded 12s timeout on 2/7 fetches this week.',             12, 195)
) as v(code, src_code, run_code, sev, issue, status, "desc", sla_h, age_min)
where src.code = v.src_code and run.code = v.run_code;

-- Update resolved_at for the resolved alert
update public.ops_rr_alerts
   set resolved_at = now() - interval '4 hours'
 where code = 'OPS-RR-9005';
