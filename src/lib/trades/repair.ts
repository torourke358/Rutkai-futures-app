import { createServiceClient } from "@/lib/supabase/server";
import { pairTrades, type Execution, type PairedTrade } from "@/lib/trades/pairing";
import { resolveMultipliers } from "@/lib/import/symbol";

// Re-derive the user's closed/open trades from the FULL execution history and
// reconcile the `trades` table to match. Single source of truth, reused by
// import, undo, and manual entry. Uses the service-role client (bypasses RLS);
// callers MUST scope to a verified user_id.
//
// Idempotent: trades are UPSERTed on the generated `pairing_key` (the DB dedupes
// re-emitted trades), and any trade whose identity is no longer produced is
// deleted. User annotations (setup_tag, notes, rating, tags, risk_amount) live
// on the trade row and are NOT in the upsert payload, so they survive re-pairing
// of unchanged trades.

export interface RepairSummary {
  closed: number;
  open: number;
  upserted: number;
  deleted: number;
}

export async function repairAndPersist(userId: string): Promise<RepairSummary> {
  const admin = createServiceClient();

  const { data: execRows, error: execErr } = await admin
    .from("executions")
    .select("id, symbol, side, quantity, price, fees, executed_at")
    .eq("user_id", userId);
  if (execErr) throw execErr;

  const executions: Execution[] = (execRows ?? []).map((e) => ({
    id: e.id as string,
    symbol: e.symbol as string,
    side: e.side as "buy" | "sell",
    quantity: Number(e.quantity),
    price: Number(e.price),
    fees: Number(e.fees),
    executed_at: e.executed_at as string,
  }));

  const { data: specRows } = await admin
    .from("instrument_specs")
    .select("symbol, point_value");
  const distinctSymbols = [...new Set(executions.map((e) => e.symbol))];
  const multipliers = resolveMultipliers(
    distinctSymbols,
    (specRows ?? []).map((s) => ({
      symbol: s.symbol as string,
      point_value: Number(s.point_value),
    })),
  );

  const paired = pairTrades(executions, multipliers);
  const pairedKeys = new Set(paired.map(naturalKey));

  // Find trades that no longer correspond to any paired result → stale.
  const { data: existing, error: exErr } = await admin
    .from("trades")
    .select("id, symbol, direction, entry_at, exit_at, quantity")
    .eq("user_id", userId);
  if (exErr) throw exErr;
  const staleIds = (existing ?? [])
    .filter(
      (r) =>
        !pairedKeys.has(
          naturalKey({
            symbol: r.symbol as string,
            direction: r.direction as "long" | "short",
            entry_at: r.entry_at as string,
            exit_at: r.exit_at as string | null,
            quantity: Number(r.quantity),
          }),
        ),
    )
    .map((r) => r.id as string);

  if (paired.length > 0) {
    const rows = paired.map((t) => ({
      user_id: userId,
      symbol: t.symbol,
      direction: t.direction,
      quantity: t.quantity,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      entry_at: t.entry_at,
      exit_at: t.exit_at,
      fees: t.fees,
      realized_pnl: t.realized_pnl,
      status: t.status,
      point_value: t.point_value,
    }));
    const { error } = await admin
      .from("trades")
      .upsert(rows, { onConflict: "pairing_key" });
    if (error) throw error;
  }

  if (staleIds.length > 0) {
    const { error } = await admin.from("trades").delete().in("id", staleIds);
    if (error) throw error;
  }

  return {
    closed: paired.filter((t) => t.status === "closed").length,
    open: paired.filter((t) => t.status === "open").length,
    upserted: paired.length,
    deleted: staleIds.length,
  };
}

// Logical identity of a trade, independent of the DB's pairing_key formula.
// epoch-ms normalization makes it robust to ISO timestamp formatting drift.
function naturalKey(
  t: Pick<PairedTrade, "symbol" | "direction" | "entry_at" | "exit_at" | "quantity">,
): string {
  const entry = Date.parse(t.entry_at);
  const exit = t.exit_at ? Date.parse(t.exit_at) : "open";
  const qty = Math.round(t.quantity * 1e6) / 1e6;
  return `${t.symbol}|${t.direction}|${entry}|${exit}|${qty}`;
}
