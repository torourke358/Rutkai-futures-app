"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { repairAndPersist } from "@/lib/trades/repair";
import { recomputeForUser, type RecomputeSummary } from "@/lib/analysis/persist";
import { writeAudit } from "@/lib/audit";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Inline note save (called directly from a client cell with typed args).
export async function saveTradeNote(id: string, notes: string) {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const { error } = await supabase
    .from("trades")
    .update({ notes: notes || null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/trades");
}

// Full annotation save from the trade detail form. None of these fields are
// derived from executions, so no re-pairing is needed — they're stored on the
// trade row. (risk_amount changes R, but R is computed at read time.)
export async function updateTradeAnnotations(form: FormData) {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const id = String(form.get("id"));
  const tagsRaw = String(form.get("tags") ?? "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const ratingRaw = form.get("rating");
  const riskRaw = form.get("risk_amount");
  const stopRaw = form.get("planned_stop_price");
  const targetRaw = form.get("planned_target_price");
  const numOrNull = (v: FormDataEntryValue | null) =>
    v !== null && v !== "" ? Number(v) : null;

  const patch = {
    setup_tag: (String(form.get("setup_tag") ?? "").trim() || null) as string | null,
    tags,
    rating: ratingRaw ? Number(ratingRaw) : null,
    notes: (String(form.get("notes") ?? "").trim() || null) as string | null,
    risk_amount: numOrNull(riskRaw),
    planned_stop_price: numOrNull(stopRaw),
    planned_target_price: numOrNull(targetRaw),
  };

  const { error } = await supabase
    .from("trades")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await writeAudit({
    user_id: user.id,
    entity_type: "trade",
    entity_id: id,
    action: "update",
    after_state: patch,
  });

  revalidatePath(`/trades/${id}`);
  revalidatePath("/trades");
  revalidatePath("/dashboard");
}

// Recompute and STORE MAE/MFE/R across all closed trades that have imported
// bars. Triggered by an explicit button — never automatic. Descriptive of the
// user's own fills; touches no money path.
export async function recomputeExcursions(): Promise<RecomputeSummary | null> {
  const { supabase, user } = await requireUser();
  if (!user) return null;

  const summary = await recomputeForUser(supabase, user.id);

  await writeAudit({
    user_id: user.id,
    entity_type: "analysis",
    action: "update",
    after_state: summary,
  });

  revalidatePath("/trades");
  revalidatePath("/dashboard");
  return summary;
}

// Manual trade entry → write entry (+ optional exit) executions with
// source='manual', then re-pair so it flows through the same engine as CSV.
export async function addManualTrade(form: FormData) {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase();
  const direction = String(form.get("direction") ?? "long");
  const quantity = Number(form.get("quantity"));
  const entryPrice = Number(form.get("entry_price"));
  const entryAt = String(form.get("entry_at") ?? "");
  const exitPriceRaw = form.get("exit_price");
  const exitAtRaw = form.get("exit_at");
  const fees = form.get("fees") ? Number(form.get("fees")) : 0;

  if (!symbol || !quantity || quantity <= 0 || !entryAt) return;

  const entrySide = direction === "long" ? "buy" : "sell";
  const exitSide = direction === "long" ? "sell" : "buy";
  const batch = crypto.randomUUID();

  const rows: Record<string, unknown>[] = [
    {
      user_id: user.id,
      symbol,
      side: entrySide,
      quantity,
      price: entryPrice,
      fees: fees / (exitAtRaw ? 2 : 1),
      executed_at: new Date(entryAt).toISOString(),
      source: "manual",
      import_batch: batch,
    },
  ];
  if (exitPriceRaw !== null && exitPriceRaw !== "" && exitAtRaw) {
    rows.push({
      user_id: user.id,
      symbol,
      side: exitSide,
      quantity,
      price: Number(exitPriceRaw),
      fees: fees / 2,
      executed_at: new Date(String(exitAtRaw)).toISOString(),
      source: "manual",
      import_batch: batch,
    });
  }

  const { error } = await supabase.from("executions").insert(rows);
  if (error) throw new Error(error.message);

  await repairAndPersist(user.id);
  await writeAudit({
    user_id: user.id,
    entity_type: "executions",
    entity_id: batch,
    action: "create",
    after_state: { manual: true, rows: rows.length },
  });

  revalidatePath("/trades");
  revalidatePath("/dashboard");
}
