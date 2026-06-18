-- ════════════════════════════════════════════════════════════════════════════
-- 0037_branding_app_settings.sql
--
-- Generic app configuration + a public-facing branding asset bucket. The first
-- use is a custom login-screen wallpaper that a Senior Editor can upload.
--
-- app_settings is a keyed singleton store (key text PK, value jsonb). Public
-- read is scoped to the 'login_wallpaper' key only — the /login page is
-- unauthenticated and must be able to fetch it, but we don't want to leak any
-- future (potentially sensitive) settings to anon.
--
-- branding bucket: public-read so the <img> on the unauthenticated login page
-- renders without a signed URL. Writes are Senior-Editor only.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── app_settings ───────────────────────────────────────────────────────────

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

comment on table public.app_settings is
  'Keyed singleton app configuration. value is JSONB. Currently holds login_wallpaper ({ url, overlay }). Public read is scoped per-key (see policies) so future private settings don''t leak to anon.';

alter table public.app_settings enable row level security;

-- Public (anon + authenticated) read for ONLY the login wallpaper key.
drop policy if exists "app_settings_public_login_wallpaper" on public.app_settings;
create policy "app_settings_public_login_wallpaper"
  on public.app_settings for select
  to public
  using (key = 'login_wallpaper');

-- Authenticated staff can read everything (the settings page).
drop policy if exists "app_settings_select_auth" on public.app_settings;
create policy "app_settings_select_auth"
  on public.app_settings for select
  to authenticated
  using (true);

-- Writes: Senior Editors only. The server action also gates + uses the
-- service-role client, but this is defence in depth.
drop policy if exists "app_settings_write_senior" on public.app_settings;
create policy "app_settings_write_senior"
  on public.app_settings for all
  to authenticated
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role = 'senior_editor')
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role = 'senior_editor')
  );


-- ─── branding storage bucket ────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read: anyone (the login page <img>).
drop policy if exists "branding_read" on storage.objects;
create policy "branding_read"
  on storage.objects for select
  to public
  using (bucket_id = 'branding');

-- Write / update / delete: Senior Editors only. The browser uploads directly
-- with the editor's own session, so this policy gates that path.
drop policy if exists "branding_write_senior" on storage.objects;
create policy "branding_write_senior"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'branding'
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'senior_editor')
  )
  with check (
    bucket_id = 'branding'
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'senior_editor')
  );


-- ─── PostgREST schema reload ────────────────────────────────────────────────
notify pgrst, 'reload schema';
