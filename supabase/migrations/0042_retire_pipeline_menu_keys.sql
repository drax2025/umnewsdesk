-- ═══════════════════════════════════════════════════════════
-- Phase 3 retires V2's editorial pipeline: the newsroom does the
-- editing and publishing, News Desk stops at discovery.
--
-- The screens are gone from NAV_SECTIONS, so these rows can no longer
-- be reached, edited or reasoned about — the permissions editor renders
-- from the nav catalog, so a key with no nav item is invisible but still
-- returned by any query that reads the table. Left in place they would
-- be a permanent puzzle: rows granting access to things that do not exist.
--
-- The table itself and every remaining key are untouched. Deleting a row
-- here removes a grant, never a person's account or role.
-- ═══════════════════════════════════════════════════════════

delete from public.role_menu_permissions
where menu_key in (
  'pipeline',
  'board',
  'commissioning',
  'calendar',
  'article_dossier',
  'inventory',
  'opportunities',
  'f5_edit_preview',
  'approvals',
  'pre_publish',
  'd_reject_queue',
  'corrections',
  'd0_escalation',
  -- Never had a route: /system/design was in the nav but no page was
  -- ever built, so this key has only ever guarded a 404.
  'system_design'
);
