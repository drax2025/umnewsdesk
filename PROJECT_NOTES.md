# Project Notes — UM-NewsroomV2

> Working notes for Claude + Dave. Status, outstanding tasks, and context that
> isn't obvious from the code or git history. Update as work lands.
>
> **Workflow rule:** every git commit must include an entry in this file under
> "Recently landed" describing what landed. Update the notes as part of the same
> commit — never commit code without a notes entry.

_Last updated: 2026-06-22_

## Recently landed (this session)

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
