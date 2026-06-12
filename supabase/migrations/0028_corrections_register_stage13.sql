-- ============================================================================
-- 0028_corrections_register_stage13.sql
-- Stage 13 — Corrections Register.
--
-- Once an article is live, factual mistakes, clarifications, updates, or
-- (worst case) full retractions must be filed through a controlled
-- workflow:
--
--   1. Editor files a draft correction citing what was wrong, the source
--      of the correction, and the public-facing notice text.
--   2. Senior Editor approves (or withdraws). Approved corrections are
--      timestamped, append a public notice to the article, and notify the
--      reader-facing pipeline (correction tag, footer block, etc.).
--   3. Original copy is preserved in fields_changed.before for audit.
--
-- Per Reasonable Steps Doctrine: no silent edits. Every correction is a
-- discrete row with full attribution.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'correction_kind') then
    create type correction_kind as enum (
      'correction',     -- factual error
      'clarification',  -- ambiguous wording, no factual change
      'update',         -- post-publication development (with timestamp)
      'retraction'      -- full withdrawal of article
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'correction_status') then
    create type correction_status as enum (
      'draft',         -- editor filed, awaiting senior approval
      'approved',      -- senior-approved, live on reader-facing surfaces
      'withdrawn'      -- senior pulled (editor over-zealous, or duplicate)
    );
  end if;
end$$;

create table if not exists public.article_corrections (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete restrict,
  kind correction_kind not null,
  status correction_status not null default 'draft',

  -- Editor-supplied: what was wrong, source of fix, public notice.
  description text not null,
  source text,
  public_notice text not null,

  -- Optional structured before/after diff for the audit trail.
  fields_changed jsonb not null default '{}'::jsonb,

  -- Audit
  filed_by uuid references public.profiles(id),
  filed_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  withdrawn_by uuid references public.profiles(id),
  withdrawn_at timestamptz,
  withdrawn_reason text,

  -- Numbered per article so the notice can read "Correction #2 — ...".
  sequence smallint not null,

  updated_at timestamptz not null default now(),

  unique (article_id, sequence)
);

create index if not exists article_corrections_article_idx
  on public.article_corrections (article_id, sequence desc);
create index if not exists article_corrections_title_status_idx
  on public.article_corrections (title_id, status);
create index if not exists article_corrections_filed_at_idx
  on public.article_corrections (filed_at desc);

drop trigger if exists article_corrections_updated_at
  on public.article_corrections;
create trigger article_corrections_updated_at
  before update on public.article_corrections
  for each row execute function public.set_updated_at();

alter table public.article_corrections enable row level security;

drop policy if exists article_corrections_select on public.article_corrections;
create policy article_corrections_select
  on public.article_corrections for select
  to authenticated using (true);

drop policy if exists article_corrections_insert on public.article_corrections;
create policy article_corrections_insert
  on public.article_corrections for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('editor', 'senior_editor')
    )
  );

drop policy if exists article_corrections_update on public.article_corrections;
create policy article_corrections_update
  on public.article_corrections for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('editor', 'senior_editor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('editor', 'senior_editor')
    )
  );

drop policy if exists article_corrections_delete on public.article_corrections;
create policy article_corrections_delete
  on public.article_corrections for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'senior_editor'
    )
  );

-- Stage 13 also adds a denormalised "has corrections" flag on articles so
-- the dossier / inventory surfaces can show it without a join.
alter table public.articles
  add column if not exists corrections_count smallint not null default 0,
  add column if not exists last_correction_at timestamptz;
