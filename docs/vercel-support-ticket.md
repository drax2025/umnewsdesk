# Vercel support ticket — silent deploy rejection on cron limit

**Project:** `unionmedia-s-projects/umnewsdesk`
**Production domain:** `desk.unionmedia.news`
**Plan:** Hobby
**Linked repo:** `github.com/drax2025/umnewsdesk` (branch `main`)
**Date:** 2026-06-10

---

## Summary

Vercel silently rejected every push-triggered deploy for ~3 hours
without showing the failure in the Deployments tab. Root cause was a
Hobby-incompatible cron expression (`*/15 * * * *`) in `vercel.json`,
which throws the error below from the CLI but produces *no visible
entry at all* in the dashboard when pushed via Git:

```
{
  "status": "error",
  "reason": "deploy_failed",
  "message": "Hobby accounts are limited to daily cron jobs. This cron
              expression (*/15 * * * *) would run more than once per day."
}
```

This is a UX bug — silent rejection on cron is far worse than a visible
"Failed" deploy with the same error message. We spent ~2 hours
debugging a phantom "Git integration broken" issue because there was
nothing in the dashboard to indicate the deploys were failing on
config validation.

## Timeline

- **`12151ef`** — last successful Git-triggered deploy (showed in
  Deployments tab as expected).
- **`43057e4`** — first commit containing `vercel.json` with
  `*/15 * * * *`. From this commit onward, Git pushes produced **zero
  entries** in the Deployments tab. No "Failed", no "Cancelled", no
  "Skipped" — just nothing.
- Subsequent commits (`694778c`, `3d68c0c`, `8e221bd`, `9e8f426`,
  `3c59885`) — same silent behaviour.
- During debugging we hit a separate 502:
  `lhr1::ghs4r-1781107858202-2464cdd77afb` on
  `vercel.com/<project>/settings/git` while trying "Manage Login
  Connections". Status board was green at the time.
- Disconnect/reconnect of the Git repo (twice) appeared to succeed in
  the UI but did NOT restore Git-triggered deploys. Manual Deploy
  Hook trigger returned `HTTP 201` but Vercel rebuilt the stale
  `12151ef` commit, suggesting Vercel's cached `main` ref was never
  refreshed from GitHub.
- `vercel --prod --yes` from CLI surfaced the real error in seconds.

## What we'd like fixed

1. **Show rejected deploys in the Deployments tab** with the same error
   message the CLI returns. A "Failed — Cron validation" entry would
   have saved 2+ hours of debugging.
2. **Send a notification (email or dashboard banner) on validation
   rejection** the first time it happens on a project. Silent failure
   on a plan-limit issue is the worst possible UX.
3. (Lower priority) Confirm whether `git reconnect` is actually
   refreshing the cached `main` ref. The Deploy Hook returning a build
   of `12151ef` after a successful reconnect suggests it isn't.

## Workaround in place

- Switched `vercel.json` to `0 6 * * *` (daily, Hobby-compliant) as a
  safety-net only.
- Moved the real every-15-min embargo-release trigger to GitHub
  Actions (`.github/workflows/embargo-release.yml`).
- Using `vercel --prod` from CLI for deploys until Git auto-deploy is
  confirmed working again.

## Useful references

- Deploy hook job ID returned during debug: `TWrLjJiRFw6WkzfSEnML`
- 502 incident: `lhr1::ghs4r-1781107858202-2464cdd77afb`
- Last successful CLI deploy: `dpl_Anmq4udDjdjiEz2CCZPr4heyKLpr`
- Failing commit range: `43057e4` → `3c59885` (all push-triggered, all
  vanished without trace)

Happy to share build logs or DM the project owner if helpful.
