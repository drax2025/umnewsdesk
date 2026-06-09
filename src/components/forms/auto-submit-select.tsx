"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Option = { value: string; label: string };

export function AutoSubmitSelect({
  name,
  value,
  options,
  basePath,
  preserve,
  className,
}: {
  name: string;
  value: string;
  options: Option[];
  basePath: string;
  preserve: Record<string, string | undefined>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={value}
      disabled={pending}
      onChange={(e) => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(preserve)) {
          if (v) next.set(k, v);
        }
        if (e.currentTarget.value) next.set(name, e.currentTarget.value);
        else next.delete(name);
        const qs = next.toString();
        startTransition(() => {
          router.push(qs ? `${basePath}?${qs}` : basePath);
        });
      }}
      className={
        className ??
        "h-7 rounded-sm border border-border bg-background px-2 text-[11.5px] text-fg-2 focus:border-primary focus:outline-none"
      }
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
