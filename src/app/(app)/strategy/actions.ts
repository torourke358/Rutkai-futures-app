"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const numOrNull = (v: FormDataEntryValue | null) =>
  v !== null && String(v).trim() !== "" ? Number(v) : null;
const num = (v: FormDataEntryValue | null, fallback: number) =>
  v !== null && String(v).trim() !== "" ? Number(v) : fallback;

// Save the owner's risk template + active entry plugin. Updates the existing
// active config if one exists, otherwise inserts one. Generic risk concepts —
// nothing here is attributed to anyone.
export async function saveStrategyConfig(form: FormData) {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const id = String(form.get("id") ?? "").trim();
  const patch = {
    user_id: user.id,
    name: String(form.get("name") ?? "Default").trim() || "Default",
    entry_plugin_id: String(form.get("entry_plugin_id") ?? "example_ma_cross"),
    risk_pct: num(form.get("risk_pct"), 0.5),
    account_size_usd: numOrNull(form.get("account_size_usd")),
    stop_mode: String(form.get("stop_mode") ?? "fixed_points"),
    stop_value: num(form.get("stop_value"), 20),
    atr_period: num(form.get("atr_period"), 14),
    min_rr: num(form.get("min_rr"), 1.5),
    target_r: num(form.get("target_r"), 2),
    daily_loss_limit_usd: numOrNull(form.get("daily_loss_limit_usd")),
    max_trades_per_day: numOrNull(form.get("max_trades_per_day")),
    max_risk_per_trade_usd: numOrNull(form.get("max_risk_per_trade_usd")),
    is_active: true,
  };

  if (id) {
    const { error } = await supabase
      .from("strategy_configs")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("strategy_configs").insert(patch);
    if (error) throw new Error(error.message);
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "strategy_config",
    entity_id: id || null,
    action: id ? "update" : "create",
    after_state: patch,
  });

  revalidatePath("/strategy");
  revalidatePath("/engine");
}
