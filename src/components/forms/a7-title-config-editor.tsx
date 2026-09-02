"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Loader2,
  Newspaper,
  Pause,
  Save,
  Settings,
} from "lucide-react";
import {
  GEO_TIERS,
  PRIMARY_FRAMES,
  WEEKDAYS,
  type TitleConfigRow,
} from "@/lib/spec/a7-title-config";
import {
  setTitleActive,
  updateTitleConfig,
  type TitleConfigActionResult,
} from "@/lib/actions/title-config";
import { cn } from "@/lib/utils";

type Completeness = {
  score: number;
  total: number;
  missing: string[];
};

export function TitleConfigEditor({
  row,
  completeness,
}: {
  row: TitleConfigRow;
  completeness: Completeness;
}) {
  // Brand
  const [name, setName] = useState(row.name);
  const [domain, setDomain] = useState(row.domain ?? "");
  const [tagline, setTagline] = useState(row.tagline ?? "");
  const [primaryColor, setPrimaryColor] = useState(row.primary_color ?? "");
  const [defaultFrame, setDefaultFrame] = useState<string>(
    row.default_frame ?? "",
  );

  // Editorial
  const [defaultSectors, setDefaultSectors] = useState(
    row.default_sectors.join(", "),
  );
  const [siloOptions, setSiloOptions] = useState(row.silo_options.join("\n"));
  const [defaultGeoTier, setDefaultGeoTier] = useState<string>(
    row.default_geo_tier ?? "",
  );
  const [slugPrefix, setSlugPrefix] = useState(row.slug_prefix ?? "");

  // Operational
  const [isActive, setIsActive] = useState(row.is_active);
  const [launchedAt, setLaunchedAt] = useState(row.launched_at ?? "");
  const [weeklyIssueDay, setWeeklyIssueDay] = useState<string>(
    row.weekly_issue_day != null ? String(row.weekly_issue_day) : "",
  );

  // Free-form jsonb
  const [configJson, setConfigJson] = useState(
    Object.keys(row.config ?? {}).length
      ? JSON.stringify(row.config, null, 2)
      : "",
  );

  // Save state
  const [pending, startTransition] = useTransition();
  const [pendingToggle, startToggleTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("name", name);
    fd.set("domain", domain);
    fd.set("tagline", tagline);
    fd.set("primary_color", primaryColor);
    fd.set("default_frame", defaultFrame);
    fd.set("default_sectors", defaultSectors);
    fd.set("silo_options", siloOptions);
    fd.set("default_geo_tier", defaultGeoTier);
    fd.set("slug_prefix", slugPrefix);
    if (isActive) fd.set("is_active", "1");
    fd.set("launched_at", launchedAt);
    fd.set("weekly_issue_day", weeklyIssueDay);
    fd.set("config_json", configJson);

    startTransition(async () => {
      const res: TitleConfigActionResult = await updateTitleConfig(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    });
  }

  function toggleActive() {
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("active", isActive ? "0" : "1");
    startToggleTransition(async () => {
      const res: TitleConfigActionResult = await setTitleActive(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIsActive(!isActive);
    });
  }

  return (
    <div className="space-y-4">
      {/* Header summary strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em]",
              isActive
                ? "border-success/45 bg-success/10 text-success"
                : "border-border bg-secondary text-um-muted",
            )}
          >
            {isActive ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
            {isActive ? "active" : "inactive"}
          </span>
          <button
            type="button"
            onClick={toggleActive}
            disabled={pendingToggle}
            className="h-7 rounded-md border border-border bg-background px-2.5 text-[11px] text-fg-2 hover:bg-secondary disabled:opacity-50"
          >
            {pendingToggle ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isActive ? (
              "Deactivate"
            ) : (
              "Activate"
            )}
          </button>
        </div>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          completeness {completeness.score}/{completeness.total}
          {completeness.missing.length
            ? ` · missing: ${completeness.missing.join(", ")}`
            : " · launch-ready"}
        </span>
      </div>

      {/* Brand panel */}
      <Panel icon={Newspaper} title="Brand &amp; display" hint="What readers see across the masthead, sharing previews, and embedded brand-frame defaults.">
        <Grid2>
          <Field label="Display name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="input"
            />
          </Field>
          <Field label="Domain">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              maxLength={240}
              placeholder="tech.unionmedia.example"
              className="input font-mono text-[12px]"
            />
          </Field>
          <Field label="Tagline" full>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={240}
              placeholder="The Scottish technology newsroom."
              className="input"
            />
          </Field>
          <Field label="Primary colour (hex)">
            <div className="mt-1 flex h-8 items-center gap-2">
              <input
                type="color"
                value={
                  primaryColor && /^#([0-9a-f]{6})$/i.test(primaryColor)
                    ? primaryColor
                    : "#1e7adb"
                }
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded-md border border-border bg-background"
              />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#1E7ADB"
                maxLength={20}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 font-mono text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
              />
            </div>
          </Field>
          <Field label="Default primary frame">
            <select
              value={defaultFrame}
              onChange={(e) => setDefaultFrame(e.target.value)}
              className="select"
            >
              <option value="">— pick one —</option>
              {PRIMARY_FRAMES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </Grid2>
      </Panel>

      {/* Editorial defaults */}
      <Panel
        icon={ChevronRight}
        title="Editorial defaults"
        hint="Surfaces these in the commissioning, A2 inventory, and A3 opportunities forms so new entries pre-populate sensibly."
      >
        <Grid2>
          <Field label="Default sectors (comma-separated)" full>
            <input
              value={defaultSectors}
              onChange={(e) => setDefaultSectors(e.target.value)}
              placeholder="AI, Fintech, Quantum"
              className="input"
            />
          </Field>
          <Field label="Silo options (one per line, or comma-separated)" full>
            <textarea
              value={siloOptions}
              onChange={(e) => setSiloOptions(e.target.value)}
              rows={4}
              placeholder={"Companies\nCapital\nGovernment\nUniversities"}
              className="textarea font-mono text-[12px]"
            />
          </Field>
          <Field label="Default geo tier">
            <select
              value={defaultGeoTier}
              onChange={(e) => setDefaultGeoTier(e.target.value)}
              className="select"
            >
              <option value="">— pick one —</option>
              {GEO_TIERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Slug prefix">
            <input
              value={slugPrefix}
              onChange={(e) => setSlugPrefix(e.target.value)}
              placeholder="tech/"
              maxLength={40}
              className="input font-mono text-[12px]"
            />
          </Field>
        </Grid2>
      </Panel>

      {/* Operational */}
      <Panel
        icon={Globe2}
        title="Operational"
        hint="Launch state and K5 sweep day. Inactive titles stay queryable but commissioning is gated."
      >
        <Grid2>
          <Field label="Launched at">
            <input
              type="date"
              value={launchedAt}
              onChange={(e) => setLaunchedAt(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Weekly issue day">
            <select
              value={weeklyIssueDay}
              onChange={(e) => setWeeklyIssueDay(e.target.value)}
              className="select"
            >
              <option value="">— pick one —</option>
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
        </Grid2>
      </Panel>

      {/* Free-form */}
      <Panel
        icon={Settings}
        title="Custom JSON"
        hint="Free-form jsonb config. Used by surfaces that don't yet have first-class columns — keep it small."
      >
        <textarea
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={6}
          placeholder='{ "feature_flag_x": true }'
          className="textarea font-mono text-[12px]"
        />
      </Panel>

      {/* Save bar */}
      <div className="sticky bottom-3 flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Save configuration
        </button>
        {saved ? (
          <span className="flex items-center gap-1 text-[11.5px] text-success">
            <CheckCircle2 className="h-3 w-3" />
            saved
          </span>
        ) : null}
        {error ? (
          <span className="flex items-center gap-1 text-[11.5px] text-destructive">
            <AlertCircle className="h-3 w-3" />
            {error}
          </span>
        ) : null}
      </div>

      {/* Local utility class fallback — using <style jsx> would scope, but
          tailwind shorthand keeps consistency. */}
      <style>{`
        .input{margin-top:.25rem;height:2rem;width:100%;border-radius:.375rem;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:0 .625rem;font-size:12.5px;color:hsl(var(--foreground));outline:none;}
        .input:focus{border-color:hsl(var(--primary)/0.4);}
        .select{margin-top:.25rem;height:2rem;width:100%;border-radius:.375rem;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:0 .5rem;font-size:12px;color:hsl(var(--foreground));outline:none;}
        .select:focus{border-color:hsl(var(--primary)/0.4);}
        .textarea{margin-top:.25rem;width:100%;resize:vertical;border-radius:.375rem;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:.375rem .625rem;font-size:12px;line-height:1.45;color:hsl(var(--foreground));outline:none;}
        .textarea:focus{border-color:hsl(var(--primary)/0.4);}
      `}</style>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border bg-background/30 px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[12.5px] font-semibold text-foreground">{title}</h2>
        {hint ? (
          <span className="text-[10.5px] text-um-muted">{hint}</span>
        ) : null}
      </header>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(full ? "md:col-span-2" : "")}>
      <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
