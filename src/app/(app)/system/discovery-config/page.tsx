import { Cog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  ExclusivityCell,
  SignalOnlyCell,
  StatusCell,
} from "@/components/forms/source-config-cells";

export const dynamic = "force-dynamic";

type SourceRow = {
  id: string;
  code: string;
  name: string;
  feed_url: string;
  crawl_method: string | null;
  layer: "l1" | "l2" | "l3" | "l4";
  status: string;
  exclusivity_window_hours: number;
  signal_only_eligible: boolean;
  monitored_since: string;
};

export default async function DiscoveryConfigPage() {
  const supabase = await createClient();
  const { data: srcs } = await supabase
    .from("discovery_sources")
    .select(
      "id, code, name, feed_url, crawl_method, layer, status, exclusivity_window_hours, signal_only_eligible, monitored_since",
    )
    .order("code", { ascending: true });

  const sources: SourceRow[] = srcs ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <Cog className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Discovery Config</span>
        <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
          Inline edits live
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-5 rounded-md border border-border bg-card p-4">
          <h2 className="mb-1 text-[13px] font-semibold text-foreground">Source registry</h2>
          <p className="text-[12px] leading-[1.5] text-um-muted">
            Status, exclusivity window, and signal-only eligibility edit in place — changes save
            immediately. Crawl method, parser overrides, and versioned snapshots wire up in the
            next slice.
          </p>
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Feed URL</Th>
                <Th>Method</Th>
                <Th>Layer</Th>
                <Th>Status</Th>
                <Th className="text-right">Excl. window</Th>
                <Th>Signal-only</Th>
                <Th>Monitored since</Th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border last:border-b-0 hover:bg-secondary"
                >
                  <td className="px-3 py-2.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                    {s.code}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-foreground">{s.name}</td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 font-mono text-[11px] text-um-muted">
                    {s.feed_url}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-fg-2">
                    {s.crawl_method ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-sm border border-border-mid bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-2">
                      {s.layer}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusCell id={s.id} value={s.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ExclusivityCell id={s.id} value={s.exclusivity_window_hours} />
                  </td>
                  <td className="px-3 py-2.5">
                    <SignalOnlyCell id={s.id} value={s.signal_only_eligible} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-um-muted">
                    {new Date(s.monitored_since).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`${className ?? ""} px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-um-muted`}
    >
      {children}
    </th>
  );
}
