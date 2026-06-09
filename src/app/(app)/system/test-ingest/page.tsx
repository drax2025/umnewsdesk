import { TestTube2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TestIngestConsole } from "@/components/forms/test-ingest-console";

export const dynamic = "force-dynamic";

export default async function TestIngestPage() {
  const supabase = await createClient();

  const [{ data: srcs }, { data: sweeps }] = await Promise.all([
    supabase
      .from("discovery_sources")
      .select("code, name, status")
      .neq("status", "paused")
      .order("code", { ascending: true }),
    supabase
      .from("sweep_runs")
      .select("id, code, slot, status, started_at")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const sources = (srcs ?? []).map((s) => ({ code: s.code, name: s.name }));
  const openSweeps = (sweeps ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    slot: s.slot as "am" | "pm",
  }));

  const tokenConfigured = Boolean(process.env.INGEST_TOKEN);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <TestTube2 className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Test Ingest</span>
        {tokenConfigured ? (
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            INGEST_TOKEN configured
          </span>
        ) : (
          <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            INGEST_TOKEN missing — set it in .env.local
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-4 rounded-md border border-border bg-card p-4">
          <h2 className="mb-1 text-[13px] font-semibold text-foreground">
            Wire-path tester for n8n
          </h2>
          <p className="text-[12px] leading-[1.5] text-um-muted">
            Every panel calls the real <code className="font-mono">/api/ingest/*</code> route
            through a server-action proxy that injects the bearer token. Same dedup, validation,
            and side effects n8n will trigger — without leaking the token to the browser. Use the
            generated curl block on the right when configuring HTTP nodes in n8n.
          </p>
        </div>

        <TestIngestConsole sources={sources} openSweeps={openSweeps} />
      </div>
    </div>
  );
}
