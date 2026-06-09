"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ScheduleSlot = "am" | "pm" | "breaking" | "evergreen";
type ScheduleStatus = "pending" | "published" | "withdrawn";

const SLOTS: ScheduleSlot[] = ["am", "pm", "breaking", "evergreen"];
const STATUSES: ScheduleStatus[] = ["pending", "published", "withdrawn"];

const REVALIDATE_PATHS = ["/calendar", "/calendar/grid", "/pipeline", "/"];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

function nextCode(prefix: string, last: string | null): string {
  const year = new Date().getFullYear();
  if (!last) return `${prefix}-${year}-001`;
  const m = last.match(/-(\d{3,})$/);
  const n = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return `${prefix}-${year}-${String(n).padStart(3, "0")}`;
}

export async function scheduleArticle(formData: FormData) {
  const articleId = String(formData.get("article_id") ?? "");
  const publishRaw = String(formData.get("publish_at") ?? "").trim();
  const slot = String(formData.get("slot_window") ?? "am") as ScheduleSlot;
  const priorityRaw = String(formData.get("priority") ?? "3");
  const notes = String(formData.get("notes") ?? "");

  if (!articleId || !publishRaw || !SLOTS.includes(slot)) return;
  const dt = new Date(publishRaw);
  if (Number.isNaN(dt.getTime())) return;

  const priority = Math.min(5, Math.max(1, Number.parseInt(priorityRaw, 10) || 3));

  const supabase = await createClient();

  const { data: lastEntry } = await supabase
    .from("schedule_entries")
    .select("code")
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const code = nextCode("SCH", lastEntry?.code ?? null);

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;

  // Upsert by article_id (unique constraint)
  await supabase.from("schedule_entries").upsert(
    {
      code,
      article_id: articleId,
      publish_at: dt.toISOString(),
      slot_window: slot,
      priority,
      notes,
      status: "pending",
      scheduled_by: userId,
    },
    { onConflict: "article_id" },
  );

  // Bump article to 'scheduled' state
  await supabase
    .from("articles")
    .update({ state: "scheduled" })
    .eq("id", articleId);

  revalidateAll();
}

export async function updateScheduleEntry(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const publishRaw = String(formData.get("publish_at") ?? "").trim();
  const slot = String(formData.get("slot_window") ?? "") as ScheduleSlot;
  const priorityRaw = String(formData.get("priority") ?? "");
  if (!id) return;

  const patch: Record<string, unknown> = {};
  if (publishRaw) {
    const dt = new Date(publishRaw);
    if (!Number.isNaN(dt.getTime())) patch.publish_at = dt.toISOString();
  }
  if (SLOTS.includes(slot)) patch.slot_window = slot;
  if (priorityRaw) {
    const p = Number.parseInt(priorityRaw, 10);
    if (Number.isFinite(p)) patch.priority = Math.min(5, Math.max(1, p));
  }
  if (Object.keys(patch).length === 0) return;

  const supabase = await createClient();
  await supabase.from("schedule_entries").update(patch).eq("id", id);
  revalidateAll();
}

export async function setScheduleStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ScheduleStatus;
  if (!id || !STATUSES.includes(status)) return;

  const supabase = await createClient();

  if (status === "withdrawn") {
    const { data: entry } = await supabase
      .from("schedule_entries")
      .select("article_id")
      .eq("id", id)
      .single();
    await supabase.from("schedule_entries").update({ status }).eq("id", id);
    if (entry) {
      // Roll the article back to filed
      await supabase
        .from("articles")
        .update({ state: "filed" })
        .eq("id", entry.article_id);
    }
  } else {
    await supabase.from("schedule_entries").update({ status }).eq("id", id);
  }

  revalidateAll();
}
