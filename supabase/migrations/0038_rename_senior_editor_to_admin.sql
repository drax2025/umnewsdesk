-- ════════════════════════════════════════════════════════════════════════════
-- 0038_rename_senior_editor_to_admin.sql
--
-- Rename the top role from 'senior_editor' to 'admin'.
--
-- This is a metadata-only relabel of the enum value. Because every reference —
-- profiles.role, role_menu_permissions.role, and every RLS policy literal
-- (`role = 'senior_editor'`, `role in ('senior_editor', 'editor')`) — resolves
-- the value by its internal identity rather than its text label, all existing
-- rows and policies follow the rename automatically:
--
--   * Existing senior_editor users become 'admin' with no row update.
--   * role_menu_permissions rows keyed on the enum re-point to 'admin'.
--   * RLS policies keep gating on the same value, now labelled 'admin'.
--
-- No text casts of `role` exist anywhere in the schema (verified), so there is
-- nothing that compares the label as a string and would silently stop matching.
--
-- ⚠️ DEPLOY ORDERING: the application code that checks for the 'admin' role must
-- go live in sync with this migration. Between the two, admins are evaluated
-- against the other value and temporarily lose admin-only access. Run this
-- right alongside the deploy.
--
-- Note: PostgreSQL does not allow ALTER TYPE ... RENAME VALUE inside a
-- transaction block in older versions; Supabase's migration runner executes
-- this fine as a standalone statement.
-- ════════════════════════════════════════════════════════════════════════════

alter type public.user_role rename value 'senior_editor' to 'admin';

-- Refresh the comment to match the new vocabulary.
comment on table public.role_menu_permissions is
  'Per-role visibility + read-only control for each left-hand nav item. Edited from /system/permissions by an Admin. Admin access is always resolved to ''full'' in code regardless of row state to prevent lockout.';

notify pgrst, 'reload schema';
