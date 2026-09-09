import { AlertTriangle } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { CrmQueueActions } from "./match-queue-actions";

/**
 * Senders the CRM would not match on its own.
 *
 * Only 38 of the 309 organisations tagged 'PR Agency' in the CRM carry a
 * domain, so most matching is done on the sender's name — and a name is often
 * a person's, or could be two different agencies. Anything uncertain is written
 * here instead of to the CRM: a queue entry costs a minute, a wrong client
 * record costs an account manager's trust in the data.
 */

type QueueRow = {
  id: number;
  domain: string;
  sender_name: string | null;
  reason: string;
  candidates: { id: string; name: string; lifecycle: string }[] | null;
  created_at: string;
};

const CRM_URL = (process.env.NEXT_PUBLIC_CRM_URL ?? "https://crm.unionmediainc.com").replace(/\/$/, "");

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

export async function CrmMatchQueue({ canManage }: { canManage: boolean }) {
  const admin = createServiceClient();

  const [{ data: queue }, { count: writes }] = await Promise.all([
    admin
      .from("crm_match_queue")
      .select("id, domain, sender_name, reason, candidates, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<QueueRow[]>(),
    admin
      .from("crm_sync_log")
      .select("id", { count: "exact", head: true })
      .in("action", ["created", "promoted"])
      .eq("dry_run", false),
  ]);

  const rows = queue ?? [];

  return (
    <div className="mb-5 rounded-md border border-border bg-card p-4">
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-warn" />
          CRM review queue
        </h2>
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-um-muted">
          {rows.length} open · {writes ?? 0} written to the CRM
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-[1.5] text-um-muted">
        Senders the CRM could not place on its own. Nothing was written for
        these — make the record in the{" "}
        <a href={CRM_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          CRM
        </a>{" "}
        and mark it done.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-secondary/30 px-3 py-4 text-center text-[12px] text-um-muted">
          Nothing waiting — every sender so far has been matched or created.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <Th className="w-[220px]">Sender</Th>
                <Th>Why it is here</Th>
                <Th className="w-[90px]">Seen</Th>
                <Th className="w-[170px] text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-secondary/40">
                  <td className="px-3 py-2 align-top">
                    <div className="font-mono text-[11.5px] text-foreground">{r.domain}</div>
                    {r.sender_name ? (
                      <div className="text-[11px] text-um-muted">{r.sender_name}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-[12px] text-fg-2">
                    {r.reason}
                    {r.candidates?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.candidates.map((c) => (
                          <a
                            key={c.id}
                            href={`${CRM_URL}/organisations/${c.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] text-fg-2 hover:text-foreground"
                          >
                            {c.name} · {c.lifecycle}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-um-muted">
                    {fmt(r.created_at)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <CrmQueueActions id={r.id} canManage={canManage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
