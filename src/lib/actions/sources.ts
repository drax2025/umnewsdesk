"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SourceStatus = "active" | "warning" | "critical" | "paused";
const STATUS_VALUES: SourceStatus[] = ["active", "warning", "critical", "paused"];

const REVALIDATE_PATHS = [
  "/system/discovery-config",
  "/system/source-health",
  "/discovery",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

export async function updateSourceStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SourceStatus;
  if (!id || !STATUS_VALUES.includes(status)) return;
  const supabase = await createClient();
  await supabase.from("discovery_sources").update({ status }).eq("id", id);
  revalidateAll();
}

export async function updateSourceExclusivity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("exclusivity_window_hours") ?? "");
  const hours = Number.parseInt(raw, 10);
  if (!id || !Number.isFinite(hours) || hours < 0 || hours > 720) return;
  const supabase = await createClient();
  await supabase
    .from("discovery_sources")
    .update({ exclusivity_window_hours: hours })
    .eq("id", id);
  revalidateAll();
}

export async function toggleSourceSignalOnly(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("signal_only_eligible") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("discovery_sources")
    .update({ signal_only_eligible: next })
    .eq("id", id);
  revalidateAll();
}
