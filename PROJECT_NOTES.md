# Project Notes — UM-NewsroomV2

> Working notes for Claude + Dave. Status, outstanding tasks, and context that
> isn't obvious from the code or git history. Update as work lands.
>
> **Workflow rule:** every git commit must include an entry in this file under
> "Recently landed" describing what landed. Update the notes as part of the same
> commit — never commit code without a notes entry.

_Last updated: 2026-09-03_

## Recently landed (this session)

- **Three loose ends from the mailbox handover, closed** (3 Sep 2026).
  - **Triage digest moved here** (`GET /api/cron/triage-digest`). V1's copy read
    V1's `triage_log`, which stopped filling the moment triage moved — it would
    have mailed zeros every morning while News Desk quietly did the work. Sent
    over the same Zoho account the mailbox authenticates as, carrying the
    `X-Union-Newsroom` header so the next triage run does not read it back as a
    press release. It keeps V1's stale warning: an empty digest reads the same
    whether nothing arrived or triage stopped, so silence is called out.
    `?dry=1` renders without sending. Needs `TRIAGE_DIGEST_TO`, which has no
    default — unset refuses to send rather than mailing a stranger.
  - **Poll batch 25 → 15.** Measured on live mail at ~14s a message;
    `maxDuration` is 300, so 25 could never finish and the run would be killed
    part-way. 15 leaves headroom, and at a ten-minute cadence what does not fit
    is not lost, it is next.
  - **`vercel.json` no longer polls the mailbox.** It ran daily at 07:00 while
    n8n ran every ten minutes; two schedulers on one queue is precisely what
    made both apps ingest the same releases this morning. n8n owns the
    schedule. The embargo-release cron stays.
  - `nodemailer` added — with **pnpm**, not npm. This repo has a
    `pnpm-lock.yaml`, and `npm install` fails on it with a null-property error
    rather than saying so.

- **Inbox triage moved here from V1** (3 Sep 2026). `GET /api/cron/triage-inbox`
  sorts the unsorted Zoho INBOX: press releases to `PR/To Process` where the
  poller takes them, commercial mail to its own folders, wire traffic and
  anything unrecognised left for a person. Nothing is ever routed to Spam.
  - `src/lib/ingest/triage.ts` is V1's rules **ported unchanged in behaviour**.
    They carry a week of tuning against live mail — the narrow HIGH_VALUE list
    exists because "partnership" matched an agency's own signature, and
    `looksLikeAgency` exists because the first preview missed every
    `…pr.co.uk` sender. Rewriting them would have meant rediscovering that.
  - The four tests came with them (`tests/triage.test.ts`, run with
    `npx tsx`): the cases that were wrong on live mail first time round.
  - Progress is a UID high-water mark in `app_settings`, not the unseen flag,
    so someone reading mail in Zoho cannot make messages invisible to it. The
    mark advances only after the moves succeed, so a failure retries.
  - `?dry=1` classifies without moving; `?preview=N` classifies the last N
    regardless of the mark. Decisions are logged to `triage_log` (migration
    `0045`) **including the ones that moved nothing** — "why is this still in
    my inbox" is the question people actually ask.
  - `readNewInbox` and `moveMessages` added to `src/lib/ingest/mailbox.ts`.
- **V1 stopped reading the mailbox the same day** (its commit `806c426`): both
  cron endpoints and the triage rules removed, and the ten-minute crontab entry
  taken off the box. It keeps only the agency reply, which files one known
  message after publication rather than competing for a queue.
  - This was not theoretical. For a morning on 3 September both apps polled
    `PR/To Process` every ten minutes and **ingested the same two releases
    twice** — message ids `ema76f79f6@opusintegrity…` and `LO2P123MB7260879B5…`
    are in both systems, minutes apart.

- **V2 can now hand over emailed press releases** (cross-repo change). The
  "Send to newsroom" button rejected every email candidate with *"No source
  URL"*, because V1 derives story identity by hashing the source URL and a
  release has no page of its own.
  - **V1** (`services/candidateIngest.ts`, separate repo, branch
    `feat/fact-check-notes`): identity falls back to the RFC822 Message-ID,
    hashed **exactly** the way `workflowIdForMessage` hashes it in V1's own
    mailbox path — same `pr-` prefix, same digest — so a release reaching V1
    down both routes makes **one** story and the upsert absorbs the second.
    7 new tests, 33 passing.
  - **Content source matters editorially:** a release stays **Canonical** (the
    issuer's own words, may go out on a light rewrite); only a swept page is
    **Public Domain** and must go through the full rewrite. Marking a release
    Public Domain would force pointless rewrites.
  - **V2** (`newsroom-handoff.ts`): sends `messageId`, allows a missing
    `primary_url` when one is present, prefers the agency name over "Press
    mailbox (unattributed)" for attribution, and **skips the fact-check for
    releases** — a fact-check reads a story against the page it came from, and
    a release *is* the source, so there is nothing to check against. Sending a
    hollow "unavailable" would read as "we tried and failed".
  - **Not yet live.** V1 must be deployed and **its own mailbox poll disabled**
    before V2's poller is re-scheduled, or the two race for the same folder.

- **Cron cadence moved to n8n — the Vercel plan is Hobby.** The first preview
  deploy of the mailbox work **failed**: Hobby allows at most two cron jobs and
  only **daily** schedules, so `*/30` and `*/15` were rejected outright (this is
  why the previous config had a single `0 6 * * *` entry). `vercel.json` now runs
  both crons once daily as a backstop, and `n8n/workflows/poll-mailbox.json`
  drives the real 30-minute cadence through the runner that already handles the
  RSS sweep. Note it needs a **second** header-auth credential — the cron routes
  use `CRON_SECRET`, not `INGEST_TOKEN`.

- **Mailbox verified against the live Zoho account** (3 Sep 2026). Folder check
  passed: connected, 75 folders, and `PR/To Process` / `PR/Ingested` /
  `PR/Failed` all exist under exactly the configured names (Zoho's delimiter is
  `/`, so no `IMAP_FOLDER*` overrides needed). Dry run read a real release and
  **matched its sending domain to the agency "Tiger Bond"** — so it would store
  as `verification_state = 'verified'`, which the forwarded-mail path could
  never establish. Correctly reported it as not embargoed.
  - Dry-run output now includes the embargo verdict; it was computed but never
    surfaced, which made the dry run less useful than claimed.
  - Still unproven: a real (non-dry) store, and the embargo *hold* path against
    a genuinely embargoed message.

- **Embargo parsing on the mailbox path** (`src/lib/ingest/embargo.ts`, ported
  from V1) — an embargoed release is now **held** rather than offered to the
  desk. `detectEmbargo` reads the release's own date, so "FRIDAY 28 AUGUST"
  with no year resolves from when the agency sent it, not when we polled.
  - **The trap it exists for:** "Embargo: For immediate release" and "EMBARGO:
    IMMEDIATE" are common and mean the story is free to run *now*. A keyword
    match holds those, which is a story missed. An agency *asking* whether you
    want releases under embargo is likewise not an embargo. Both are excluded.
  - **Cautious the other way:** a release that mentions an embargo but whose
    date cannot be read is still held, with no lift time and
    `embargo_confidence = 'low'`, so a person decides. Publishing an embargoed
    release early is the mistake agencies do not forgive.
  - BST/GMT handled without a timezone library (last-Sunday rule, deterministic
    and testable) — the desk works in one zone and the answer must be checkable.
    Verified: `00:01 25 August 2026` → `2026-08-24T23:01Z`; January stays GMT.
  - The line the parser read is kept in `raw.embargo_evidence` (there is no
    dedicated column) so a person can check the machine's work.
  - Exercised against 11 cases covering every real wording V1 recorded, all
    three traps, and the GMT/BST boundary — all correct.
- **`/api/cron/embargo-release` restored** (deleted in `feed7a3`), every 15 min.
  Without it the poller's holds would never lift. Two deliberate behaviours: a
  hold with **no** `embargo_until` is never auto-released (we could not read a
  lift time, so a person supplies one), and the release now moves **only**
  `triage_state` — the old version also reset `verification_state` to 'pending',
  which would undo the attribution the IMAP path establishes.

- **PR mailbox now read over IMAP, on a cron** (ported from Newsroom V1):
  `GET /api/cron/poll-mailbox` (Node runtime, `maxDuration` 300) polls the Zoho
  folder every 30 minutes and turns what is waiting into `candidates`.
  - `src/lib/ingest/mailbox.ts` — transport. Port of V1's hardened service:
    UID-based search (sequence numbers shift as messages move out and silently
    read the wrong mail), an `error` listener on every ImapFlow client because
    an unhandled event takes the process down, explicit greeting/socket
    timeouts, and **folder-as-queue** semantics — a message is *moved* to
    `PR/Ingested` once stored, so what remains is what still needs attention
    and a re-run cannot double-process. Unparseable mail goes to `PR/Failed`
    so one bad message cannot block the queue.
  - `src/lib/ingest/email-candidate.ts` — mapping. Idempotent on the RFC822
    Message-ID, then the existing fuzzy/URL `checkDedup`. Sender domain is
    matched against `press_agencies` for attribution.
  - **Why this replaces Postmark:** the webhook only ever saw what somebody
    *forwarded*, so sender/date/Message-ID had to be reconstructed from a quoted
    wrapper — which is why all 21 existing email candidates are `Fwd:` and
    mostly `unverified`. Reading the mailbox gets the agency's original message,
    so a known agency domain is now genuinely `verified`. V2's Postmark path had
    also been dead since **3 July 2026**; V1 retired its own on 24 August.
  - Modes for first run: `?test=1` checks credentials and folder names without
    touching mail (the usual first failure is a folder named slightly
    differently), `?dry=1` reports what it *would* create and moves nothing,
    `?limit=n` caps the batch.
  - Verified: typecheck + lint clean; 401 unauthenticated, 401 bad token, 503
    when IMAP env is absent, token accepted via header **and** query string.
    DB preconditions confirmed (PRESS_MAILBOX active, 21 agencies,
    `message_id`/`pr_contact`/`attachment_urls` all writable). **The IMAP leg
    itself is untested — it needs real Zoho credentials.**
  - `vercel.json`: added the poller and **removed the stale
    `/api/cron/embargo-release` entry**, whose route no longer exists — that
    cron had been 404ing daily since the pipeline retirement.

- **Advisory fact-check on the way out** (2 Sep 2026, Phase 4). `sendToNewsroom`
  now fetches the source page, compares the candidate against it in one model
  pass, and attaches the result to the payload and to the candidate row.
  `src/lib/fetch/safe-url.ts` (ported unchanged from V1), `src/lib/fact-check/`
  (types, extractor, check), migration `0044`.
  - **Advisory means advisory.** `factCheckCandidate` never throws. No key, a
    host that resolves private, a 404, a paywall, a timeout, a model returning
    nonsense — all come back as `state: "unavailable"` with the reason, and the
    send proceeds. Three findings send exactly like none.
  - `state` is three-valued on purpose. `clean` and `unavailable` both carry an
    empty findings list; collapsing them would let a page that failed to fetch
    read as a page that checked out.
  - **Extraction needed real work.** The first source tried has no `<article>`,
    no `<main>` and no recognisable content class, so there was no structure to
    lean on. A straight turndown spent the whole 12k budget on social icons and
    teaser cards and truncated *before* the article. Filtering teaser cards
    (`* [![…`) and non-prose blocks brought the same page to 10,250 characters
    with the article at char ~90 and nothing truncated. The candidate headline
    is also passed as an anchor for pages where a sidebar still survives.
  - Model is `claude-opus-5`. One call per send, not per candidate — there are
    1,000+ candidates and almost none of them are sent.
  - Guard and extractor verified against the live Daily Business Group page:
    16/16, including cloud-metadata and `file://` refusals.
  - **Not yet verified end to end.** `ANTHROPIC_API_KEY` exists only in Vercel,
    so the model half has never run. It needs a real send from a deployed
    build.
  - Also removed: `scripts/f3-draft-runner.mjs` and the `f3:draft` package
    script — Phase 3 missed them because the orphan scan only covered `src/`.

- **The editorial pipeline is retired** (2 Sep 2026, Phase 3). News Desk now
  does discovery and hands the result to Newsroom V1; V1 does the editing,
  images, embargoes, publishing and the agency reply. Removed: `/approvals`,
  `/articles`, `/board`, `/calendar`, `/commissioning`, `/corrections`,
  `/design/f5-edit`, `/inventory`, `/opportunities`, `/pipeline`, `/queues/*`,
  plus `POST /api/ingest/email` and the embargo-release cron. 24 route files
  and 63 files of code they were the only callers of; 49 routes down to 25.
  Nothing was deleted for tidiness — each file had no remaining importer,
  established by repeated scan until the set was stable.
  - **The tables are untouched.** 41 articles and 37 commissions still exist
    in Supabase and can be read there. Nothing in the app links to them: the
    read-only archive view was offered and declined. If those 19 written
    pieces are ever wanted back in the UI, it is a new page, not a revert.
  - **The inbox row is now send / OPS-RR / dismiss.** Commission, the F1
    triage cell, the per-row title picker and scoring are gone with the
    pipeline they fed. `sent_to_f1` survives as an enum value because it is
    what the database holds, but it is labelled "Sent" — F1 no longer exists.
  - **Nav is Overview, Discovery, Admin.** The `system_design` key pointed at
    `/system/design`, which was never built — it has only ever guarded a 404,
    and it goes with the rest.
  - **Dashboard rebuilt around discovery**: ready to send, sent today, held,
    last sweep, sources active, needs attention. It deliberately does not
    mirror anything past the handoff — two systems reporting the same number
    is how they start disagreeing.
    - Two bugs in the first version, both found by running the queries against
      live data rather than reading the code. `sweep_status` is `complete`, not
      `completed` — the tile would have shown a clean sweep in red. And the
      counts were taken by reading 500 rows and calling `.length` against 1,092
      candidates: **ready** would have read 496 instead of 1,063 and **held** 0
      instead of 6. Both now counted in the database with `count: "exact"`.
  - **WordPress credentials removed from Titles.** All five titles held a
    complete, live app-password for sites V1 already publishes to. The UI is
    gone; migration `0043` nulls the values. Columns kept, not dropped, so it
    is reversible.
  - Migrations `0042` (retired menu keys) and `0043` (credentials) are
    **written but not applied** — they need running in the Supabase editor.
  - Typecheck clean, build clean, lint clean apart from two pre-existing
    `set-state-in-effect` errors in the two right-hand panels, which are
    unchanged on the base branch.
  - Left in place deliberately: `GET /api/packs/[ref]/markdown`. It renders the
    F1–F7 pre-flight pack and nothing links to it any more, but it was not in
    the removal list, and it is the only reason `pack-render.ts`,
    `pack-renderer.ts`, `pre-flight.ts` and the F1 triage spec still compile.
    Removing it would take those four with it.
  - Also found, not touched: 13 files under `src/components/ui/` (shadcn
    primitives — card, badge, table, tabs, select, sidebar, …) have **no
    importer anywhere**, and had none before this change either. Pre-existing
    dead scaffolding, out of scope here.

- **RSS sweep now reads the source registry** (`discovery_sources` is
  authoritative): new `GET /api/ingest/sources?method=rss` (bearer
  `INGEST_TOKEN`) returns the live registry, and `n8n/workflows/rss-sweep.json`
  replaces its hardcoded **Source list** Code node with **Fetch source list**
  (HTTP) → **Build source queue** (Code). Previously the workflow carried its
  own copy of the list, so adding a source in `/system/discovery-config` did
  nothing and deleting one left the runner fetching a dead URL — the repo copy
  still pointed at `SRC-9011`/`SRC-9002`/`SRC-9009`, **all three now deleted**.
  Server-side filtering: `paused` and future `paused_until` excluded;
  `warning`/`critical` included (health signals, not off-switches, else a source
  could never recover); signal-only included with the flag passed through
  (signal-only restricts drafting, not ingestion). An empty registry now
  **throws** in the queue node instead of silently sweeping nothing. Verified
  live: 401 unauthenticated, 401 bad token, 400 bad method, 200 returning
  `SRC-9016`. Typecheck + lint clean.
  - Note: `crawl_method` is free `text`, not an enum; `PRESS_MAILBOX` uses
    `'email'`, which is outside the app's documented set
    (`rss|sitemap|html_scrape|api`). Harmless — email is push-based via Postmark
    and never swept — but the endpoint's allow-list rejects `?method=email`.
- **Source registry purged of seed data** (31 Aug 2026): deleted the 15
  `SRC-9001`–`SRC-9015` rows seeded by `0004_seed_discovery.sql`. Not one had a
  working feed URL (7×404, 4× HTML-not-feed, 2× dead host, 403, 401), their
  candidates were invented (`REC-91xx`), and four were outright fabrications —
  `techscotland.com` and `snugg.co.uk` are **parked domain-for-sale pages**,
  `highlandenergy.co` and `dundeeinnovation.com` are NXDOMAIN. Registry now
  holds `SRC-9016` (the only producing feed) and `PRESS_MAILBOX`. Backup of all
  deleted rows: `/tmp/purge-backup-2026-08-31.json`.
  - **Schema drift found:** `0003_discovery_schema.sql` declares
    `candidates.source_id` `not null … on delete cascade`, but the **live**
    column is nullable with `on delete set null`. Nothing was lost — 19 seed
    candidates survive with `source_id = NULL` (plus 2 empty orphan articles).
    Same class of divergence as the migration-0007 gap: **the migration files do
    not reliably describe the live database.**

- **Repo migration 0007 reconciled with the deployed DB**: rewrote
  `supabase/migrations/0007_write_surface_schema.sql` to be idempotent
  (`create ... if not exists`, guarded enum create, `drop policy if exists`
  before create) and to use the current role model — RLS insert policies now gate
  on `editor`/`admin` (revisions) and `admin` (approval decisions) instead of the
  retired `senior_editor`, which is no longer a valid `user_role` label. A fresh
  rebuild now matches production and won't fail on the stale enum value.
- **Audit/history writes no longer fail silently**: three server actions that
  wrote to `article_revisions` / `approval_decisions` ignored their insert
  result. Now they check every write and throw on failure (with a server-side
  `console.error`):
  - `saveArticleDraft` (`article-write.ts`) — surfaces both the article update
    and the revision-history insert.
  - `recordDecision` (`approvals.ts`) and `killArticleFromCommission`
    (`commissioning.ts`) — now write the `approval_decisions` audit row **first**
    and only advance article state if it succeeds. Previously a missing table (or
    the admin-only RLS policy rejecting a non-admin) let the state change through
    with no audit trail. Verified: typecheck + lint clean.
- **Applied missing migration 0007 (write surface + approvals)**: while testing
  the F3 runner's `--commit` write-back, discovered `article_revisions` AND
  `approval_decisions` returned 404/PGRST205 from PostgREST — the tables did not
  exist. Migration `0007_write_surface_schema.sql` had never been applied to the
  live project (`xjyzgwflywvvfyaehizv`), and there is **no
  `supabase_migrations.schema_migrations` tracking table** in this project
  (migrations were applied ad hoc, and 0007 was simply skipped). Applied a
  corrected, idempotent version via the SQL editor — same schema, but the RLS
  insert policies were updated from the retired `senior_editor` role to the
  current model (`editor`/`admin` for revisions, `admin` for approval decisions;
  the original file's `senior_editor` literal is not even a valid `user_role`
  enum label anymore). Tables now resolve (HTTP 200) and the runner writes both
  the article draft and its revision row cleanly. **Follow-ups noted below.**
- **F3 Initial Draft agent runner (spike)**: first "execution layer" prototype —
  `scripts/f3-draft-runner.mjs` (+ `npm run f3:draft`). A standalone Node ESM
  batch job that finds `commissioned` articles, asks Claude (forced tool-use,
  strict schema) for an F3 draft — 3 headline options ≤90c + standfirst + body —
  and, only with `--commit`, writes it back the same way the F3 UI does
  (`articles.headline_options`/`standfirst`/`body` + a new `article_revisions`
  row). Deliberately conservative: **DRY RUN by default**, article is **left in
  `commissioned`** (a human still files it — output is a draft, zero new publish
  risk), and it **refuses to draft from `signal_only_eligible` sources** (mirrors
  the inbox guardrail). Uses the Supabase service-role key (runs outside a
  request). Needs `ANTHROPIC_API_KEY` — **not in `.env.local`**, must be added.
  Flags: `--id`, `--limit`, `--commit`, `--force`, `--model` (default
  `claude-sonnet-4-5`, or `$ANTHROPIC_MODEL`).
  - **Two generation backends (`--via`)**: `--via=cli` (default) shells out to
    the local `claude` CLI in headless mode (`-p --output-format json
    --json-schema …`), reusing the CLI's own subscription auth — **no API key,
    no API billing**; good for running by hand now. `--via=api` calls the
    Anthropic API via `@anthropic-ai/sdk` (needs `ANTHROPIC_API_KEY`) — the right
    choice for an unattended production batch job. Both return the same shape.
  - Verified end-to-end via CLI including `--commit`: generates 3 valid
    headlines + standfirst + ~5k-char body and writes `articles` + an
    `article_revisions` row, leaving state at `commissioned`. Test article:
    REC/Highland "grid-scale battery" (`c4107635-…`), now at revision 2.
- **Discovery inbox shows downstream article state**: a commissioned candidate
  now displays the lifecycle state of the article it became — most importantly a
  green `● LIVE` badge once published — as a chip in the Working Headline cell
  and an "Open article · <state>" link in the Actions column (links to the
  dossier). Built by joining candidate → commission → article(state) in
  `/discovery/inbox`. The Actions link replaces the Commission button whenever an
  article already exists, so a published candidate is obvious and can't be
  double-commissioned. Also fixed: `commissionFromCandidate` now stamps the
  candidate `triage_state='sent_to_f1'` on commission (previously it stayed
  'ready', leaving a stale Commission button and wrong inbox counts).
- **F8 Publish UX — artefacts roll up + destination/category at push**:
  - **Stage 1 (final B2 sweep)**: the 17-artefact list now collapses by default
    on `/articles/[id]/publish`. The panel header keeps the live summary counts
    (clean/found/N-A/pending) and the ready/blocked badge; a "View artefacts" /
    "Hide artefacts" toggle expands the bulk toolbar + outlet rows when an editor
    needs to action them. (`f8-artefact-sweep.tsx`.)
  - **Stage 2 (publish push)**: the WP push form now has a **Destination site**
    selector (any `titles` silo, flagged with whether it has WP creds) and a
    **Category** selector populated live from the chosen destination's WordPress
    (`/wp-json/wp/v2/categories` via new `listWpCategories` server action;
    defaults to the title's `wp_default_category_id`). Picking a different
    destination reassigns `articles.title_id` on a successful push so the master
    inventory and any later mark-live target the right site. `publishArticle`
    accepts optional `title_id` + `category_id` overrides (back-compat: absent =
    old behaviour). Manual-URL pushes skip both selectors. Verified by
    typecheck + lint, not browser.
- **Signal-only source indicator**: the candidate inbox
  (`/discovery/inbox`) now renders an amber `SIGNAL ONLY` badge under the source
  name when the candidate's `discovery_sources.signal_only_eligible` is true —
  awareness/intelligence only, not a drafting basis. Keys off the real source
  flag (not the displayed `raw.agency_name`). Note: still only visual — the
  commissioning action does NOT yet block commissioning from signal-only sources
  (potential follow-up, see Outstanding).
- **Kill story from commissioning**: new `killArticleFromCommission` action +
  "Danger zone" UI on `/commissioning/[id]` to spike a whole article (e.g. wrong
  region/unsuitable), distinct from per-author "Mark declined". Sets
  `articles.state='killed'`, logs reason to `approval_decisions`, surfaces in the
  D-Reject queue with a `KILLED` badge, and drops the commission from the active
  list. Admin-only (audit-log insert is admin-gated by RLS); refuses to kill a
  `live` article (use a retraction). Verified by typecheck + lint, not browser.

## What this is

Next.js editorial newsroom app. Articles move through an 8-stage pipeline
(see `AGENTS.md` for canonical stage names):

RR Discovery → F1 Triage → F2 Research → F3 Initial Draft → F4 Interlink →
F5 Editor → F6 Final Review → F7 Pre-Flight Check → F8 Publish

## Recently landed

- **WordPress publishing**: distinct `wp_draft` state; "Mark as published (live)"
  for WP-draft articles; duplicate-post risk fixed.
- **Roles**: `senior_editor` → `admin`; editorial sign-offs dropped to `editor`;
  F7 hand-off + `[PUB]` approval relabelled as Editor.
- **Stage rename**: F9 → F7 renumber, canonical stage naming codified in AGENTS.md.
- **Pipeline/dossier UX**: sortable columns, "Open in editor" promoted, triage
  defaults, featured-image credit autosave.
- **F8 gating**: push UI gated behind publishable state; senior `[PUB]` PASS
  required before publish.

## Outstanding / to do

- **Enforce signal-only at commissioning** (optional): add a server-side guard in
  `commissionFromCandidate` to refuse/warn when the candidate's source is
  `signal_only_eligible`. Currently only surfaced visually in the inbox.

## Open questions / decisions pending

- _(none recorded yet)_

## Context worth remembering

- **Migration state (verified 2026-07-01)**: all migrations `0001`–`0039` are
  applied to the live project (`xjyzgwflywvvfyaehizv`). `0007` (write surface +
  approvals) was the **only** gap — it had never been applied and was fixed this
  session (see Recently landed). Probed every schema migration's signature
  table/column via PostgREST; both renames confirmed (`0036` new `article_pre_flight`
  present + old `article_pre_publish` gone; `0038` `senior_editor` gone). Note:
  this project has **no `supabase_migrations.schema_migrations` tracking table**
  (migrations applied ad hoc), so there's no built-in guard against another gap.
