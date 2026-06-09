-- ═══════════════════════════════════════════════════════════
-- Union Media Newsroom — v1 schema
-- Vertical slice B: profiles, titles, articles
-- ═══════════════════════════════════════════════════════════

-- ─── Enums ───────────────────────────────────────────────────
create type user_role as enum (
  'senior_editor',
  'editor',
  'reviewer',
  'viewer'
);

create type article_state as enum (
  'pitched',
  'commissioned',
  'filed',
  'subbed',
  'legal',
  'scheduled',
  'live',
  'rejected',
  'killed'
);

create type geo_tier as enum ('tier_1', 'tier_2', 'tier_3');

-- Placeholder names — rename in a later migration once finalised
create type article_frame as enum (
  'frame_1',
  'frame_2',
  'frame_3',
  'frame_4',
  'frame_5',
  'frame_6'
);

-- ─── profiles (1:1 with auth.users) ──────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── titles (publication silos) ──────────────────────────────
create table public.titles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text,
  created_at timestamptz not null default now()
);

-- ─── articles ────────────────────────────────────────────────
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete restrict,
  slug text,
  headline text not null,
  standfirst text,
  body text,
  state article_state not null default 'pitched',
  primary_frame article_frame,
  geo_tier geo_tier,
  sectors text[] not null default '{}',
  author_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (title_id, slug)
);

create index articles_state_idx on public.articles(state);
create index articles_title_state_idx on public.articles(title_id, state);
create index articles_updated_idx on public.articles(updated_at desc);

-- ─── Triggers ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger articles_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════
alter table public.profiles enable row level security;
alter table public.titles   enable row level security;
alter table public.articles enable row level security;

-- profiles: any authenticated user can read; users can update only their own row
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- titles: any authenticated user can read
create policy "titles_select_authenticated"
  on public.titles for select
  to authenticated using (true);

-- articles: any authenticated user can read; editors+ can insert/update; senior_editor can delete
create policy "articles_select_authenticated"
  on public.articles for select
  to authenticated using (true);

create policy "articles_insert_editor"
  on public.articles for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('senior_editor', 'editor')
    )
  );

create policy "articles_update_editor"
  on public.articles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('senior_editor', 'editor')
    )
  );

create policy "articles_delete_senior_editor"
  on public.articles for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'senior_editor'
    )
  );

-- ═══════════════════════════════════════════════════════════
-- Seed
-- ═══════════════════════════════════════════════════════════
insert into public.titles (slug, name, domain)
values ('silicon-scotland', 'Silicon Scotland', 'siliconscotland.news')
on conflict (slug) do nothing;
