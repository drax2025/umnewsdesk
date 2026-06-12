"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";
import {
  INVENTORY_SOURCES,
  type InventorySource,
} from "@/lib/spec/a2-inventory";

type TitleRow = { id: string; slug: string; name: string };

export function InventoryFiltersForm({
  initialQ,
  initialTitle,
  initialSilo,
  initialSource,
  titles,
  silos,
}: {
  initialQ: string;
  initialTitle: string;
  initialSilo: string;
  initialSource: InventorySource | "";
  titles: TitleRow[];
  silos: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [title, setTitle] = useState(initialTitle);
  const [silo, setSilo] = useState(initialSilo);
  const [source, setSource] = useState<InventorySource | "">(initialSource);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (title) params.set("title", title);
    if (silo) params.set("silo", silo);
    if (source) params.set("source", source);
    const qs = params.toString();
    router.push(qs ? `/inventory?${qs}` : "/inventory");
  }

  function reset() {
    setQ("");
    setTitle("");
    setSilo("");
    setSource("");
    router.push("/inventory");
  }

  const dirty = Boolean(q || title || silo || source);

  return (
    <form
      onSubmit={apply}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="min-w-[220px] flex-1">
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Search headline or URL
        </label>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. quantum, skyrora.com/news/launch"
          className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-um-muted focus:border-primary/40 focus:outline-none"
        />
      </div>

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
          Silo
        </label>
        <select
          value={silo}
          onChange={(e) => setSilo(e.target.value)}
          className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
        >
          <option value="">All silos</option>
          {silos.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-um-muted">
          Source
        </label>
        <select
          value={source}
          onChange={(e) =>
            setSource((e.target.value || "") as InventorySource | "")
          }
          className="mt-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
        >
          <option value="">All sources</option>
          {INVENTORY_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

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
