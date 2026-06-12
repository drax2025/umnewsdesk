-- ════════════════════════════════════════════════════════════════════════
-- A2 master content inventory — item 8
--
-- Source of truth for F4 interlinking and E7 (master content inventory
-- drift). Every article previously published across the Silicon Scotland
-- network — legacy import + native publish records — landed here.
--
-- F8 publishArticle writes a native_publish row on every successful push.
-- Editors can manually import legacy rows from the inventory screen.
-- ════════════════════════════════════════════════════════════════════════

create type article_inventory_source as enum (
  'legacy_import',  -- bulk-imported from siliconscotland_content_inventory_master.docx
  'native_publish', -- written by F8 publishArticle on a successful WordPress push
  'manual'          -- editor inserted by hand (rare)
);

create table public.master_content_inventory (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete restrict,
  silo text,
  headline text not null,
  url text not null,
  published_at date,
  sectors text[] not null default '{}',
  source article_inventory_source not null default 'legacy_import',
  article_id uuid references public.articles(id) on delete set null,
  notes text,
  imported_at timestamptz not null default now(),
  imported_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (url)
);

create index master_content_inventory_title_idx
  on public.master_content_inventory(title_id);
create index master_content_inventory_published_idx
  on public.master_content_inventory(published_at desc);
create index master_content_inventory_silo_idx
  on public.master_content_inventory(silo);
create index master_content_inventory_article_idx
  on public.master_content_inventory(article_id);

create trigger trg_master_content_inventory_updated
  before update on public.master_content_inventory
  for each row execute function public.set_updated_at();

alter table public.master_content_inventory enable row level security;

create policy "master_content_inventory_select_authenticated"
  on public.master_content_inventory for select
  using (auth.role() = 'authenticated');

create policy "master_content_inventory_write_editor"
  on public.master_content_inventory for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('editor', 'senior_editor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('editor', 'senior_editor')
    )
  );

comment on table public.master_content_inventory is
  'A2 master content inventory — every article previously published across the network. Source of truth for F4 interlinking + E7 drift detection.';
comment on column public.master_content_inventory.source is
  'Provenance: legacy_import (from .docx), native_publish (F8 write-back), or manual editor entry.';
comment on column public.master_content_inventory.article_id is
  'Back-pointer to public.articles for native_publish rows. Null for legacy imports.';
