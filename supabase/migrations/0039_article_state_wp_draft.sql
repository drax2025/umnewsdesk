-- ════════════════════════════════════════════════════════════════════════════
-- 0039_article_state_wp_draft.sql
--
-- Add a distinct 'wp_draft' article state: the article has been pushed to
-- WordPress as a draft (released from the newsroom) but is NOT publicly live.
--
-- Why a new state rather than reusing 'live':
--   'live' means publicly published — it gates corrections eligibility, stamps
--   published_at, and writes the A2 master content inventory. A WP draft has no
--   public URL yet, so marking it 'live' would seed reporting/inventory with a
--   non-public article and allow public corrections against it. 'wp_draft' sits
--   between 'scheduled' and 'live': handed to WordPress, awaiting WP-side
--   publish. A subsequent "Publish to WordPress" push promotes it to 'live'.
--
-- Placed AFTER 'scheduled' so the enum sort order tracks the pipeline order
-- (… scheduled → wp_draft → live).
-- ════════════════════════════════════════════════════════════════════════════

alter type public.article_state add value if not exists 'wp_draft' after 'scheduled';

notify pgrst, 'reload schema';
