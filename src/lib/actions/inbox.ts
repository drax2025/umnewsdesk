"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type TriageState =
  | "ready"
  | "held_dedup"
  | "held_source"
  | "needs_review"
  | "pointer"
  | "sent_to_f1"
  | "escalated";

const VALID_STATES: TriageState[] = [
  "ready",
  "held_dedup",
  "held_source",
  "needs_review",
  "pointer",
  "sent_to_f1",
  "escalated",
];

const REVALIDATE_PATHS = ["/discovery/inbox", "/discovery"];

export async function setCandidateTriage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const target = String(formData.get("target") ?? "") as TriageState;
  if (!id || !VALID_STATES.includes(target)) return;

  const supabase = await createClient();
  await supabase
    .from("candidates")
    .update({ triage_state: target })
    .eq("id", id);

  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}
