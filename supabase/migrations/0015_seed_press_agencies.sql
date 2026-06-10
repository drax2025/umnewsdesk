-- Seed ~20 known UK PR agencies + comms teams (June 2026).
--
-- Idempotent: deletes any rows with a matching name first so re-running
-- the migration heals any manual edits a senior editor made via /team/agencies
-- (Phase 2 UI). For now, edits to existing rows survive because this seed
-- only ever inserts the 20 names below.
--
-- trust_tier semantics:
--   1 = known good — auto-progress through the unverified gate
--   2 = default
--   3 = watch — surface in the unverified inbox for one-click confirmation

delete from public.press_agencies
where name in (
  'The PC Agency',
  'Clark Communications',
  'Fifth Ring',
  '24 Keys',
  'Aberdeen City Council',
  'OJ PR',
  'Tiger Bond',
  'Aberdeen PLC',
  'Aberdeen Inspired',
  'Big Partnership',
  'Muckle Media',
  'FRPR',
  'Aspectus Group',
  'Granite PR',
  'Ross Creative Communications',
  'Vermillion PR',
  'Bold Street Media',
  'Sport Aberdeen',
  'OGV Energy',
  'Scottish Parliament'
);

insert into public.press_agencies (name, email_domains, trust_tier) values
  ('The PC Agency',                 array['pc.agency'],                              2),
  ('Clark Communications',          array['clarkcommunications.co.uk'],              2),
  ('Fifth Ring',                    array['fifthring.com'],                          2),
  ('24 Keys',                       array['24keys.co.uk'],                           2),
  ('Aberdeen City Council',         array['aberdeencity.gov.uk'],                    2),
  ('OJ PR',                         array['ojpr.co.uk'],                             2),
  ('Tiger Bond',                    array['tigerbond.com'],                          1),
  ('Aberdeen PLC',                  array['aberdeenplc.com'],                        2),
  ('Aberdeen Inspired',             array['aberdeeninspired.com'],                   2),
  ('Big Partnership',               array['bigpartnership.co.uk'],                   2),
  ('Muckle Media',                  array['mucklemediagroup.co.uk'],                 2),
  ('FRPR',                          array['frpr.co.uk'],                             2),
  ('Aspectus Group',                array['aspectusgroup.com'],                      2),
  ('Granite PR',                    array['granitepr.co.uk'],                        2),
  ('Ross Creative Communications',  array['rosscreativecommunications.com'],         2),
  ('Vermillion PR',                 array['vermillionpr.co.uk'],                     2),
  ('Bold Street Media',             array['boldstmedia.com'],                        2),
  ('Sport Aberdeen',                array['sportaberdeen.co.uk'],                    2),
  ('OGV Energy',                    array['ogvenergy.co.uk'],                        2),
  ('Scottish Parliament',           array['parliament.scot'],                        2);
