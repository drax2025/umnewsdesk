# Adding a story by hand

A desk member sees a story nobody's feed carries — a tip, a competitor's piece, something
mentioned in a meeting — and needs it in the candidate inbox alongside everything else.

## The form

| Field | Required | Goes to |
|---|---|---|
| Working headline | yes | `working_headline` |
| Source | yes | `source_id` — the registry, defaulting to **Added by hand** |
| URL | no | `primary_url`, and the dedup key |
| Story text | no | `body_text` and `summary` — **Fetch** reads it off the link |
| Date and time | yes, defaults to now | `surfaced_at` |
| Added by | captured, not typed | `raw.added_by` / `raw.added_by_name` |

## Four decisions the brief left open

**Who added it is captured, not typed.** A name field a person fills in is a name field a person
can get wrong, and the desk already knows who is signed in. It is recorded in `raw` rather than
`author`, because `author` is who wrote the story, not who filed it.

**Source is a registry row, not free text.** Everything else in the inbox is attributed to a
`discovery_sources` row, which is what the Source column and its filter read. Free text would put
a value there that nothing else in the system understands. A `MANUAL` source — "Added by hand" —
is seeded and used as the default, so these are findable as a group.

**URL is optional but asked for.** It is what dedup matches on and what the newsroom handoff
needs. Without one a story can be added twice and nobody will notice. The form accepts it empty,
because a tip heard in a meeting has no URL yet, and says why it wants one.

**Story text is optional, but the newsroom needs it.** The hand-off refuses a candidate with
under 50 characters of `body_text` — "the desk cannot work from a headline and a link" — so a
story filed without text can sit in the inbox but cannot be sent on. It stays optional because
capturing a tip now and writing it up later is a real way to work, and losing the tip because
the text is not ready would be worse. The field says so rather than leaving it to be discovered
at the hand-off.

**Fetch reads the page rather than a person pasting it.** `src/lib/ingest/fetch-article.ts`
takes the narrowest container that looks like the story — `<article>`, then `<main>`, then the
page — strips script, style, nav, header, footer and aside, and keeps blocks over 40 characters,
which drops breadcrumbs and cookie lines while keeping paragraphs. It fills the headline only
when that field is still empty.

Not jsdom and Readability: a large dependency and a slow cold start for something used a few
times a day, when a news article is a narrow enough shape to handle directly. It will lose to
Readability on a hostile page and does not need to win — the result goes into the form for a
person to read before filing, so a site that defeats it costs a paste rather than a bad story
nobody noticed.

The URL comes from a user, so the fetch is guarded: http(s) only, no credentials in the URL,
nothing resolving to loopback, RFC1918, link-local, `.internal` or `.local`, a 12-second
timeout, a 3 MB cap, and HTML content types only.

**Date and time drives `surfaced_at`**, the column the inbox actually shows, not `published_at`.
The desk's question is "when did this reach us", and back-dating an entry to when it was really
spotted keeps the inbox in a truthful order.

## Behaviour

- `kind: 'manual'`, so these are distinguishable from `rss` and `email` for ever.
- Deduped like anything else when a URL is given: a duplicate is refused with a link to the
  candidate it matched, rather than quietly created.
- **Unless the match was rejected or archived.** Throwing a candidate out is a decision about
  that candidate, not a standing ban on the story, and re-filing is exactly what someone does
  when the first attempt was wrong or incomplete. The re-filed row takes its own `code` as its
  `external_id`, because the thrown-out row still holds the URL and `(source_id, external_id)`
  is unique in the database; `primary_url` is on both, so anything arriving later still dedupes.
  `raw.refiled_after` records the code it replaced.
- `triage_state: 'ready'` — it goes straight into the working set, which is the point.
- `verification_state: 'unverified'` — a person typing a headline is not verification.
- The date and time is converted to an instant **in the browser**. `datetime-local` carries no
  zone, and this app runs in UTC while the desk is in London — parsed server-side, every entry
  landed an hour in the future and was refused.
- Any signed-in desk user may add one. Filing a story is ordinary editorial work, not an
  administrative act.
