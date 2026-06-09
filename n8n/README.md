# n8n workflows — UM Newsroom discovery

These workflows drive the app's `/api/ingest/*` endpoints. The app is the
brain (dedup, layer assignment, candidate insert, OPS-RR rules); n8n is
the pickup layer (schedules, RSS fetches, retries, credentials).

```
workflows/
  smoke-test.json   Manual one-shot: opens a sweep, posts one synthetic
                    candidate, completes the sweep. Use this first to
                    prove the wire path.

  rss-sweep.json    Twice-daily RSS sweep (08:00 + 16:00 UTC) across a
                    configurable source list, with per-source success /
                    parse-failure outcomes and automatic P2 alerting on
                    fetch failure.
```

## One-time setup

### 1. Environment variable

Set on the n8n instance (Settings → Variables, or the host env):

```
UM_BASE_URL = https://newsroom.example.com   # or http://host.docker.internal:3000 for local
```

### 2. HTTP Header credential

Create once and reuse across both workflows.

- Credentials → New → **HTTP Header Auth**
- Name: `UM Newsroom — INGEST_TOKEN`
- Header name: `Authorization`
- Header value: `Bearer <the same string as INGEST_TOKEN in the app .env>`

### 3. Import a workflow

Workflows → Import from File → pick a JSON from `workflows/`.

After import, open each HTTP node and re-pick the credential — the JSON
ships with `id: REPLACE_WITH_CREDENTIAL_ID` placeholders that n8n won't
auto-link.

## Smoke test (run this first)

1. Import `smoke-test.json`.
2. Re-bind the credential on the three HTTP nodes.
3. Confirm `SRC-9011` (`TechScotland Newsletter`) exists in
   `discovery_sources` — it's seeded by migration `0004`.
4. Click **Execute Workflow**.
5. Expected: one new sweep in `/discovery/sweeps`, one candidate in
   `/discovery/inbox` with headline `Smoke test — n8n wire path OK at …`,
   sweep status `complete`.
6. Re-run: the candidate should dedup on `external_id` and `dedup_state`
   on the response should be `duplicate` (no new row inserted).

If any step fails, check `/system/test-ingest` — it calls the same
routes with the same payload shape but proxies through a server action
so you can isolate "is it the route?" from "is it n8n?".

## RSS sweep — going live

1. Import `rss-sweep.json`.
2. Re-bind the credential on the four HTTP nodes.
3. Edit the **Source list** Code node to match the sources you actually
   want polled. Each entry needs `code` (matching `discovery_sources.code`)
   and `feed_url`. Layer is resolved server-side from the code, so don't
   set it here.
4. Activate the workflow.
5. Schedule runs at 08:00 and 16:00 UTC. To change the cadence, edit the
   cron expression on **Schedule 08:00 + 16:00**.

### Outcomes recorded per source

- `reached_items` — RSS fetched and at least one item posted.
- `parse_failure` — RSS fetch errored. A P2 `unreachable` alert is filed
  to `/api/ingest/alert` automatically.

The route ignores `candidate_count` reported by n8n — totals on the
sweep row are computed from the authoritative candidates / site_results
tables.

### Per-item batching

The **Post item** HTTP node batches at 5 requests / 250 ms to keep the
app from being hammered by a 200-item feed. Tune in the node's
`options.batching` if needed.

## Adding new source kinds

The contract takes any of `rss | email | pdf | web | generic`. Add a new
workflow per kind rather than overloading `rss-sweep.json`:

- **email**: IMAP Trigger or Gmail Trigger → Code node mapping to
  `NormalizedItem` (headline = subject, body_text = plain body,
  external_id = Message-ID) → Post item.
- **pdf**: Schedule + HTTP fetch + Extract from PDF → Code node →
  Post item with `kind: 'pdf'` and `body_text` populated.
- **web**: Schedule + HTTP fetch + HTML extract → Code node → Post item
  with `kind: 'web'`.

The dedup pipeline (external_id → canonical URL → fuzzy headline) is
identical across kinds, so cross-kind duplicates collapse correctly.
