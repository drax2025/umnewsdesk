# Project Notes — UM-NewsroomV2

> Working notes for Claude + Dave. Status, outstanding tasks, and context that
> isn't obvious from the code or git history. Update as work lands.
>
> **Workflow rule:** every git commit must include an entry in this file under
> "Recently landed" describing what landed. Update the notes as part of the same
> commit — never commit code without a notes entry.

_Last updated: 2026-06-22_

## Recently landed (this session)

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

- _(none recorded yet)_
