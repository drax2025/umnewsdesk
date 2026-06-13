-- ════════════════════════════════════════════════════════════════════════════
-- 0034_role_menu_permissions.sql
--
-- Granular per-role visibility + read-only control for left-hand nav items.
--
-- Why store this in the DB rather than hardcoding:
--   - The editor-in-chief wants to dial visibility per role without redeploying.
--   - The same shape will be reused when role-aware writes get wired into
--     individual pages (a `read_only` row will gate write actions there).
--
-- Schema:
--   role      — existing user_role enum (senior_editor, editor, reviewer, viewer)
--   menu_key  — stable slug for a nav item (see src/lib/spec/menu-permissions.ts
--               for the canonical MENU_CATALOG). Decoupled from label + href so
--               renaming "Article Dossier" → "Stories" doesn't reset config.
--   access    — 'hidden' | 'read_only' | 'full'.
--
-- The code-side resolver (`resolveAccess`) hardcodes senior_editor → full
-- for every menu_key as a safety net, so a misconfigured row can never lock
-- the publisher out of their own permissions screen. Seeds match that —
-- senior_editor rows are seeded as 'full' for every key.
--
-- Defaults (seeded below):
--   senior_editor — full everywhere
--   editor        — full on Overview / Editorial / Management / Discovery,
--                   hidden on System (including this permissions page)
--   reviewer      — read_only on Overview + Editorial; hidden on the rest
--   viewer        — read_only on Overview; hidden on the rest
--
-- Senior Editor can adjust any cell from /system/permissions.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Table ──────────────────────────────────────────────────────────────────

create table if not exists public.role_menu_permissions (
  role        public.user_role not null,
  menu_key    text             not null,
  access      text             not null
              check (access in ('hidden', 'read_only', 'full')),
  updated_at  timestamptz      not null default now(),
  updated_by  uuid             references auth.users(id) on delete set null,
  primary key (role, menu_key)
);

comment on table public.role_menu_permissions is
  'Per-role visibility + read-only control for each left-hand nav item. Edited from /system/permissions by Senior Editor. Senior Editor access is always resolved to ''full'' in code regardless of row state to prevent lockout.';


-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Read: any authenticated user — the sidebar needs to evaluate visibility on
-- every (app) render for the current user's role.
-- Write: service_role only. The server actions in
-- src/lib/actions/menu-permissions.ts run as service_role after re-checking
-- the caller is senior_editor.

alter table public.role_menu_permissions enable row level security;

drop policy if exists "role_menu_permissions_read" on public.role_menu_permissions;
create policy "role_menu_permissions_read"
  on public.role_menu_permissions
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for authenticated — service_role bypasses
-- RLS and is the only producer.


-- ─── Seed defaults ──────────────────────────────────────────────────────────
--
-- The list of menu_keys MUST stay in sync with MENU_CATALOG in
-- src/lib/spec/menu-permissions.ts. If you add a nav item there, add it
-- here too and run this migration in dev.
--
-- ON CONFLICT DO NOTHING keeps existing edits intact — re-running the
-- migration is safe and acts as an "add new keys with sensible defaults"
-- pass rather than wiping the publisher's customisations.

insert into public.role_menu_permissions (role, menu_key, access) values
  -- ── Senior Editor — full on every key (also enforced in code) ──────────
  ('senior_editor', 'dashboard',              'full'),
  ('senior_editor', 'pipeline',               'full'),
  ('senior_editor', 'board',                  'full'),
  ('senior_editor', 'commissioning',          'full'),
  ('senior_editor', 'calendar',               'full'),
  ('senior_editor', 'article_dossier',        'full'),
  ('senior_editor', 'inventory',              'full'),
  ('senior_editor', 'opportunities',          'full'),
  ('senior_editor', 'f5_edit_preview',        'full'),
  ('senior_editor', 'approvals',              'full'),
  ('senior_editor', 'pre_publish',            'full'),
  ('senior_editor', 'd_reject_queue',         'full'),
  ('senior_editor', 'corrections',            'full'),
  ('senior_editor', 'd0_escalation',          'full'),
  ('senior_editor', 'team',                   'full'),
  ('senior_editor', 'press_agencies',         'full'),
  ('senior_editor', 'discovery_overview',     'full'),
  ('senior_editor', 'candidate_inbox',        'full'),
  ('senior_editor', 'ops_rr_queue',           'full'),
  ('senior_editor', 'sweep_run_detail',       'full'),
  ('senior_editor', 'system_titles',          'full'),
  ('senior_editor', 'system_discovery_config','full'),
  ('senior_editor', 'system_source_health',   'full'),
  ('senior_editor', 'system_audit_log',       'full'),
  ('senior_editor', 'system_test_ingest',     'full'),
  ('senior_editor', 'system_design',          'full'),
  ('senior_editor', 'system_settings',        'full'),
  ('senior_editor', 'system_permissions',     'full'),

  -- ── Editor — Editorial/Management/Discovery; System hidden ──────────────
  ('editor',        'dashboard',              'full'),
  ('editor',        'pipeline',               'full'),
  ('editor',        'board',                  'full'),
  ('editor',        'commissioning',          'full'),
  ('editor',        'calendar',               'full'),
  ('editor',        'article_dossier',        'full'),
  ('editor',        'inventory',              'full'),
  ('editor',        'opportunities',          'full'),
  ('editor',        'f5_edit_preview',        'full'),
  ('editor',        'approvals',              'full'),
  ('editor',        'pre_publish',            'full'),
  ('editor',        'd_reject_queue',         'full'),
  ('editor',        'corrections',            'full'),
  ('editor',        'd0_escalation',          'full'),
  ('editor',        'team',                   'read_only'),
  ('editor',        'press_agencies',         'full'),
  ('editor',        'discovery_overview',     'full'),
  ('editor',        'candidate_inbox',        'full'),
  ('editor',        'ops_rr_queue',           'full'),
  ('editor',        'sweep_run_detail',       'full'),
  ('editor',        'system_titles',          'hidden'),
  ('editor',        'system_discovery_config','hidden'),
  ('editor',        'system_source_health',   'hidden'),
  ('editor',        'system_audit_log',       'hidden'),
  ('editor',        'system_test_ingest',     'hidden'),
  ('editor',        'system_design',          'hidden'),
  ('editor',        'system_settings',        'hidden'),
  ('editor',        'system_permissions',     'hidden'),

  -- ── Reviewer — read-only on Editorial; can act on Approvals/Corrections ─
  ('reviewer',      'dashboard',              'read_only'),
  ('reviewer',      'pipeline',               'read_only'),
  ('reviewer',      'board',                  'read_only'),
  ('reviewer',      'commissioning',          'hidden'),
  ('reviewer',      'calendar',               'read_only'),
  ('reviewer',      'article_dossier',        'read_only'),
  ('reviewer',      'inventory',              'read_only'),
  ('reviewer',      'opportunities',          'hidden'),
  ('reviewer',      'f5_edit_preview',        'hidden'),
  ('reviewer',      'approvals',              'full'),
  ('reviewer',      'pre_publish',            'read_only'),
  ('reviewer',      'd_reject_queue',         'full'),
  ('reviewer',      'corrections',            'full'),
  ('reviewer',      'd0_escalation',          'read_only'),
  ('reviewer',      'team',                   'hidden'),
  ('reviewer',      'press_agencies',         'read_only'),
  ('reviewer',      'discovery_overview',     'read_only'),
  ('reviewer',      'candidate_inbox',        'read_only'),
  ('reviewer',      'ops_rr_queue',           'read_only'),
  ('reviewer',      'sweep_run_detail',       'read_only'),
  ('reviewer',      'system_titles',          'hidden'),
  ('reviewer',      'system_discovery_config','hidden'),
  ('reviewer',      'system_source_health',   'hidden'),
  ('reviewer',      'system_audit_log',       'hidden'),
  ('reviewer',      'system_test_ingest',     'hidden'),
  ('reviewer',      'system_design',          'hidden'),
  ('reviewer',      'system_settings',        'hidden'),
  ('reviewer',      'system_permissions',     'hidden'),

  -- ── Viewer — read-only on Overview, hidden elsewhere ───────────────────
  ('viewer',        'dashboard',              'read_only'),
  ('viewer',        'pipeline',               'read_only'),
  ('viewer',        'board',                  'read_only'),
  ('viewer',        'commissioning',          'hidden'),
  ('viewer',        'calendar',               'read_only'),
  ('viewer',        'article_dossier',        'read_only'),
  ('viewer',        'inventory',              'read_only'),
  ('viewer',        'opportunities',          'hidden'),
  ('viewer',        'f5_edit_preview',        'hidden'),
  ('viewer',        'approvals',              'hidden'),
  ('viewer',        'pre_publish',            'hidden'),
  ('viewer',        'd_reject_queue',         'hidden'),
  ('viewer',        'corrections',            'hidden'),
  ('viewer',        'd0_escalation',          'hidden'),
  ('viewer',        'team',                   'hidden'),
  ('viewer',        'press_agencies',         'hidden'),
  ('viewer',        'discovery_overview',     'hidden'),
  ('viewer',        'candidate_inbox',        'hidden'),
  ('viewer',        'ops_rr_queue',           'hidden'),
  ('viewer',        'sweep_run_detail',       'hidden'),
  ('viewer',        'system_titles',          'hidden'),
  ('viewer',        'system_discovery_config','hidden'),
  ('viewer',        'system_source_health',   'hidden'),
  ('viewer',        'system_audit_log',       'hidden'),
  ('viewer',        'system_test_ingest',     'hidden'),
  ('viewer',        'system_design',          'hidden'),
  ('viewer',        'system_settings',        'hidden'),
  ('viewer',        'system_permissions',     'hidden')
on conflict (role, menu_key) do nothing;


-- ─── PostgREST schema reload ────────────────────────────────────────────────
notify pgrst, 'reload schema';
