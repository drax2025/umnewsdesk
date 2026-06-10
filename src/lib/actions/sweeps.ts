"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nextSweepCode } from "@/lib/ingest/codes";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Open a sweep run directly from the UI. Bypasses the HTTP route since
 * we're already server-side — same effect, no token plumbing required.
 * Status lands as `running`; the operator either completes it via the
 * test-ingest console or via n8n manual trigger.
 */
export async function triggerManualSweep() {
  const slot: "am" | "pm" = new Date().getUTCHours() < 12 ? "am" : "pm";

  const supabase = createServiceClient();
  const code = await nextSweepCode(supabase);

  const { data, error } = await supabase
    .from("sweep_runs")
    .insert({
      code,
      slot,
      trigger: "manual",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to open sweep");
  }

  revalidatePath("/discovery/sweeps");
  revalidatePath("/discovery");
  redirect(`/discovery/sweeps?id=${data.id}`);
}
