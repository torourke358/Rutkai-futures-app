"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

function num(form: FormData, key: string): number | null {
  const v = form.get(key);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function saveRiskSettings(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const startingRaw = form.get("starting_at");
  const payload = {
    user_id: user.id,
    method: String(form.get("method") ?? "flat"),
    default_risk_dollars: num(form, "default_risk_dollars"),
    account_balance: num(form, "account_balance"),
    risk_percent: num(form, "risk_percent"),
    starting_balance: num(form, "starting_balance"),
    starting_at: startingRaw ? new Date(String(startingRaw)).toISOString() : null,
    configured: true,
  };

  const { error } = await supabase.from("risk_settings").upsert(payload);
  if (error) throw new Error(error.message);

  await writeAudit({
    user_id: user.id,
    entity_type: "risk_settings",
    entity_id: user.id,
    action: "update",
    after_state: payload,
  });

  revalidatePath("/account/settings");
  revalidatePath("/dashboard");
}

export async function addCashFlow(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const amount = num(form, "amount");
  const occurredRaw = form.get("occurred_at");
  if (amount == null || !occurredRaw) return;

  const { error } = await supabase.from("cash_flows").insert({
    user_id: user.id,
    amount,
    occurred_at: new Date(String(occurredRaw)).toISOString(),
    note: (form.get("note") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/account/settings");
  revalidatePath("/dashboard");
}

export async function deleteCashFlow(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = form.get("id");
  if (!id) return;
  await supabase.from("cash_flows").delete().eq("id", String(id)).eq("user_id", user.id);
  revalidatePath("/account/settings");
  revalidatePath("/dashboard");
}

// Instrument multipliers are shared reference data — RLS allows writes only to
// admins. The settings UI only renders the editable form for admins, and this
// action relies on RLS to enforce that server-side too.
export async function saveInstrumentSpec(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase();
  const point_value = num(form, "point_value");
  if (!symbol || point_value == null) return;

  const { error } = await supabase.from("instrument_specs").upsert({
    symbol,
    point_value,
    description: (form.get("description") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/account/settings");
}
