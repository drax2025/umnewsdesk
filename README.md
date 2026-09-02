# Union Media News Desk

Discovery and verification for Union Media. Sweeps the source registry, surfaces
candidate stories, lets an editor triage them, and hands the ones worth having to
**Newsroom V1** at `newsroom.unionmediainc.com`.

Everything after the handoff — rewriting, images, embargoes, scheduling,
publishing to WordPress, the reply to the agency — belongs to V1. News Desk
stops at the point of selection, on purpose: one system owning publishing means
one set of credentials, one calendar, and one answer to "where did this story
go".

## What it does

| Screen | Job |
|---|---|
| Dashboard | Did the last sweep work, what is waiting, what went across |
| Discovery Overview | Sweep health and source issues |
| Candidate Inbox | Triage: **send to newsroom**, escalate to OPS-RR, or dismiss |
| OPS-RR Queue | Source and parse problems that need a person |
| Sweep Run Detail | Per-run results |
| Admin | Source registry, health, audit log, titles, team, permissions |

## The handoff

`sendToNewsroom` posts to `POST /api/ingest/candidate` on V1, authenticated with
`NEWSROOM_INGEST_TOKEN`. Three checks run first — a source URL, at least 50
characters of body, and not already marked a duplicate — and each failing check
names itself rather than hiding the button.

The endpoint is idempotent on the canonical source URL, so retrying is safe: a
retry that did in fact land returns the same record instead of creating a second
story. V1 returns a workflow id and a record id, both stored against the
candidate, so News Desk can always say where a story went.

## Running it

```bash
npm install
npm run dev
```

Environment: see `.env.example`. Supabase for data and auth, Vercel for hosting.

## History

V2 was originally built as a full editorial pipeline — commissioning, drafting,
sub-editing, legal, pre-flight, WordPress publishing (stages F1–F8). That was
retired on 2 September 2026 in favour of fronting V1. The old specification is
kept at `docs/UMNewsroom-spec-v3.md` as a record of what was built; it does not
describe the running system. `PROJECT_NOTES.md` is the current account.
