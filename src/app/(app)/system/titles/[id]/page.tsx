import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  configCompleteness,
  type TitleConfigRow,
} from "@/lib/spec/a7-title-config";
import { TitleConfigEditor } from "@/components/forms/a7-title-config-editor";

export const dynamic = "force-dynamic";

/**
 * A7 / Section G — single-title editor at `/system/titles/[id]`.
 *
 * Senior-only. Renders the full Section G surface for one publication
 * silo: the brand, editorial and operational form panels.
 */

export default async function TitleConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
  const { data: row } = await admin
    .from("titles")
    .select(
      "id, slug, name, domain, tagline, primary_color, default_frame, default_sectors, silo_options, default_geo_tier, slug_prefix, is_active, launched_at, weekly_issue_day, config, created_at, updated_at, config_updated_at, config_updated_by",
    )
    .eq("id", id)
    .maybeSingle<TitleConfigRow>();

  if (!row) notFound();

  const cc = configCompleteness(row);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-baseline gap-3 px-6 py-3">
          <Link
            href="/system/titles"
            className="flex items-center gap-1 text-[12px] text-fg-2 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All titles
          </Link>
          <span className="text-border-mid">/</span>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
            {row.slug}
          </span>
          <h1 className="text-[14px] font-semibold tracking-tight">
            {row.name}
          </h1>
          <span className="ml-auto font-mono text-[10.5px] text-um-muted">
            config {cc.score}/{cc.total}
            {row.config_updated_at
              ? ` · saved ${new Date(row.config_updated_at).toLocaleString(
                  "en-GB",
                  {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}`
              : " · never saved"}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-4">
        <TitleConfigEditor
          row={row}
          completeness={cc}
        />
      </div>
    </div>
  );
}
