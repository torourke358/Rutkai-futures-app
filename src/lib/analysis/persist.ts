import type { SupabaseClient } from "@supabase/supabase-js";
import { computeExcursion, type ExcursionBar } from "@/lib/analytics/excursion";

// Bridge between stored rows and the pure excursion engine: resolve which
// per-user instrument a trade's symbol belongs to, load that instrument's bars
// over the trade window, compute MAE/MFE/R, and (optionally) persist them back
// onto the trade so the aggregate views have data. RLS-scoped client — every
// row read/written here is the caller's own.

export interface InstrumentLite {
  id: string;
  symbol: string;
  point_value: number;
  tick_size: number;
}

// Match a raw trade symbol ("NQ 03-25", "MNQM25", "NQ") to one of the user's
// instruments: exact, then first-token, then longest-prefix. Null when none
// matches (trade keeps null excursion — a graceful "no instrument" state).
export function resolveInstrument(
  instruments: InstrumentLite[],
  symbol: string,
): InstrumentLite | null {
  const upper = symbol.trim().toUpperCase();
  const token = upper.split(/\s+/)[0];

  const exact =
    instruments.find((i) => i.symbol.toUpperCase() === upper) ??
    instruments.find((i) => i.symbol.toUpperCase() === token);
  if (exact) return exact;

  const byLen = [...instruments].sort((a, b) => b.symbol.length - a.symbol.length);
  return byLen.find((i) => token.startsWith(i.symbol.toUpperCase())) ?? null;
}

// Bars for one instrument within [startIso, endIso], single timeframe. Prefers
// the finest available ('1m') so extremes are as precise as the data allows.
export async function loadWindowBars(
  supabase: SupabaseClient,
  instrumentId: string,
  startIso: string,
  endIso: string,
  preferredTimeframe = "1m",
): Promise<ExcursionBar[]> {
  const base = supabase
    .from("bars")
    .select("ts, high, low, close, timeframe")
    .eq("instrument_id", instrumentId)
    .gte("ts", startIso)
    .lte("ts", endIso)
    .order("ts", { ascending: true });

  const { data } = await base.eq("timeframe", preferredTimeframe).returns<ExcursionBar[]>();
  if (data && data.length) return data;

  // Fall back to whatever timeframe exists in the window.
  const { data: any } = await supabase
    .from("bars")
    .select("ts, high, low, close")
    .eq("instrument_id", instrumentId)
    .gte("ts", startIso)
    .lte("ts", endIso)
    .order("ts", { ascending: true })
    .returns<ExcursionBar[]>();
  return any ?? [];
}

interface ClosedTradeForExcursion {
  id: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  point_value: number;
  planned_stop_price: number | null;
}

export interface RecomputeSummary {
  processed: number;
  updated: number;
  withBars: number;
  noInstrument: number;
}

// Bulk: recompute and STORE MAE/MFE/R for every closed trade that has bars.
// Trades with no resolvable instrument or no covering bars are left with null
// excursion (and counted), never errored.
export async function recomputeForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<RecomputeSummary> {
  const [{ data: instruments }, { data: trades }] = await Promise.all([
    supabase
      .from("instruments")
      .select("id, symbol, point_value, tick_size")
      .eq("user_id", userId)
      .returns<InstrumentLite[]>(),
    supabase
      .from("trades")
      .select(
        "id, symbol, direction, quantity, entry_price, exit_price, entry_at, exit_at, point_value, planned_stop_price",
      )
      .eq("user_id", userId)
      .eq("status", "closed")
      .returns<ClosedTradeForExcursion[]>(),
  ]);

  const insts = instruments ?? [];
  const summary: RecomputeSummary = { processed: 0, updated: 0, withBars: 0, noInstrument: 0 };

  for (const t of trades ?? []) {
    summary.processed++;
    const inst = resolveInstrument(insts, t.symbol);
    if (!inst) {
      summary.noInstrument++;
      continue;
    }
    const end = t.exit_at ?? t.entry_at;
    const bars = await loadWindowBars(supabase, inst.id, t.entry_at, end);
    const ex = computeExcursion(
      {
        direction: t.direction,
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        entry_at: t.entry_at,
        exit_at: t.exit_at,
        quantity: t.quantity,
        point_value: t.point_value || inst.point_value || 1,
        tick_size: inst.tick_size,
        planned_stop_price: t.planned_stop_price,
      },
      bars,
    );
    if (ex.bar_count > 0) summary.withBars++;

    const { error } = await supabase
      .from("trades")
      .update({
        mae_points: ex.mae_points,
        mfe_points: ex.mfe_points,
        mae_ts: ex.mae_ts,
        mfe_ts: ex.mfe_ts,
        r_multiple: ex.r_multiple,
        analysis_version: 1,
      })
      .eq("id", t.id)
      .eq("user_id", userId);
    if (!error) summary.updated++;
  }

  return summary;
}
