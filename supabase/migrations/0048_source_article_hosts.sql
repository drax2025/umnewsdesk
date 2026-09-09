-- ═══════════════════════════════════════════════════════════════════════════
-- 0048_source_article_hosts.sql
--
-- Which hosts a source's articles actually live on.
--
-- Host attribution credits a story to the outlet that published it, matched on
-- the article's own host against the source's `feed_url` host. That holds when
-- an outlet's feed sits on its own domain, and breaks in two common cases:
--
--   1. The feed is on a delivery domain. The BBC's feeds are on
--      feeds.bbci.co.uk while its articles are on bbc.co.uk and bbc.com, so 19
--      BBC stories sat unattributed next to a registered BBC source.
--   2. The feed is fronted by a third party. An rss.app feed's host is
--      rss.app, which no article URL will ever match — so a source added that
--      way could never claim its own stories.
--
-- Same shape as press_agencies.email_domains, which solves the same problem
-- for senders.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.discovery_sources
  add column if not exists article_hosts text[];

comment on column public.discovery_sources.article_hosts is
  'Extra hosts whose articles belong to this source, lowercased and without "www." — for feeds served from a delivery domain (feeds.bbci.co.uk → bbc.co.uk, bbc.com) or fronted by a third party (rss.app). The feed_url host is always matched as well and does not need repeating here.';

create index if not exists discovery_sources_article_hosts_idx
  on public.discovery_sources using gin (article_hosts);
