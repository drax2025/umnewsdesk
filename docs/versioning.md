# Versioning

The version lives in `package.json` and nowhere else. `next.config.ts` reads it at build time
and publishes it, with the commit and build time, as `NEXT_PUBLIC_*` variables.

Where it shows:

- bottom-left of the sidebar, beside the signed-in user — `v0.9.0 · 9feb88e`
- `GET /api/version` — `{ "version", "commit", "builtAt" }`, unauthenticated on purpose, because
  "did that deploy land" is a question you need answered without a session

On a local `next dev` the commit is empty and the label reads `local`, which is the honest
answer rather than a stale sha from the last deploy.

## Bumping it

Semver, pre-1.0, so the minor number carries the weight:

- **patch** (0.9.0 → 0.9.1) — a fix with no change to how the desk is used
- **minor** (0.9.0 → 0.10.0) — a new capability, or a change someone would notice
- **major** — reserved; this is an internal tool and 1.0 would be a claim about stability we
  have no reason to make yet

Bump it in the same commit as the change, and add the entry to the changelog in the Obsidian
vault at `04 Projects/UnionMedia Newsroom V2/Changelog.md` — not in this repo, so the people who
read it do not need a checkout.

The CRM at `/home/dave/azzurro-crm` uses the same scheme, and its `scripts/deploy.sh` prints the
version on every deploy.

## History

Versions before 0.9.0 were assigned retrospectively on 2026-09-11 from git history. The app ran
unversioned from June to September 2026.
