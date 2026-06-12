-- ════════════════════════════════════════════════════════════════════════════
-- 0031_geo_tier_origin_labels.sql
--
-- Align the geo_tier enum with the Section G spec.
--
-- The initial schema (0001) used generic labels ('tier_1', 'tier_2', 'tier_3'),
-- but the editorial framework moved to origin-based labels:
--
--   tier_1  → scottish_origin   (Scottish origin)
--   tier_2  → uk_origin         (UK origin — find Scottish hook)
--   tier_3  → global_origin     (Global origin — anchor Scottish stake)
--
-- The TypeScript spec at src/lib/spec/a7-title-config.ts has been on the new
-- labels for some time; the A7 / Section G title-config save was throwing
-- "invalid input value for enum geo_tier: 'scottish_origin'" because the
-- enum still held the old strings. Renaming is the safe path — PostgreSQL
-- rewrites the catalog in-place, so existing rows that hold a value continue
-- to hold it under the new label without a row rewrite.
--
-- Idempotent: each rename is guarded by a catalog lookup so re-running the
-- migration is a no-op once the new labels are in place.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'geo_tier' and e.enumlabel = 'tier_1'
  ) then
    alter type geo_tier rename value 'tier_1' to 'scottish_origin';
  end if;

  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'geo_tier' and e.enumlabel = 'tier_2'
  ) then
    alter type geo_tier rename value 'tier_2' to 'uk_origin';
  end if;

  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'geo_tier' and e.enumlabel = 'tier_3'
  ) then
    alter type geo_tier rename value 'tier_3' to 'global_origin';
  end if;
end$$;

-- PostgREST caches the enum labels in its schema cache. Force a reload so the
-- new labels are immediately accepted by the REST API.
notify pgrst, 'reload schema';
