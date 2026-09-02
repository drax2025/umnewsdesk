<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Canonical workflow stage names

**F1–F8 no longer exist.** The editorial pipeline was retired on 2 September
2026; News Desk does discovery and hands selected candidates to Newsroom V1,
which owns everything downstream. Do not re-introduce the stage names in code,
comments, UI strings or docs — a name for a screen nobody can open is worse than
no name, because it reads as a promise the app cannot keep.

| Stage | Canonical name | Route | Action file |
|-------|----------------|-------|-------------|
| RR    | Ranger Recon (Discovery process) | `/discovery/*` | `lib/actions/inbox.ts` |
| —     | Handoff to Newsroom V1 | `/discovery/inbox` | `lib/actions/newsroom-handoff.ts` |

### Notes

- **RR** is the alias for the discovery process. The `OPS-RR` queue keeps its
  internal name (Operations Ranger Recon) — it's the canonical alert queue for
  discovery-side faults.
- **`sent_to_f1`** survives as a `candidate_triage_state` enum value and as the
  state a handed-over candidate moves to. It is labelled "Sent" everywhere a
  person can see it. The value stays because Postgres enum values cannot be
  dropped and 4 rows predating the handoff still carry it; the label changed
  because F1 does not exist.
- **Retired stage names** — F1 Triage, F2 Research, F3 Initial Draft, F4
  Interlink, F5 Editor, F6 Final Review, F7 Pre-Flight, F8 Publish — together
  with the `article_*` and `pre_flight_*` tables, the `failure_log_stage` enum
  and the `pre_publish` nav key. The tables and enums remain in Postgres;
  nothing in the app reads them. `docs/UMNewsroom-spec-v3.md` records what they
  were.
- One route still renders a pre-flight pack: `GET /api/packs/[ref]/markdown`.
  Nothing links to it. It was deliberately left in place, and it is the reason
  `lib/render/pack-renderer.ts` and `lib/spec/f1-triage.ts` still compile.
