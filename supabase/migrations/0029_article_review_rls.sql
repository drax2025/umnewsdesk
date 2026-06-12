-- F6 article_review RLS — fix the read-blackhole.
--
-- 0018 created article_review without explicitly enabling RLS, but the
-- Supabase project has RLS-by-default turned on at the dashboard level.
-- So writes from the service client (which bypasses RLS) succeed and the
-- row lands in the table, but every SSR read from the user's session
-- client returns null because no SELECT policy exists.
--
-- Symptom: the F6 verdict roll-up at the top of /articles/[id]/review
-- always showed 11 PENDING even though the gate rows had been saved.
-- The diagnostic in stampTier1Defaults proved the row existed: same
-- service client did the upsert AND read-back, both saw the right data.
-- Only the page render via createClient() saw null.
--
-- Fix: enable RLS explicitly + add an authenticated SELECT policy. All
-- writes already route through service-role actions in lib/actions/review.ts
-- so we deliberately do NOT add INSERT/UPDATE/DELETE policies — the
-- service client bypasses them and we keep write authority in code where
-- the editor/senior_editor role check lives.
--
-- This matches the pattern used by article_corrections (migration 0028).

alter table public.article_review enable row level security;

drop policy if exists article_review_select on public.article_review;
create policy article_review_select
  on public.article_review for select
  to authenticated using (true);

comment on policy article_review_select on public.article_review is
  'F6 review rows are visible to every signed-in user. Writes are funnelled through service-role actions that gate on profiles.role; no INSERT/UPDATE policies on purpose.';
