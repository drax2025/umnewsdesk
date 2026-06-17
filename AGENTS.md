<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Canonical workflow stage names

Always use these names in code, comments, UI strings, doc, and spec. Do not
re-introduce legacy names ("Researcher", "Writer", "Framing", "Headlines",
"Interlinks", "Interlinker", "Edit", "Backdate", "Review", "Reviewer",
"Pre-Publish", "Post-Publish", or anything containing `F9`).

| Stage | Canonical name | Route | Action file | Spec file |
|-------|----------------|-------|-------------|-----------|
| RR    | Ranger Recon (Discovery process) | `/discovery/*` | — | — |
| F1    | Triage | `/articles/[id]` (dossier) | `lib/actions/triage.ts` | `lib/spec/f1-triage.ts` |
| F2    | Research | `/articles/[id]/research` | `lib/actions/research.ts` | `lib/spec/f2-research.ts` |
| F3    | Initial Draft | `/articles/[id]/edit` | `lib/actions/article-write.ts` | `lib/spec/f3-headlines.ts` |
| F4    | Interlink | `/articles/[id]/interlinks` | `lib/actions/interlinks.ts` | `lib/spec/f4-interlinks.ts` |
| F5    | Editor | `/articles/[id]/edit` | `lib/actions/backdate.ts` etc. | `lib/spec/f5-backdate.ts` |
| F6    | Final Review | `/articles/[id]/review` | `lib/actions/review.ts` | `lib/spec/f6-review.ts` |
| F7    | Pre-Flight Check | `/articles/[id]/pre-flight` | `lib/actions/pre-flight.ts` | `lib/spec/f7-pre-flight.ts` |
| F8    | Publish | `/articles/[id]/publish` | `lib/actions/publish.ts` | `lib/spec/f8-publish.ts` |

### Notes

- **RR** is the alias for the discovery process. The `OPS-RR` queue keeps its
  internal name (Operations Ranger Recon) — it's the canonical alert queue for
  discovery-side faults.
- **F7 (was F9)**: renumbered in the v3.0 spec. The old `F9` token still appears
  in two places, intentionally:
  - the `failure_log_stage` Postgres enum value (cannot drop enum values; new
    rows always write `F7`)
  - historical SQL migration filenames (e.g. `0020_article_pre_publish_f9.sql`)
- **F6 verdict `hand_to_f7`** (was `hand_to_f9`): the verdict enum value lives
  in `lib/spec/f6-review.ts` and the matching SQL value is rewritten in-place.
- **Tables / archives**:
  - `article_pre_flight` (was `article_pre_publish`)
  - `pre_flight_failures` (was `pre_publish_failures`)
  - `pre_flight_packs` (was `pre_publish_packs`)
  - `workspace/pre_flight_packs/<REF>.md` (was `workspace/pre_publish_packs/`)
  - Pack ref prefix `PFP-YYYYMMDD-NNN` (was `PPP-`). The mint helper queries
    both prefixes on the current day so sequence numbers stay monotonic across
    the transition.
- **Routes**: legacy `/pre-publish` and `/post-publish` routes were deleted in
  place — no redirects. External bookmarks break; that was deliberate.
- **Nav key**: the left-nav slug `pre_publish` is kept as the stable
  permissions key (label rendered as "Pre-Flight [PUB]"). Do not rename it,
  otherwise role_menu_permissions rows lose their binding.
