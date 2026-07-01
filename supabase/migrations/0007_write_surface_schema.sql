-- ═══════════════════════════════════════════════════════════
-- Vertical slice E: Write surface + Approvals
--
-- Tables:  article_revisions, approval_decisions
-- Adds:    articles.legal_cleared_at, articles.legal_cleared_by,
--          articles.sub_cleared_at,   articles.sub_cleared_by
-- Enum:    approval_decision_kind
--
-- NOTE: Rewritten to be idempotent and to use the CURRENT role model
-- (admin/editor). The original policies gated on the retired `senior_editor`
-- role, which is no longer a valid `user_role` enum label — replaying the old
-- version now fails at policy creation. See PROJECT_NOTES ("Applied missing
-- migration 0007"): this migration had never been applied to the live project
-- and there is no supabase_migrations tracking table, so this file is the
-- source of truth for a fresh rebuild.
-- ═══════════════════════════════════════════════════════════

do $$ begin
  create type approval_decision_kind as enum ('approve', 'reject', 'request_revision');
exception when duplicate_object then null;
end $$;

-- ─── article_revisions ───────────────────────────────────────
-- Append-only history of writeable fields (headline/standfirst/body).
-- A new row is inserted on every save by the saveArticleDraft action.
create table if not exists public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  revision_no int not null,
  headline text not null,
  standfirst text,
  body text,
  summary text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_id, revision_no)
);

create index if not exists article_revisions_article_idx
  on public.article_revisions(article_id, revision_no desc);
create index if not exists article_revisions_created_idx
  on public.article_revisions(created_at desc);

-- ─── approval_decisions ──────────────────────────────────────
-- Decision log entries. One row per gate decision.
create table if not exists public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  from_state article_state not null,
  to_state article_state not null,
  kind approval_decision_kind not null,
  rationale text not null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz not null default now()
);

create index if not exists approval_decisions_article_idx
  on public.approval_decisions(article_id, decided_at desc);
create index if not exists approval_decisions_decided_idx
  on public.approval_decisions(decided_at desc);

-- ─── articles: clearance flags ───────────────────────────────
alter table public.articles
  add column if not exists sub_cleared_at   timestamptz,
  add column if not exists sub_cleared_by   uuid references public.profiles(id) on delete set null,
  add column if not exists legal_cleared_at timestamptz,
  add column if not exists legal_cleared_by uuid references public.profiles(id) on delete set null;

create index if not exists articles_legal_cleared_idx
  on public.articles(legal_cleared_at)
  where legal_cleared_at is not null;

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.article_revisions  enable row level security;
alter table public.approval_decisions enable row level security;

drop policy if exists "article_revisions_select" on public.article_revisions;
create policy "article_revisions_select"
  on public.article_revisions for select
  to authenticated using (true);

drop policy if exists "article_revisions_insert_editor" on public.article_revisions;
create policy "article_revisions_insert_editor"
  on public.article_revisions for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role in ('editor', 'admin'))
  );

drop policy if exists "approval_decisions_select" on public.approval_decisions;
create policy "approval_decisions_select"
  on public.approval_decisions for select
  to authenticated using (true);

-- Only admins can record approval decisions (was senior_editor).
drop policy if exists "approval_decisions_insert_senior" on public.approval_decisions;
drop policy if exists "approval_decisions_insert_admin" on public.approval_decisions;
create policy "approval_decisions_insert_admin"
  on public.approval_decisions for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role = 'admin')
  );
