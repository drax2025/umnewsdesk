"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Press-agency CRUD. The press_agencies table maps inbound email domains to
 * a press_agencies.id + an optional discovery_sources.id (so the inbox source
 * filter can split agencies out separately). Every action gates on
 * admin first, then switches to the service-role client because the
 * agencies UI is on the management side and shouldn't have to chase RLS.
 */

export type AgencyActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

type TrustTier = 1 | 2 | 3;

async function requireSeniorEditor(): Promise<AgencyActionResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "admin") {
    return { ok: false, error: "Only admins can manage agencies" };
  }
  return null;
}

function revalidateAgencies() {
  revalidatePath("/team/agencies");
  revalidatePath("/discovery/inbox");
}

function parseDomains(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase())
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
    ),
  );
}

function parseTier(raw: unknown): TrustTier | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

function nullableUuid(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(s)) return null;
  return s;
}

export async function createAgency(formData: FormData): Promise<AgencyActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;

  const name = String(formData.get("name") ?? "").trim();
  const domains = parseDomains(String(formData.get("email_domains") ?? ""));
  const tier = parseTier(formData.get("trust_tier")) ?? 2;
  const source_id = nullableUuid(formData.get("source_id"));

  if (name.length < 2) return { ok: false, error: "Name must be at least 2 characters" };
  if (domains.length === 0) {
    return { ok: false, error: "Add at least one email domain (e.g. edelman.co.uk)" };
  }

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("press_agencies")
    .insert({ name, email_domains: domains, trust_tier: tier, source_id })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create agency" };
  }
  revalidateAgencies();
  return { ok: true, id: data.id };
}

export async function updateAgencyName(formData: FormData): Promise<AgencyActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;
  const id = nullableUuid(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!id || name.length < 2) return { ok: false, error: "Invalid input" };
  const admin = createServiceClient();
  const { error } = await admin.from("press_agencies").update({ name }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAgencies();
  return { ok: true, id };
}

export async function updateAgencyDomains(formData: FormData): Promise<AgencyActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;
  const id = nullableUuid(formData.get("id"));
  const domains = parseDomains(String(formData.get("email_domains") ?? ""));
  if (!id) return { ok: false, error: "Invalid id" };
  if (domains.length === 0) {
    return { ok: false, error: "At least one valid domain required" };
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("press_agencies")
    .update({ email_domains: domains })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAgencies();
  return { ok: true, id };
}

export async function updateAgencyTier(formData: FormData): Promise<AgencyActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;
  const id = nullableUuid(formData.get("id"));
  const tier = parseTier(formData.get("trust_tier"));
  if (!id || !tier) return { ok: false, error: "Invalid input" };
  const admin = createServiceClient();
  const { error } = await admin.from("press_agencies").update({ trust_tier: tier }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAgencies();
  return { ok: true, id };
}

export async function updateAgencySource(formData: FormData): Promise<AgencyActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;
  const id = nullableUuid(formData.get("id"));
  const source_id = nullableUuid(formData.get("source_id"));
  if (!id) return { ok: false, error: "Invalid id" };
  const admin = createServiceClient();
  const { error } = await admin
    .from("press_agencies")
    .update({ source_id })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAgencies();
  return { ok: true, id };
}

export async function deleteAgency(formData: FormData): Promise<AgencyActionResult> {
  const gate = await requireSeniorEditor();
  if (gate) return gate;
  const id = nullableUuid(formData.get("id"));
  if (!id) return { ok: false, error: "Invalid id" };
  const admin = createServiceClient();
  const { error } = await admin.from("press_agencies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAgencies();
  return { ok: true };
}
