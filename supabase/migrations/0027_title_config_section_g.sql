-- ============================================================================
-- 0027_title_config_section_g.sql
-- A7 / Section G — per-title configuration substrate.
--
-- Extends public.titles with the configuration the editorial pipeline needs
-- to behave correctly per publication silo:
--
--   - Brand / display:      tagline, primary_color, default_frame
--   - WordPress connection: wp_base_url, wp_username, wp_app_password,
--                           wp_default_status, wp_default_category_id
--   - Editorial defaults:   default_sectors[], silo_options[],
--                           default_geo_tier, slug_prefix
--   - Operational:          is_active (phase-2 toggle), launched_at,
--                           weekly_issue_day (0=Sun..6=Sat)
--   - Free-form:            config jsonb for less-structured per-title bits
--   - Audit:                config_updated_at, config_updated_by
--
-- All net-new columns are nullable / defaulted so existing titles keep
-- working. wp_app_password is treated as a secret — the UI scrubs reads to
-- "••• set" / "(none)" but stores plaintext (Supabase column-level RLS would
-- be the next hardening step).
-- ============================================================================

alter table public.titles
  add column if not exists tagline text,
  add column if not exists primary_color text,
  add column if not exists default_frame article_frame,
  add column if not exists wp_base_url text,
  add column if not exists wp_username text,
  add column if not exists wp_app_password text,
  add column if not exists wp_default_status text,
  add column if not exists wp_default_category_id integer,
  add column if not exists default_sectors text[] not null default '{}',
  add column if not exists silo_options text[] not null default '{}',
  add column if not exists default_geo_tier geo_tier,
  add column if not exists slug_prefix text,
  add column if not exists is_active boolean not null default true,
  add column if not exists launched_at date,
  add column if not exists weekly_issue_day smallint,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists config_updated_at timestamptz,
  add column if not exists config_updated_by uuid references public.profiles(id);

-- Status sanity (publish / draft / future only). Stored as text to avoid an
-- enum churn — F8 already accepts these literals.
alter table public.titles
  drop constraint if exists titles_wp_default_status_check;
alter table public.titles
  add constraint titles_wp_default_status_check
  check (
    wp_default_status is null
    or wp_default_status in ('publish', 'draft', 'future')
  );

-- weekly_issue_day is 0..6 (Sun..Sat) — Friday sweeps use this.
alter table public.titles
  drop constraint if exists titles_weekly_issue_day_check;
alter table public.titles
  add constraint titles_weekly_issue_day_check
  check (weekly_issue_day is null or weekly_issue_day between 0 and 6);

-- Index for the active-titles filter on per-title surfaces.
create index if not exists titles_is_active_idx
  on public.titles (is_active);

-- updated_at trigger — only if titles doesn't already have one.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'titles_updated_at'
  ) then
    -- titles has no updated_at column yet; add it.
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'titles'
         and column_name = 'updated_at'
    ) then
      alter table public.titles
        add column updated_at timestamptz not null default now();
    end if;
    create trigger titles_updated_at
      before update on public.titles
      for each row execute function public.set_updated_at();
  end if;
end$$;

-- ─── RLS — senior editor write, editor + viewer select ────────────────────
-- Existing RLS on titles already allows authenticated select (set in 0001).
-- Add explicit policies for update so seniors can edit configuration.

drop policy if exists titles_update_senior on public.titles;
create policy titles_update_senior
  on public.titles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'senior_editor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'senior_editor'
    )
  );

drop policy if exists titles_insert_senior on public.titles;
create policy titles_insert_senior
  on public.titles for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'senior_editor'
    )
  );
