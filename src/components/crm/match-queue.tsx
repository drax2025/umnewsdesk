import { AlertTriangle } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { suggestedOrgName } from "@/lib/crm/agency";
import { CrmQueueTable, type QueueRow } from "./match-queue-table";

/**
 * Senders the automatic rules would not place.
 *
 * Only 38 of the 309 organisations tagged 'PR Agency' in the CRM carry a
 * domain, so most matching is done on the sender's name — and a name is often
 * a person's, or could be two different agencies. Anything uncertain is written
 * here instead of to the CRM: a queue entry costs a minute, a wrong client
 * record costs an account manager's trust in the data.
 *
 * Most of what lands here is an in-house press office rather than an agency,
 * so "Not an agency" is permanent (migration 0050) and can be applied in bulk.
 */

const CRM_URL = (process.env.NEXT_PUBLIC_CRM_URL ?? "https://crm.unionmediainc.com").replace(/\/$/, "");

export async function CrmMatchQueue({ canManage }: { canManage: boolean }) {
  const admin = createServiceClient();

  const [{ data: queue }, { count: writes }, { count: ignored }] = await Promise.all([
    admin
      .from("crm_match_queue")
      .select("id, domain, sender_name, reason, candidates, created_at, candidate_id")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<QueueRow[]>(),
    admin
      .from("crm_sync_log")
      .select("id", { count: "exact", head: true })
      .in("action", ["created", "promoted", "linked"])
      .eq("dry_run", false),
    admin.from("crm_ignored_domains").select("domain", { count: "exact", head: true }),
  ]);

  // The sender's address comes off the candidate that raised the question. It
  // is shown because it is what gets created as a contact — a push should not
  // write anything the person clicking could not see first.
  const ids = (queue ?? []).map((r) => r.candidate_id).filter((id): id is string => !!id);
  const emails = new Map<string, string>();
  if (ids.length) {
    const { data: cands } = await admin
      .from("candidates").select("id, raw").in("id", ids)
      .returns<{ id: string; raw: { from_email?: string } | null }[]>();
    for (const c of cands ?? []) {
      const e = c.raw?.from_email;
      if (typeof e === "string" && e.includes("@")) emails.set(c.id, e.toLowerCase());
    }
  }

  // The name box is filled in on the server, so the row arrives showing what
  // it will actually be saved as rather than filling in after hydration.
  const rows = (queue ?? []).map((r) => ({
    ...r,
    suggested_name: suggestedOrgName(r.domain, r.sender_name),
    sender_email: r.candidate_id ? (emails.get(r.candidate_id) ?? null) : null,
  }));

  return (
    <div className="mb-5 rounded-md border border-border bg-card p-4">
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-warn" />
          CRM review queue
        </h2>
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-um-muted">
          {rows.length} open · {writes ?? 0} written · {ignored ?? 0} ruled out
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-[1.5] text-um-muted">
        Senders the desk could not place on its own. Nothing has been written to
        the{" "}
        <a href={CRM_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          CRM
        </a>{" "}
        for any of them. <strong className="font-medium text-fg-2">PR agency</strong> adds a
        supplier who sends us releases;{" "}
        <strong className="font-medium text-fg-2">Prospect</strong> adds a business that submits
        its own PR and is worth a call about marketing or paid support;{" "}
        <strong className="font-medium text-fg-2">Not an agency</strong> rules the domain out for
        good. The name box is what the record will be called — most senders sign
        with a person\u2019s name, so it falls back to the domain unless you set it.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-secondary/30 px-3 py-4 text-center text-[12px] text-um-muted">
          Nothing waiting — every sender so far has been matched, created or ruled out.
        </p>
      ) : (
        <CrmQueueTable rows={rows} canManage={canManage} crmUrl={CRM_URL} />
      )}
    </div>
  );
}
