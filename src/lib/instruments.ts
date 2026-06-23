import type { SupabaseClient } from "@supabase/supabase-js";

// Resolve a per-user `instruments` row for a symbol, creating it on demand.
// Point value + tick size come from the shared `instrument_specs` reference
// table (same source the FIFO pairing uses), so a user's instrument matches
// their realized-P&L multiplier. Unknown symbols fall back to 1× / 0.25 tick.
//
// Must be called with a SERVICE-ROLE client (RLS would block cross-checks /
// inserts otherwise) and a trusted user_id.

export interface EnsuredInstrument {
  id: string;
  symbol: string;
  point_value: number;
  tick_size: number;
  tz: string;
}

export async function ensureInstrument(
  admin: SupabaseClient,
  userId: string,
  symbol: string,
): Promise<EnsuredInstrument> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) throw new Error("ensureInstrument: empty symbol");

  const { data: existing } = await admin
    .from("instruments")
    .select("id, symbol, point_value, tick_size, tz")
    .eq("user_id", userId)
    .eq("symbol", sym)
    .maybeSingle<EnsuredInstrument>();
  if (existing) return existing;

  const { data: spec } = await admin
    .from("instrument_specs")
    .select("point_value, tick_size")
    .eq("symbol", sym)
    .maybeSingle<{ point_value: number; tick_size: number | null }>();

  const point_value = spec?.point_value ?? 1;
  const tick_size = spec?.tick_size ?? 0.25;

  const { data: created, error } = await admin
    .from("instruments")
    .insert({ user_id: userId, symbol: sym, point_value, tick_size, tz: "America/Chicago" })
    .select("id, symbol, point_value, tick_size, tz")
    .single<EnsuredInstrument>();

  if (error || !created) {
    throw new Error(`Failed to create instrument ${sym}: ${error?.message ?? "unknown"}`);
  }
  return created;
}
