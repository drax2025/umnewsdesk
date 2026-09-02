-- ═══════════════════════════════════════════════════════════
-- Newsroom V1 publishes; News Desk does not. These columns held a
-- second, complete set of WordPress application passwords for the same
-- five sites V1 already publishes to.
--
-- An unused credential is worse than a missing one: nobody rotates it,
-- nobody notices when it stops matching, and it is one more place a leak
-- can come from. The UI that read and wrote them is gone as of Phase 3,
-- so nothing here can be re-entered by accident either.
--
-- The columns are kept, not dropped. Nulling is reversible if a title
-- ever needs its own endpoint again; a dropped column is not, and V1
-- holds the live values in any case.
-- ═══════════════════════════════════════════════════════════

update public.titles
set wp_app_password    = null,
    wp_username        = null,
    wp_base_url        = null,
    wp_default_status  = null,
    wp_default_category_id = null
where wp_app_password is not null
   or wp_username is not null
   or wp_base_url is not null;

comment on column public.titles.wp_app_password is
  'Unused since Phase 3 — Newsroom V1 owns publishing and holds the live credential.';
