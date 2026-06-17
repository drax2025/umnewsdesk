"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  Loader2,
  Save,
  X,
} from "lucide-react";
import {
  EMPTY_NFP_FOOTER,
  NFP_FOOTER_FIELD_LABELS,
  normaliseNFPFooter,
  summariseNFPFooter,
  type DependencyStatus,
  type M3Outcome,
  type NFPFooterField,
  type NFPFooterFields,
  type ProductionOption,
  type VerbatimAuditResult,
  type VideoScriptStatus,
} from "@/lib/spec/nfp-footer";
import {
  saveNFPFooter,
  type ResearchActionResult,
} from "@/lib/actions/research";
import { cn } from "@/lib/utils";

/**
 * B7 / B8 / C9 / H9 / A9 — structured NFP footer author + audit surface.
 *
 * Two columns:
 *   - Audit roll-up (left): pass/fail per required field, tier-aware.
 *   - Form (right): every field with its own input; arrays use chip editors.
 *
 * Companion to the free-text `nfp_footer_draft` (paragraph notes still belong
 * there). On save, the entire object is round-tripped through the JSONB
 * column and the H9 / A9 auditors read field-by-field.
 */

type Props = {
  articleId: string;
  initial: unknown;
  defamationTier: 1 | 2 | 3 | null;
  readOnly?: boolean;
};

export function NFPFooterEditor({
  articleId,
  initial,
  defamationTier,
  readOnly = false,
}: Props) {
  const initialFields = useMemo(() => normaliseNFPFooter(initial), [initial]);
  const [fields, setFields] = useState<NFPFooterFields>(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [pending, startTransition] = useTransition();

  const summary = summariseNFPFooter(fields, defamationTier);

  function patch<K extends keyof NFPFooterFields>(
    key: K,
    value: NFPFooterFields[K],
  ) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function reset() {
    setFields(EMPTY_NFP_FOOTER);
    setSaved(false);
  }

  function save() {
    if (readOnly) return;
    setError(null);
    const fd = new FormData();
    fd.set("article_id", articleId);
    fd.set("nfp_footer_fields", JSON.stringify(fields));
    startTransition(async () => {
      const res: ResearchActionResult = await saveNFPFooter(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
        <FileSignature className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
          NFP footer · structured
        </h2>
        <span className="ml-1 font-mono text-[10px] text-um-muted">
          B7 · B8 · C9 · H9 · A9
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-um-muted">
          {summary.populated}/{summary.total} required field
          {summary.total === 1 ? "" : "s"}
        </span>
        {summary.complete ? (
          <span className="flex items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-success">
            <CheckCircle2 className="h-3 w-3" />
            complete
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-warn">
            <AlertTriangle className="h-3 w-3" />
            incomplete
          </span>
        )}
        {!readOnly ? (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex h-7 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save footer
          </button>
        ) : null}
      </header>

      <p className="border-b border-border bg-background/30 px-3 py-2 text-[10.5px] leading-[1.5] text-um-muted">
        Field-by-field NFP footer. H9 audits this on file in F6; A9 reverifies
        at F7. Free-text paragraph notes remain in the legacy draft field below.
      </p>

      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[260px_1fr]">
        {/* Audit panel */}
        <AuditPanel summary={summary} fields={fields} tier={defamationTier} />

        {/* Form */}
        <div className="space-y-3">
          <TwoCol>
            <FieldText
              label="Primary source URL"
              field="primary_source_url"
              missing={summary.missing}
              value={fields.primary_source_url ?? ""}
              onChange={(v) => patch("primary_source_url", v || null)}
              placeholder="https://…"
              mono
              disabled={readOnly || pending}
            />
            <FieldNumber
              label="Word count"
              field="word_count"
              missing={summary.missing}
              value={fields.word_count}
              onChange={(v) => patch("word_count", v)}
              disabled={readOnly || pending}
            />
          </TwoCol>

          <ArrayChips
            label="Independent confirmations"
            field="independent_confirmations"
            missing={summary.missing}
            values={fields.independent_confirmations}
            onChange={(v) => patch("independent_confirmations", v)}
            placeholder="Paste an independent confirmation URL or citation"
            disabled={readOnly || pending}
          />

          <TwoCol>
            <FieldSelect
              label="Dependency status (B2)"
              field="dependency_status"
              missing={summary.missing}
              value={fields.dependency_status}
              onChange={(v) =>
                patch("dependency_status", v as DependencyStatus | null)
              }
              options={[
                { value: "clean", label: "Clean — no exposure" },
                { value: "digit_exposed", label: "DIGIT exposed" },
                { value: "futurescot_exposed", label: "Futurescot exposed" },
                { value: "sfn_exposed", label: "SFN exposed" },
              ]}
              disabled={readOnly || pending}
            />
            <FieldSelect
              label="Verbatim audit (B1)"
              field="verbatim_audit_result"
              missing={summary.missing}
              value={fields.verbatim_audit_result}
              onChange={(v) =>
                patch("verbatim_audit_result", v as VerbatimAuditResult | null)
              }
              options={[
                { value: "pass", label: "Pass" },
                { value: "fail", label: "Fail" },
                { value: "pending", label: "Pending" },
              ]}
              disabled={readOnly || pending}
            />
          </TwoCol>

          <TwoCol>
            <FieldText
              label="Selected backdate (B5)"
              field="selected_backdate"
              missing={summary.missing}
              value={fields.selected_backdate ?? ""}
              onChange={(v) => patch("selected_backdate", v || null)}
              placeholder="YYYY-MM-DD (blank for Tier 3)"
              mono
              disabled={readOnly || pending}
            />
            <FieldSelect
              label="Defamation tier"
              field="defamation_tier"
              missing={summary.missing}
              value={fields.defamation_tier?.toString() ?? null}
              onChange={(v) =>
                patch(
                  "defamation_tier",
                  v === "1" || v === "2" || v === "3"
                    ? (Number(v) as 1 | 2 | 3)
                    : null,
                )
              }
              options={[
                { value: "1", label: "Tier 1" },
                { value: "2", label: "Tier 2" },
                { value: "3", label: "Tier 3" },
              ]}
              disabled={readOnly || pending}
            />
          </TwoCol>

          <TwoCol>
            <FieldNumber
              label="Internal link count (B4)"
              field="internal_link_count"
              missing={summary.missing}
              value={fields.internal_link_count}
              onChange={(v) => patch("internal_link_count", v)}
              disabled={readOnly || pending}
            />
            <FieldNumber
              label="Outbound link count (B4)"
              field="outbound_link_count"
              missing={summary.missing}
              value={fields.outbound_link_count}
              onChange={(v) => patch("outbound_link_count", v)}
              disabled={readOnly || pending}
            />
          </TwoCol>

          <TwoCol>
            <FieldSelect
              label="Video script status"
              field="video_script_status"
              missing={summary.missing}
              value={fields.video_script_status}
              onChange={(v) =>
                patch("video_script_status", v as VideoScriptStatus | null)
              }
              options={[
                { value: "pending", label: "Pending" },
                { value: "drafted", label: "Drafted" },
                { value: "approved", label: "Approved" },
                { value: "n_a", label: "N/A" },
              ]}
              disabled={readOnly || pending}
            />
            <FieldSelect
              label="M3 outcome"
              field="m3_outcome"
              missing={summary.missing}
              value={fields.m3_outcome}
              onChange={(v) => patch("m3_outcome", v as M3Outcome | null)}
              options={[
                { value: "pass", label: "Pass" },
                { value: "fail", label: "Fail" },
                { value: "n_a", label: "N/A" },
              ]}
              disabled={readOnly || pending}
            />
          </TwoCol>

          <TwoCol>
            <FieldText
              label="Triage outcome (F1)"
              field="triage_outcome"
              missing={summary.missing}
              value={fields.triage_outcome ?? ""}
              onChange={(v) => patch("triage_outcome", v || null)}
              placeholder="One-line F1 outcome"
              disabled={readOnly || pending}
            />
            <FieldSelect
              label="Production option"
              field="production_option"
              missing={summary.missing}
              value={fields.production_option?.toString() ?? null}
              onChange={(v) =>
                patch(
                  "production_option",
                  v === "1" || v === "2" || v === "3"
                    ? (Number(v) as ProductionOption)
                    : null,
                )
              }
              options={[
                { value: "1", label: "Option 1" },
                { value: "2", label: "Option 2" },
                { value: "3", label: "Option 3" },
              ]}
              disabled={readOnly || pending}
            />
          </TwoCol>

          <FieldTextarea
            label="Framing brief recap"
            field="framing_brief_recap"
            missing={summary.missing}
            value={fields.framing_brief_recap ?? ""}
            onChange={(v) => patch("framing_brief_recap", v || null)}
            placeholder="One-paragraph framing summary that survived into the live article."
            disabled={readOnly || pending}
          />

          <ArrayChips
            label="Three headline options (B6)"
            field="headline_options"
            missing={summary.missing}
            values={fields.headline_options}
            onChange={(v) => patch("headline_options", v)}
            placeholder="Add headline option text"
            max={3}
            disabled={readOnly || pending}
          />

          <TwoCol>
            <FieldText
              label="Agent headline pick (B6.1)"
              field="agent_headline_pick"
              missing={summary.missing}
              value={fields.agent_headline_pick ?? ""}
              onChange={(v) => patch("agent_headline_pick", v || null)}
              placeholder="Exact live-headline text picked"
              disabled={readOnly || pending}
            />
            <FieldText
              label="Pick rationale (B6.1)"
              field="agent_headline_rationale"
              missing={summary.missing}
              value={fields.agent_headline_rationale ?? ""}
              onChange={(v) => patch("agent_headline_rationale", v || null)}
              placeholder="Click-bait-leaning rationale"
              disabled={readOnly || pending}
            />
          </TwoCol>
        </div>
      </div>

      {error ? (
        <div className="border-t border-border bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : saved ? (
        <div className="border-t border-border bg-success/5 px-3 py-2 text-[11px] text-success">
          Saved.
        </div>
      ) : null}

      {!readOnly ? (
        <div className="flex items-center gap-2 border-t border-border bg-background/30 px-3 py-2">
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="h-7 rounded-sm border border-border bg-background px-2.5 text-[11px] font-medium text-fg-2 hover:bg-secondary disabled:opacity-50"
          >
            Reset form
          </button>
          <span className="ml-auto text-[10.5px] italic text-um-muted">
            Tier-aware required fields update as you change the tier value.
          </span>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Audit panel                                                               */
/* -------------------------------------------------------------------------- */

function AuditPanel({
  summary,
  fields,
  tier,
}: {
  summary: ReturnType<typeof summariseNFPFooter>;
  fields: NFPFooterFields;
  tier: 1 | 2 | 3 | null;
}) {
  return (
    <aside className="space-y-2 rounded-md border border-border bg-background/40 p-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-um-muted">
        Audit roll-up
      </div>
      <div className="space-y-1 text-[11px]">
        <Row
          label="Defamation tier"
          value={tier ? `Tier ${tier}` : "—"}
          ok={tier !== null}
        />
        <Row
          label="Backdate required"
          value={tier === 3 ? "No (Tier 3)" : "Yes"}
          ok
        />
        <Row
          label="M3 required"
          value={tier === 2 ? "Yes (Tier 2)" : "No"}
          ok
        />
      </div>
      <div className="mt-2 border-t border-border pt-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-um-muted">
          Missing fields
        </div>
        {summary.missing.length === 0 ? (
          <div className="mt-1 text-[10.5px] text-success">All populated.</div>
        ) : (
          <ul className="mt-1 space-y-0.5 text-[10.5px]">
            {summary.missing.map((m) => (
              <li
                key={m}
                className="flex items-center gap-1 text-warn"
              >
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                {NFP_FOOTER_FIELD_LABELS[m]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 border-t border-border pt-2 text-[10.5px] text-um-muted">
        {fields.primary_source_url ? (
          <div className="line-clamp-2 font-mono text-[10px]">
            primary · {fields.primary_source_url}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-um-muted">{label}</span>
      <span className="ml-auto font-mono text-[10.5px]">
        {value}
      </span>
      {ok ? (
        <CheckCircle2 className="h-3 w-3 text-success" />
      ) : (
        <AlertTriangle className="h-3 w-3 text-warn" />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Field primitives                                                          */
/* -------------------------------------------------------------------------- */

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

function fieldLabelCls(field: NFPFooterField, missing: NFPFooterField[]) {
  return cn(
    "font-mono text-[10px] uppercase tracking-[0.05em]",
    missing.includes(field) ? "text-warn" : "text-um-muted",
  );
}

function FieldText({
  label,
  field,
  missing,
  value,
  onChange,
  placeholder,
  mono = false,
  disabled = false,
}: {
  label: string;
  field: NFPFooterField;
  missing: NFPFooterField[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={fieldLabelCls(field, missing)}>
        {label}
        {missing.includes(field) ? " · missing" : ""}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-8 w-full rounded-md border border-border bg-background px-2.5 text-foreground placeholder:text-um-muted disabled:opacity-60",
          mono ? "font-mono text-[11px]" : "text-[12px]",
        )}
      />
    </label>
  );
}

function FieldTextarea({
  label,
  field,
  missing,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  field: NFPFooterField;
  missing: NFPFooterField[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={fieldLabelCls(field, missing)}>
        {label}
        {missing.includes(field) ? " · missing" : ""}
      </span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={2400}
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-foreground placeholder:text-um-muted disabled:opacity-60"
      />
    </label>
  );
}

function FieldNumber({
  label,
  field,
  missing,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  field: NFPFooterField;
  missing: NFPFooterField[];
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={fieldLabelCls(field, missing)}>
        {label}
        {missing.includes(field) ? " · missing" : ""}
      </span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") {
            onChange(null);
            return;
          }
          const n = Number.parseInt(raw, 10);
          onChange(Number.isFinite(n) ? n : null);
        }}
        min={0}
        disabled={disabled}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[12px] tabular-nums text-foreground disabled:opacity-60"
      />
    </label>
  );
}

function FieldSelect({
  label,
  field,
  missing,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  field: NFPFooterField;
  missing: NFPFooterField[];
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={fieldLabelCls(field, missing)}>
        {label}
        {missing.includes(field) ? " · missing" : ""}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground disabled:opacity-60"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ArrayChips({
  label,
  field,
  missing,
  values,
  onChange,
  placeholder,
  max,
  disabled = false,
}: {
  label: string;
  field: NFPFooterField;
  missing: NFPFooterField[];
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const t = draft.trim();
    if (!t) return;
    if (max && values.length >= max) return;
    onChange([...values, t]);
    setDraft("");
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  const cap = max ? `${values.length}/${max}` : `${values.length}`;
  const atCap = !!max && values.length >= max;

  return (
    <div className="flex flex-col gap-1">
      <span className={fieldLabelCls(field, missing)}>
        {label} · {cap}
        {missing.includes(field) ? " · missing" : ""}
      </span>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => (
          <span
            key={i}
            className="flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[10.5px] text-fg-2"
          >
            {v}
            {!disabled ? (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-um-muted hover:text-destructive"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        {values.length === 0 ? (
          <span className="text-[10.5px] italic text-um-muted">
            None added yet.
          </span>
        ) : null}
      </div>
      {!disabled && !atCap ? (
        <div className="flex gap-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11.5px] text-foreground placeholder:text-um-muted"
          />
          <button
            type="button"
            onClick={add}
            disabled={disabled || !draft.trim()}
            className="h-7 rounded-sm border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
