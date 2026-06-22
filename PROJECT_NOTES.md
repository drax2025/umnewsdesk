# Project Notes — UM-NewsroomV2

> Working notes for Claude + Dave. Status, outstanding tasks, and context that
> isn't obvious from the code or git history. Update as work lands.

_Last updated: 2026-06-22_

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

- _(to be filled in — tell Claude what's on the list)_

## Open questions / decisions pending

- _(none recorded yet)_

## Context worth remembering

- _(none recorded yet)_
