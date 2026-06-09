"use client";

import { useMemo, useState, useTransition } from "react";
import { Send, Loader2, ClipboardCopy, ClipboardCheck } from "lucide-react";
import {
  callCompleteSweep,
  callIngestAlert,
  callIngestItem,
  callOpenSweep,
  type ProxyResult,
} from "@/lib/actions/test-ingest";
import { cn } from "@/lib/utils";

type SourceOpt = { code: string; name: string };
type OpenSweepOpt = { id: string; code: string; slot: "am" | "pm" };

type Tab = "open" | "item" | "complete" | "alert";

const TABS: { id: Tab; label: string; path: string }[] = [
  { id: "open", label: "Open Sweep", path: "POST /api/ingest/sweep" },
  { id: "item", label: "Ingest Item", path: "POST /api/ingest/item" },
  { id: "complete", label: "Complete Sweep", path: "POST /api/ingest/sweep/:id/complete" },
  { id: "alert", label: "File Alert", path: "POST /api/ingest/alert" },
];

export function TestIngestConsole({
  sources,
  openSweeps,
}: {
  sources: SourceOpt[];
  openSweeps: OpenSweepOpt[];
}) {
  const [tab, setTab] = useState<Tab>("open");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-um-muted hover:text-foreground",
            )}
          >
            {t.label}
            <span className="ml-2 font-mono text-[10px] text-um-muted">{t.path}</span>
          </button>
        ))}
      </div>

      <div className="rounded-md border border-border bg-card">
        {tab === "open" && <OpenSweepPanel />}
        {tab === "item" && (
          <IngestItemPanel sources={sources} openSweeps={openSweeps} />
        )}
        {tab === "complete" && (
          <CompleteSweepPanel sources={sources} openSweeps={openSweeps} />
        )}
        {tab === "alert" && (
          <AlertPanel sources={sources} openSweeps={openSweeps} />
        )}
      </div>
    </div>
  );
}

// ─── shared shell ─────────────────────────────────────────────

function PanelShell({
  payload,
  result,
  pending,
  onSend,
  children,
}: {
  payload: unknown;
  result: ProxyResult | null;
  pending: boolean;
  onSend: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_1fr]">
      <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-3">{children}</div>
        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={onSend}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border border-primary bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60",
            )}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <PayloadBlock label="Request payload" value={JSON.stringify(payload, null, 2)} />
        {result ? (
          <ResponseBlock result={result} />
        ) : (
          <div className="rounded-sm border border-dashed border-border p-3 text-[11.5px] text-um-muted">
            Response will appear here.
          </div>
        )}
      </div>
    </div>
  );
}

function PayloadBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-sm border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-2 py-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-um-muted">
          {label}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="inline-flex items-center gap-1 text-[10.5px] text-um-muted hover:text-foreground"
        >
          {copied ? (
            <ClipboardCheck className="h-3 w-3 text-success" />
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[280px] overflow-auto px-2 py-1.5 font-mono text-[11px] leading-[1.5] text-foreground">
        {value}
      </pre>
    </div>
  );
}

function ResponseBlock({ result }: { result: ProxyResult }) {
  const tone =
    result.status >= 200 && result.status < 300
      ? "border-success/30 bg-success/10 text-success"
      : result.status >= 400
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-warn/30 bg-warn/10 text-warn";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("rounded-sm border px-1.5 py-0.5 text-[10.5px] font-mono", tone)}>
          {result.status} {result.ok ? "OK" : "ERR"}
        </span>
        <span className="truncate font-mono text-[10.5px] text-um-muted">{result.url}</span>
      </div>
      <PayloadBlock
        label="Response body"
        value={
          typeof result.body === "string"
            ? result.body
            : JSON.stringify(result.body, null, 2)
        }
      />
      <PayloadBlock label="curl" value={result.curl} />
    </div>
  );
}

// ─── shared field primitives ──────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-um-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "h-7 rounded-sm border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none";

const selectCls = inputCls + " cursor-pointer";

const textareaCls =
  "rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-[11.5px] text-foreground focus:border-primary focus:outline-none";

// ─── Open sweep ───────────────────────────────────────────────

function OpenSweepPanel() {
  const [slot, setSlot] = useState<"am" | "pm">("am");
  const [trigger, setTrigger] = useState<"scheduled" | "manual" | "webhook">("manual");
  const [startedAt, setStartedAt] = useState("");
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [pending, startTransition] = useTransition();

  const payload = useMemo(() => {
    const p: Record<string, unknown> = { slot, trigger };
    if (startedAt) p.started_at = new Date(startedAt).toISOString();
    return p;
  }, [slot, trigger, startedAt]);

  function onSend() {
    startTransition(async () => {
      const r = await callOpenSweep(payload as Parameters<typeof callOpenSweep>[0]);
      setResult(r);
    });
  }

  return (
    <PanelShell payload={payload} result={result} pending={pending} onSend={onSend}>
      <Field label="Slot">
        <select
          className={selectCls}
          value={slot}
          onChange={(e) => setSlot(e.target.value as "am" | "pm")}
        >
          <option value="am">am</option>
          <option value="pm">pm</option>
        </select>
      </Field>
      <Field label="Trigger">
        <select
          className={selectCls}
          value={trigger}
          onChange={(e) =>
            setTrigger(e.target.value as "scheduled" | "manual" | "webhook")
          }
        >
          <option value="scheduled">scheduled</option>
          <option value="manual">manual</option>
          <option value="webhook">webhook</option>
        </select>
      </Field>
      <Field label="Started at (optional, local time)">
        <input
          type="datetime-local"
          className={inputCls}
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
        />
      </Field>
    </PanelShell>
  );
}

// ─── Ingest item ──────────────────────────────────────────────

function IngestItemPanel({
  sources,
  openSweeps,
}: {
  sources: SourceOpt[];
  openSweeps: OpenSweepOpt[];
}) {
  const [sweepId, setSweepId] = useState(openSweeps[0]?.id ?? "");
  const [sourceCode, setSourceCode] = useState(sources[0]?.code ?? "");
  const [kind, setKind] = useState<"rss" | "email" | "pdf" | "web" | "generic">("rss");
  const [headline, setHeadline] = useState("Test headline — replace with real one");
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [externalId, setExternalId] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [author, setAuthor] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [pending, startTransition] = useTransition();

  const payload = useMemo(() => {
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const item: Record<string, unknown> = { headline };
    if (externalId) item.external_id = externalId;
    if (primaryUrl) item.primary_url = primaryUrl;
    if (publishedAt) item.published_at = new Date(publishedAt).toISOString();
    if (summary) item.summary = summary;
    if (bodyText) item.body_text = bodyText;
    if (author) item.author = author;
    if (tags.length > 0) item.tags = tags;
    const p: Record<string, unknown> = {
      sweep_id: sweepId,
      source_code: sourceCode,
      kind,
      item,
    };
    if (fetchedAt) p.fetched_at = new Date(fetchedAt).toISOString();
    return p;
  }, [
    sweepId,
    sourceCode,
    kind,
    headline,
    primaryUrl,
    externalId,
    summary,
    bodyText,
    author,
    tagsRaw,
    publishedAt,
    fetchedAt,
  ]);

  function onSend() {
    startTransition(async () => {
      const r = await callIngestItem(payload);
      setResult(r);
    });
  }

  return (
    <PanelShell payload={payload} result={result} pending={pending} onSend={onSend}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sweep">
          <select
            className={selectCls}
            value={sweepId}
            onChange={(e) => setSweepId(e.target.value)}
          >
            {openSweeps.length === 0 ? (
              <option value="">(no running sweeps — open one first)</option>
            ) : (
              openSweeps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.slot}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="Source">
          <select
            className={selectCls}
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <select
            className={selectCls}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="rss">rss</option>
            <option value="email">email</option>
            <option value="pdf">pdf</option>
            <option value="web">web</option>
            <option value="generic">generic</option>
          </select>
        </Field>
        <Field label="External id (optional)">
          <input
            className={inputCls}
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="rss guid, message-id, etc."
          />
        </Field>
      </div>
      <Field label="Headline">
        <input
          className={inputCls}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </Field>
      <Field label="Primary URL (optional)">
        <input
          className={inputCls}
          value={primaryUrl}
          onChange={(e) => setPrimaryUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Author (optional)">
          <input
            className={inputCls}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            className={inputCls}
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Published at (optional)">
          <input
            type="datetime-local"
            className={inputCls}
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
          />
        </Field>
        <Field label="Fetched at (optional)">
          <input
            type="datetime-local"
            className={inputCls}
            value={fetchedAt}
            onChange={(e) => setFetchedAt(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Summary (optional)">
        <textarea
          className={textareaCls}
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </Field>
      <Field label="Body text (optional)">
        <textarea
          className={textareaCls}
          rows={4}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
      </Field>
    </PanelShell>
  );
}

// ─── Complete sweep ───────────────────────────────────────────

type SiteResultRow = {
  source_code: string;
  outcome: "reached_items" | "reached_empty" | "parse_failure" | "not_reached";
  http_status: string;
  parse_issue_count: string;
  resolved_primary_url: string;
};

function CompleteSweepPanel({
  sources,
  openSweeps,
}: {
  sources: SourceOpt[];
  openSweeps: OpenSweepOpt[];
}) {
  const [sweepId, setSweepId] = useState(openSweeps[0]?.id ?? "");
  const [rows, setRows] = useState<SiteResultRow[]>([
    {
      source_code: sources[0]?.code ?? "",
      outcome: "reached_items",
      http_status: "200",
      parse_issue_count: "0",
      resolved_primary_url: "",
    },
  ]);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [pending, startTransition] = useTransition();

  const payload = useMemo(
    () => ({
      site_results: rows.map((r) => ({
        source_code: r.source_code,
        outcome: r.outcome,
        http_status: r.http_status ? Number(r.http_status) : null,
        parse_issue_count: r.parse_issue_count ? Number(r.parse_issue_count) : 0,
        resolved_primary_url: r.resolved_primary_url || null,
      })),
    }),
    [rows],
  );

  function onSend() {
    if (!sweepId) return;
    startTransition(async () => {
      const r = await callCompleteSweep(sweepId, payload);
      setResult(r);
    });
  }

  function patchRow(i: number, patch: Partial<SiteResultRow>) {
    setRows((rs) => rs.map((r, ix) => (ix === i ? { ...r, ...patch } : r)));
  }

  return (
    <PanelShell payload={payload} result={result} pending={pending} onSend={onSend}>
      <Field label="Sweep">
        <select
          className={selectCls}
          value={sweepId}
          onChange={(e) => setSweepId(e.target.value)}
        >
          {openSweeps.length === 0 ? (
            <option value="">(no running sweeps)</option>
          ) : (
            openSweeps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.slot}
              </option>
            ))
          )}
        </select>
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-um-muted">
            Site results
          </span>
          <button
            type="button"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                {
                  source_code: sources[0]?.code ?? "",
                  outcome: "reached_items",
                  http_status: "200",
                  parse_issue_count: "0",
                  resolved_primary_url: "",
                },
              ])
            }
            className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-um-muted hover:text-foreground"
          >
            + add row
          </button>
        </div>

        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.7fr_auto] gap-2 rounded-sm border border-border bg-background p-2"
          >
            <select
              className={selectCls}
              value={row.source_code}
              onChange={(e) => patchRow(i, { source_code: e.target.value })}
            >
              {sources.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>
            <select
              className={selectCls}
              value={row.outcome}
              onChange={(e) =>
                patchRow(i, { outcome: e.target.value as SiteResultRow["outcome"] })
              }
            >
              <option value="reached_items">reached_items</option>
              <option value="reached_empty">reached_empty</option>
              <option value="parse_failure">parse_failure</option>
              <option value="not_reached">not_reached</option>
            </select>
            <input
              className={inputCls}
              placeholder="HTTP"
              value={row.http_status}
              onChange={(e) => patchRow(i, { http_status: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="parse issues"
              value={row.parse_issue_count}
              onChange={(e) => patchRow(i, { parse_issue_count: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, ix) => ix !== i))}
              className="rounded-sm border border-border px-2 text-[11px] text-um-muted hover:text-destructive"
              aria-label="Remove row"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ─── Alert ────────────────────────────────────────────────────

function AlertPanel({
  sources,
  openSweeps,
}: {
  sources: SourceOpt[];
  openSweeps: OpenSweepOpt[];
}) {
  const [sourceCode, setSourceCode] = useState(sources[0]?.code ?? "");
  const [sweepId, setSweepId] = useState("");
  const [severity, setSeverity] = useState<"p1" | "p2" | "p3">("p2");
  const [issueType, setIssueType] = useState<
    | "parse_failure"
    | "unreachable"
    | "rate_limit"
    | "schema_drift"
    | "volume_anomaly"
    | "wordpress_check"
    | "config"
    | "timeout"
  >("parse_failure");
  const [description, setDescription] = useState(
    "Test alert raised from the in-app console.",
  );
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [pending, startTransition] = useTransition();

  const payload = useMemo(() => {
    const p: Record<string, unknown> = {
      source_code: sourceCode,
      severity,
      issue_type: issueType,
      description,
    };
    if (sweepId) p.sweep_id = sweepId;
    return p;
  }, [sourceCode, sweepId, severity, issueType, description]);

  function onSend() {
    startTransition(async () => {
      const r = await callIngestAlert(payload);
      setResult(r);
    });
  }

  return (
    <PanelShell payload={payload} result={result} pending={pending} onSend={onSend}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source">
          <select
            className={selectCls}
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sweep (optional)">
          <select
            className={selectCls}
            value={sweepId}
            onChange={(e) => setSweepId(e.target.value)}
          >
            <option value="">(none)</option>
            {openSweeps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.slot}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Severity">
          <select
            className={selectCls}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "p1" | "p2" | "p3")}
          >
            <option value="p1">p1 — 1h SLA</option>
            <option value="p2">p2 — 4h SLA</option>
            <option value="p3">p3 — 24h SLA</option>
          </select>
        </Field>
        <Field label="Issue type">
          <select
            className={selectCls}
            value={issueType}
            onChange={(e) => setIssueType(e.target.value as typeof issueType)}
          >
            <option value="parse_failure">parse_failure</option>
            <option value="unreachable">unreachable</option>
            <option value="rate_limit">rate_limit</option>
            <option value="schema_drift">schema_drift</option>
            <option value="volume_anomaly">volume_anomaly</option>
            <option value="wordpress_check">wordpress_check</option>
            <option value="config">config</option>
            <option value="timeout">timeout</option>
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea
          className={textareaCls}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
    </PanelShell>
  );
}
