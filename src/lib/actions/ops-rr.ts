"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const REVALIDATE_PATHS = ["/discovery/ops-rr", "/discovery", "/system/audit-log"];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

export async function acknowledgeAlert(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("ops_rr_alerts")
    .update({ status: "investigating" })
    .eq("id", id);
  revalidateAll();
}

export async function resolveAlert(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("ops_rr_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  revalidateAll();
}

export async function escalateAlert(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("ops_rr_alerts")
    .select("severity, code")
    .eq("id", id)
    .single();
  if (!current) return;
  const bumped = current.severity === "p3" ? "p2" : "p1";
  await supabase
    .from("ops_rr_alerts")
    .update({
      status: "escalated",
      severity: bumped,
      escalation_code: `ESC-${current.code}`,
    })
    .eq("id", id);
  revalidateAll();
}

export async function deferAlert(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("ops_rr_alerts")
    .update({ status: "deferred" })
    .eq("id", id);
  revalidateAll();
}

export async function reopenAlert(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("ops_rr_alerts")
    .update({ status: "open", resolved_at: null })
    .eq("id", id);
  revalidateAll();
}
