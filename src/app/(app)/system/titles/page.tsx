import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CheckCircle2, Newspaper, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  configCompleteness,
  type TitleConfigRow,
} from "@/lib/spec/a7-title-config";
import { CreateTitleForm } from "@/components/forms/a7-create-title";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * A7 / Section G — `/system/titles`.
 *
 * Senior-only management of publication silos. Each title gets a row with
 * its launch state and configuration
 * completeness score. Per-row "Configure" deep-links to the title editor.
 */

export default async function TitlesIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: meRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string | null }>();
  if (meRow?.role !== "admin") {
    redirect("/");
  }

  const admin = createServiceClient();
  const { data: titles } = await admin
    .from("titles")
    .select(
      "id, slug, name, domain, tagline, primary_color, default_frame, default_sectors, silo_options, default_geo_tier, slug_prefix, is_active, launched_at, weekly_issue_day, config, created_at, updated_at, config_updated_at, config_updated_by",
    )
    .order("is_active", { ascending: false })
    .order("name", { ascending: true })
    .returns<TitleConfigRow[]>();

  const rows = titles ?? [];
  const activeCount = rows.filter((r) => r.is_active).length;
  const launchReady = rows.filter(
    (r) => {
      const c = configCompleteness(r);
      return c.score === c.total;
    },
  ).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-baseline gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-primary" />
            <h1 className="text-[14px] font-semibold tracking-tight">
              Titles · A7 / Section G per-title configuration
            </h1>
          </div>
          <span className="font-mono text-[11px] text-um-muted">
            {rows.length} titles · {activeCount} active · {launchReady} launch-ready
          </span>
          <div className="ml-auto">
            <CreateTitleForm />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] space-y-3 px-6 py-4">
        <p className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
          <strong className="text-fg-2">Section G policy:</strong> each title
          carries its brand frame defaults, silo taxonomy and Friday-sweep day.
          Publishing credentials are <em>not</em> held here — Newsroom V1 owns
          publishing, and one copy of a WordPress app-password is safer than
          two. Inactive titles still appear in the discovery surfaces.
        </p>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border bg-background/40 text-left">
                <th className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                  Title
                </th>
                <th className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                  Active
                </th>
                <th className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                  Config
                </th>
                <th className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                  Launched
                </th>
                <th className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-[12.5px] text-um-muted"
                  >
                    No titles configured yet — use “New title” to add the
                    first publication silo.
                  </td>
                </tr>
              ) : (
                rows.map((t) => {
                  const cc = configCompleteness(t);
                  const ratio = cc.score / cc.total;
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-sm border border-border"
                            style={{
                              backgroundColor:
                                t.primary_color ?? "transparent",
                            }}
                            title={t.primary_color ?? "(no colour)"}
                          />
                          <Link
                            href={`/system/titles/${t.id}`}
                            className="text-[12.5px] font-medium text-primary hover:underline"
                          >
                            {t.name}
                          </Link>
                          <span className="font-mono text-[10.5px] text-um-muted">
                            /{t.slug}
                          </span>
                        </div>
                        {t.tagline ? (
                          <p className="mt-0.5 text-[11px] text-fg-2">{t.tagline}</p>
                        ) : null}
                        {t.domain ? (
                          <p className="mt-0.5 font-mono text-[10.5px] text-um-muted">
                            {t.domain}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {t.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-success/45 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-success">
                            <CheckCircle2 className="h-3 w-3" />
                            active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-um-muted">
                            <XCircle className="h-3 w-3" />
                            inactive
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                "h-full",
                                ratio === 1
                                  ? "bg-success"
                                  : ratio >= 0.6
                                    ? "bg-primary"
                                    : "bg-warn",
                              )}
                              style={{ width: `${ratio * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10.5px] text-um-muted">
                            {cc.score}/{cc.total}
                          </span>
                        </div>
                        {cc.missing.length ? (
                          <p
                            className="mt-0.5 text-[10.5px] leading-[1.4] text-um-muted"
                            title={cc.missing.join(" · ")}
                          >
                            missing: {cc.missing[0]}
                            {cc.missing.length > 1
                              ? ` (+${cc.missing.length - 1})`
                              : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-[10.5px] text-um-muted">
                        {t.launched_at ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <Link
                          href={`/system/titles/${t.id}`}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] text-fg-2 hover:bg-secondary"
                        >
                          <Building2 className="h-3 w-3" />
                          Configure
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
