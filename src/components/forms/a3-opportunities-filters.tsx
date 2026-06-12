"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";
import {
  OPPORTUNITY_SECTIONS,
  OPPORTUNITY_VERDICTS,
  type OpportunitySection,
  type OpportunityVerdict,
} from "@/lib/spec/a3-opportunities";

type TitleRow = { id: string; slug: string; name: string };

export function OpportunityFiltersForm({
  initialTitle,
  initialSection,
  initialVerdict,
  includeArchived,
  titles,
}: {
  initialTitle: string;
  initialSection: OpportunitySection | "";
  initialVerdict: OpportunityVerdict | "";
  includeArchived: boolean;
  titles: TitleRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [section, setSection] = useState<OpportunitySection | "">(initialSection);
  const [verdict, setVerdict] = useState<OpportunityVerdict | "">(initialVerdict);
  const [archived, setArchived] = useState(includeArchived);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (title) params.set("title", title);
    if (section) params.set("section", section);
    if (verdict) params.set("verdict", verdict);
    if (archived) params.set("archived", "1");
    const qs = params.toString();
    router.push(qs ? `/opportunities?${qs}` : "/opportunities");
  }

  function reset() {
    setTitle("");
    setSection("");
    setVerdict("");
    setArchived(false);
    router.push("/opportunities");
  }

  const dirty = Boolean(title || section || verdict || archived);

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Title
        </label>
        <select
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
        >
          <option value="">All titles</option>
          {titles.map((t) => (
            <option key={t.id} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Section
        </label>
        <select
          value={section}
          onChange={(e) =>
            setSection((e.target.value || "") as OpportunitySection | "")
          }
          className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
        >
          <option value="">All sections</option>
          {OPPORTUNITY_SECTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.code} · {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Verdict
        </label>
        <select
          value={verdict}
          onChange={(e) =>
            setVerdict((e.target.value || "") as OpportunityVerdict | "")
          }
          className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
        >
          <option value="">All verdicts</option>
          {OPPORTUNITY_VERDICTS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] text-fg-2">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
          className="h-3 w-3"
        />
        Include &gt;90-day archived
      </label>

      <button
        type="submit"
        className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-[11.5px] font-medium text-primary hover:bg-primary/15"
      >
        <Filter className="h-3 w-3" />
        Apply
      </button>

      {dirty ? (
        <button
          type="button"
          onClick={reset}
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[11.5px] text-fg-2 hover:bg-secondary"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      ) : null}
    </form>
  );
}
