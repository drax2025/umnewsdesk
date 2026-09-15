/**
 * Sweep reaper cron.
 *
 * n8n opens a sweep, does the work, then calls `/complete`. When the workflow
 * dies in between, the row sits at `running` for ever: twenty-eight had built
 * up by 15 September 2026, the oldest from 9 June, the newest from that same
 * afternoon. Nothing blocks on them — a new sweep opens regardless — but the
 * desk's dashboard shows sweeps still in progress that stopped months ago, and
 * anything computed across sweeps is computed over rows that never finished.
 *
 * This closes any sweep that has been running for more than two hours, which is
 * five times the slowest sweep that has ever completed. It does NOT fix
 * whatever is killing the n8n runs; it stops the wreckage accumulating while
 * that is looked at separately.
 *
 * What it achieved is recovered from `sweep_site_results` and `candidates`
 * rather than zeroed, so the row says what actually happened before it died.
 * `duration_seconds` stays null: we know when it started and when we noticed,
 * not when it stopped, and inventing the difference would corrupt the one
 * figure anybody uses to work out how long a sweep takes.
 *
 * Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET`; the same token
 * is accepted in the query string for manual runs.
 *
 * Idempotent: a re-run finds nothing, because the rows are no longer 'running'.
 *
 * `?dry=1` reports what it would close without touching anything.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isStale, reapPlan, STALE_AFTER_MS } from "@/lib/ingest/sweep-reaper";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const header = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1] ?? "";
  const query = url.searchParams.get("token") ?? "";
  if (!timingSafeEqual(bearer, secret) && !timingSafeEqual(query, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = url.searchParams.get("dry") === "1";
  const supabase = createServiceClient();
  const now = new Date();

  const { data: running, error: readError } = await supabase
    .from("sweep_runs")
    .select("id, code, status, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: true });

  if (readError) {
    console.error("[REAP-SWEEPS] could not read sweeps", readError);
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  // The age test lives in the library, with the measurements behind it.
  const stale = (running ?? []).filter((s) => isStale(s as never, now));
  if (stale.length === 0) {
    return NextResponse.json(
      { reaped_count: 0, reaped: [], still_running: running?.length ?? 0, ran_at: now.toISOString() },
      { status: 200 },
    );
  }

  const reaped: Array<{ code: string; candidates: number; sites: number }> = [];

  // Migrations here are applied by hand — PostgREST cannot run DDL — and one
  // has gone unnoticed for months before. Until 0051 is applied the enum has no
  // 'abandoned', every update fails with 22P02, and a cron that just logged an
  // error hourly would be indistinguishable from one that was working. So the
  // first failure of that kind stops the run and says which migration to apply.
  let missingMigration = false;

  for (const sweep of stale) {
    // What it managed before it died. Both tables carry sweep_run_id, so this
    // is recoverable rather than guesswork.
    const { data: siteResults } = await supabase
      .from("sweep_site_results")
      .select("outcome")
      .eq("sweep_run_id", sweep.id);

    const { count: candidateCount } = await supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("sweep_run_id", sweep.id);

    const plan = reapPlan(
      sweep as never,
      { siteResults: siteResults ?? [], candidateCount: candidateCount ?? 0 },
      now,
    );

    if (!dryRun) {
      // Guarded on status so a sweep that reported in while we were counting
      // is not overwritten by this.
      const { error: writeError } = await supabase
        .from("sweep_runs")
        .update(plan.update)
        .eq("id", plan.id)
        .eq("status", "running");
      if (writeError) {
        if (writeError.code === "22P02" && /enum sweep_status/i.test(writeError.message ?? "")) {
          missingMigration = true;
          break;
        }
        console.error(`[REAP-SWEEPS] could not close ${plan.code}`, writeError);
        continue;
      }
    }

    reaped.push({
      code: plan.code,
      candidates: plan.update.candidates_total,
      sites: plan.update.sites_total,
    });
  }

  if (missingMigration) {
    const message =
      "Migration 0051_sweep_abandoned_status.sql has not been applied: the "
      + "sweep_status enum has no 'abandoned' value, so no sweep can be closed. "
      + `${stale.length} sweep(s) are waiting on it.`;
    console.error(`[REAP-SWEEPS] ${message}`);
    return NextResponse.json(
      { error: message, migration: "0051_sweep_abandoned_status.sql", stale_count: stale.length, reaped_count: 0 },
      { status: 503 },
    );
  }

  console.log(
    `[REAP-SWEEPS] ${dryRun ? "would close" : "closed"} ${reaped.length} sweep(s) `
    + `running longer than ${Math.round(STALE_AFTER_MS / 60000)} minutes`,
  );

  return NextResponse.json(
    {
      reaped_count: reaped.length,
      reaped,
      dry_run: dryRun,
      still_running: (running?.length ?? 0) - reaped.length,
      ran_at: now.toISOString(),
    },
    { status: 200 },
  );
}
