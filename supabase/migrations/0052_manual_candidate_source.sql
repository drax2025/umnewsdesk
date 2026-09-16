-- ═══════════════════════════════════════════════════════════
-- A source for stories added by hand.
--
-- Everything in the candidate inbox is attributed to a
-- discovery_sources row — it is what the Source column reads and what
-- the source filter offers. A manually added story needs one too, or it
-- arrives with nothing in the column that anything else understands.
--
-- Given its own row rather than borrowing PRESS_MAILBOX, so "what did
-- people file by hand this month" is a filter rather than an
-- archaeology exercise.
--
-- crawl_method 'manual' keeps it out of the RSS sweep: /api/ingest/sources
-- selects on crawl_method = 'rss', so a runner will never try to fetch it.
--
-- feed_url is not null on this table, so it carries a sentinel rather than a
-- URL — the same shape PRESS_MAILBOX uses ('mailto:press@unionmedia'). Nothing
-- fetches it; it exists because the column insists.
-- ═══════════════════════════════════════════════════════════

insert into public.discovery_sources
  (code, name, feed_url, crawl_method, layer, status, exclusivity_window_hours)
values
  ('MANUAL', 'Added by hand', 'manual:desk', 'manual', 'l3', 'active', 24)
on conflict (code) do nothing;
