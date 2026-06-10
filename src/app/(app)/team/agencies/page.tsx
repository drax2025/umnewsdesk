import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  AddAgencyButton,
  AgencyDomainsCell,
  AgencyNameCell,
  AgencySourceCell,
  AgencyTierCell,
  DeleteAgencyButton,
} from "@/components/forms/agencies-crud";

export const dynamic = "force-dynamic";

type Tier = 1 | 2 | 3;

type AgencyRow = {
  id: string;
  name: string;
  email_domains: string[];
  trust_tier: Tier;
  source_id: string | null;
  created_at: string;
};

type SourceRow = { id: string; code: string; name: string };

const TIER_LABEL: Record<Tier, string> = {
  1: "Known good",
  2: "Default",
  3: "Watch",
};

const TIER_TONE: Record<Tier, string> = {
  1: "border-success/35 bg-success/10 text-success",
  2: "border-border bg-secondary text-fg-2",
  3: "border-warn/35 bg-warn/10 text-warn",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default async function AgenciesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: meRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const canManage = meRow?.role === "senior_editor";

  const admin = createServiceClient();
  const [{ data: agencies }, { data: sources }] = await Promise.all([
    admin
      .from("press_agencies")
      .select("id, name, email_domains, trust_tier, source_id, created_at")
      .order("name", { ascending: true }),
    admin
      .from("discovery_sources")
      .select("id, code, name")
      .order("name", { ascending: true }),
  ]);

  const rows: AgencyRow[] = (agencies ?? []) as AgencyRow[];
  const srcList: SourceRow[] = (sources ?? []) as SourceRow[];
  const sourceById = new Map(srcList.map((s) => [s.id, s] as const));

  const counts = rows.reduce(
    (acc, a) => {
      acc[a.trust_tier] = (acc[a.trust_tier] ?? 0) + 1;
      return acc;
    },
    {} as Record<Tier, number>,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">
          Press agencies
        </span>
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-um-muted">
          {rows.length} agenc{rows.length === 1 ? "y" : "ies"}
        </span>
        {!canManage ? (
          <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
            Read-only — senior editors can edit
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-5 rounded-md border border-border bg-card p-4">
          <div className="mb-1 flex items-start justify-between gap-4">
            <h2 className="text-[13px] font-semibold text-foreground">
              Inbound press senders
            </h2>
            {canManage ? <AddAgencyButton sources={srcList} /> : null}
          </div>
          <p className="text-[12px] leading-[1.5] text-um-muted">
            Maps inbound email domains to a press agency and an optional
            discovery source. Unknown senders fall back to{" "}
            <code className="rounded-sm bg-secondary px-1 font-mono text-[11px]">
              PRESS_MAILBOX
            </code>{" "}
            and land in the inbox as unverified.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-um-muted">
            <TierCount label="Known good" n={counts[1] ?? 0} tone="success" />
            <TierCount label="Default" n={counts[2] ?? 0} tone="muted" />
            <TierCount label="Watch" n={counts[3] ?? 0} tone="warn" />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <Th>Name</Th>
                <Th>Email domains</Th>
                <Th className="w-[170px]">Trust tier</Th>
                <Th className="w-[240px]">Discovery source</Th>
                <Th className="w-[110px]">Created</Th>
                <Th className="w-[60px] text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-[12.5px] text-um-muted"
                  >
                    No press agencies yet — add one to start matching inbound
                    senders.
                  </td>
                </tr>
              ) : null}
              {rows.map((a) => {
                const src = a.source_id ? sourceById.get(a.source_id) : null;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-b-0 hover:bg-secondary/40"
                  >
                    <td className="px-3 py-2">
                      {canManage ? (
                        <AgencyNameCell id={a.id} value={a.name} />
                      ) : (
                        <span className="text-[12.5px] text-foreground">
                          {a.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <AgencyDomainsCell id={a.id} value={a.email_domains} />
                      ) : (
                        <span className="font-mono text-[11.5px] text-fg-2">
                          {a.email_domains.join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <AgencyTierCell id={a.id} value={a.trust_tier} />
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${TIER_TONE[a.trust_tier]}`}
                        >
                          {a.trust_tier} — {TIER_LABEL[a.trust_tier]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <AgencySourceCell
                          id={a.id}
                          value={a.source_id}
                          sources={srcList}
                        />
                      ) : src ? (
                        <span className="text-[11.5px] text-fg-2">
                          {src.name}{" "}
                          <span className="font-mono text-um-muted">
                            ({src.code})
                          </span>
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-um-muted">
                          PRESS_MAILBOX
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] tabular-nums text-um-muted">
                      {fmtDate(a.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage ? (
                        <DeleteAgencyButton id={a.id} name={a.name} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`${className ?? ""} px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-um-muted`}
    >
      {children}
    </th>
  );
}

function TierCount({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "success" | "muted" | "warn";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : "text-um-muted";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-um-muted">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${cls}`}>{n}</span>
    </span>
  );
}
