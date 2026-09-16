# Adding a story by hand

A desk member sees a story nobody's feed carries — a tip, a competitor's piece, something
mentioned in a meeting — and needs it in the candidate inbox alongside everything else.

## The form

| Field | Required | Goes to |
|---|---|---|
| Working headline | yes | `working_headline` |
| Source | yes | `source_id` — the registry, defaulting to **Added by hand** |
| URL | no | `primary_url`, and the dedup key |
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

**Date and time drives `surfaced_at`**, the column the inbox actually shows, not `published_at`.
The desk's question is "when did this reach us", and back-dating an entry to when it was really
spotted keeps the inbox in a truthful order.

## Behaviour

- `kind: 'manual'`, so these are distinguishable from `rss` and `email` for ever.
- Deduped like anything else when a URL is given: a duplicate is refused with a link to the
  candidate it matched, rather than quietly created.
- `triage_state: 'ready'` — it goes straight into the working set, which is the point.
- `verification_state: 'unverified'` — a person typing a headline is not verification.
- Any signed-in desk user may add one. Filing a story is ordinary editorial work, not an
  administrative act.
