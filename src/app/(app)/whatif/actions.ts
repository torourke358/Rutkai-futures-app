"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { resolveInstrument, type InstrumentLite } from "@/lib/analysis/persist";
import { sweep, type SweepItem, type SweepParams, type SweepBar } from "@/lib/analysis/whatif";
import { mapQuestionToParams } from "@/lib/ai/params";
import { narrateSweep } from "@/lib/ai/narrate";
import { centsToDollars } from "@/lib/money";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ROLE 1 (in): map a natural-language question to params that PRE-FILL the
// controls. The user reviews/edits before running — the AI never runs the math.
export async function suggestParams(question: string): Promise<SweepParams> {
  const { params } = await mapQuestionToParams(question);
  return params;
}

export interface PerTradeUsd {
  trade_id: string;
  symbol: string;
  direction: "long" | "short";
  original_usd: number;
  new_usd: number | null;
  delta_usd: number;
  new_exit_reason: string;
  classification: string;
}

export interface SweepActionResult {
  ok: boolean;
  reason?: string;
  runId?: string;
  symbol?: string;
  params?: SweepParams;
  summary?: {
    tradeCount: number;
    withBars: number;
    rescued: number;
    deepened: number;
    winnersExtended: number;
    winnersGaveback: number;
    unchanged: number;
    noBars: number;
    originalNetUsd: number;
    newNetUsd: number;
    netDeltaUsd: number;
  };
  perTrade?: PerTradeUsd[];
  narration?: string;
  guarded?: boolean;
}

interface ClosedTrade {
  id: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  entry_at: string;
  realized_pnl: number | null;
}

const MAX_TRADES = 500;
const SESSION_HOURS = 10; // bars after entry treated as "the rest of the session"

export async function runSweep(
  symbol: string,
  params: SweepParams,
  question?: string,
): Promise<SweepActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, reason: "Not authenticated." };

  if (params.exitRule !== "eod" && (params.stopPoints == null || params.stopPoints <= 0)) {
    return { ok: false, reason: "Set a stop distance (points) for a stop-based exit rule." };
  }

  // Closed trades (optionally just one instrument), plus the user's instruments.
  let tradesQuery = supabase
    .from("trades")
    .select("id, symbol, direction, quantity, entry_price, entry_at, realized_pnl")
    .eq("user_id", user.id)
    .eq("status", "closed")
    .order("entry_at", { ascending: false })
    .limit(MAX_TRADES);
  if (symbol !== "all") tradesQuery = tradesQuery.ilike("symbol", `${symbol}%`);

  const [{ data: trades }, { data: instruments }] = await Promise.all([
    tradesQuery.returns<ClosedTrade[]>(),
    supabase
      .from("instruments")
      .select("id, symbol, point_value, tick_size")
      .eq("user_id", user.id)
      .returns<InstrumentLite[]>(),
  ]);

  if (!trades || trades.length === 0) {
    return { ok: false, reason: "No closed trades to sweep for that selection." };
  }
  const insts = instruments ?? [];

  // Build sweep items: resolve each trade's instrument and load its session bars.
  const items: SweepItem[] = [];
  for (const t of trades) {
    const inst = resolveInstrument(insts, t.symbol);
    if (!inst) {
      items.push({
        trade: {
          id: t.id,
          symbol: t.symbol,
          direction: t.direction,
          quantity: t.quantity,
          entry_price: t.entry_price,
          realized_pnl: t.realized_pnl,
          tick_size: 0.25,
          point_value: 1,
        },
        bars: [],
      });
      continue;
    }
    const bars = await loadSessionBars(supabase, inst.id, t.entry_at);
    items.push({
      trade: {
        id: t.id,
        symbol: t.symbol,
        direction: t.direction,
        quantity: t.quantity,
        entry_price: t.entry_price,
        realized_pnl: t.realized_pnl,
        tick_size: inst.tick_size,
        point_value: inst.point_value,
      },
      bars,
    });
  }

  const result = sweep(items, params);
  const s = result.summary;

  const summary = {
    tradeCount: s.trade_count,
    withBars: s.with_bars,
    rescued: s.rescued,
    deepened: s.deepened,
    winnersExtended: s.winners_extended,
    winnersGaveback: s.winners_gaveback,
    unchanged: s.unchanged,
    noBars: s.no_bars,
    originalNetUsd: centsToDollars(s.original_net_pnl_cents),
    newNetUsd: centsToDollars(s.new_net_pnl_cents),
    netDeltaUsd: centsToDollars(s.net_delta_cents),
  };

  // ROLE 2 (out): narrate the ALREADY-COMPUTED result, behind the lint.
  const { narration, guarded } = await narrateSweep({
    symbol,
    tradeCount: summary.tradeCount,
    withBars: summary.withBars,
    rescued: summary.rescued,
    deepened: summary.deepened,
    winnersGaveback: summary.winnersGaveback,
    winnersExtended: summary.winnersExtended,
    originalNetUsd: summary.originalNetUsd,
    newNetUsd: summary.newNetUsd,
    netDeltaUsd: summary.netDeltaUsd,
    params,
  });

  // Persist for reproducibility/audit. Monetary aggregates stay in integer
  // cents in result_summary/per_trade; only the UI formats to dollars.
  const { data: run } = await supabase
    .from("whatif_runs")
    .insert({
      user_id: user.id,
      params: { ...params, symbol, question: question ?? null },
      result_summary: result.summary,
      per_trade: result.per_trade,
      narration,
    })
    .select("id")
    .single<{ id: string }>();

  await writeAudit({
    user_id: user.id,
    entity_type: "whatif_run",
    entity_id: run?.id ?? null,
    action: "create",
    after_state: { params, symbol, summary: result.summary },
  });

  const perTrade: PerTradeUsd[] = result.per_trade.map((r) => ({
    trade_id: r.trade_id,
    symbol: r.symbol,
    direction: r.direction,
    original_usd: centsToDollars(r.original_pnl_cents),
    new_usd: r.new_pnl_cents == null ? null : centsToDollars(r.new_pnl_cents),
    delta_usd: centsToDollars(r.delta_cents),
    new_exit_reason: r.new_exit_reason,
    classification: r.classification,
  }));

  revalidatePath("/whatif");
  return { ok: true, runId: run?.id, symbol, params, summary, perTrade, narration, guarded };
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

async function loadSessionBars(
  supabase: DbClient,
  instrumentId: string,
  entryIso: string,
): Promise<SweepBar[]> {
  const end = new Date(Date.parse(entryIso) + SESSION_HOURS * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("bars")
    .select("ts, open, high, low, close")
    .eq("instrument_id", instrumentId)
    .eq("timeframe", "1m")
    .gte("ts", entryIso)
    .lte("ts", end)
    .order("ts", { ascending: true })
    .limit(600)
    .returns<SweepBar[]>();
  return data ?? [];
}
