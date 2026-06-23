// What-if parameter sweep — a counterfactual re-run of the user's OWN past
// trades under a different parameter (e.g. a 30-pt stop instead of 20, or an
// end-of-session exit). It DESCRIBES what the user's history would have
// realized; it is never a suggestion to adopt the parameter going forward.
//
// Determinism is the whole point:
//   - It re-runs EVERY trade in the set, not just the ones that were stopped,
//     so the headline number is honest — winners that give back and losers
//     that run deeper are modeled too (no survivorship bias).
//   - All money math is integer CENTS via lib/money.ts, so the same trades +
//     bars + params produce bit-for-bit identical output on every run.
//
// Pure — no DB, no AI, no React. The AI only maps the question to params on the
// way in and narrates this result on the way out (see lib/ai/params.ts).

import { pnlCents, dollarsToCents, priceToTicks, ticksToPrice } from "../money.ts";

export interface SweepBar {
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

export interface SweepTrade {
  id: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  // Original realized P&L in dollars (the actual outcome we compare against).
  realized_pnl: number | null;
  tick_size: number;
  point_value: number;
}

export type ExitRule = "stop_target" | "stop_eod" | "eod";

export interface SweepParams {
  // New fixed stop distance, in price points. Required for stop_* rules.
  stopPoints: number | null;
  // New target as an R-multiple of the stop. Used only by stop_target.
  targetR: number | null;
  exitRule: ExitRule;
}

export type Classification =
  | "rescued" // original loser, improved
  | "deepened" // original loser, worse
  | "winner_extended" // original winner, improved
  | "winner_gaveback" // original winner, worse
  | "unchanged"
  | "no_bars";

export interface PerTradeResult {
  trade_id: string;
  symbol: string;
  direction: "long" | "short";
  original_pnl_cents: number;
  new_pnl_cents: number | null; // null when no bars cover the trade
  delta_cents: number; // 0 when no bars
  new_exit_reason: "target" | "stop" | "eod" | "none";
  classification: Classification;
}

export interface SweepSummary {
  trade_count: number;
  with_bars: number;
  original_net_pnl_cents: number;
  new_net_pnl_cents: number;
  net_delta_cents: number;
  rescued: number; // losers that improved
  deepened: number; // losers that got worse
  winners_extended: number;
  winners_gaveback: number;
  unchanged: number;
  no_bars: number;
}

export interface SweepResult {
  params: SweepParams;
  summary: SweepSummary;
  per_trade: PerTradeResult[];
}

export interface SweepItem {
  trade: SweepTrade;
  // Bars from entry through the end of the trade's session, ascending by ts.
  bars: SweepBar[];
}

// Walk a single trade's session bars under the new params and return the
// counterfactual exit. Stop is assumed to fill before target when one bar spans
// both (the conservative choice — matches the SimBrokerAdapter).
function counterfactualExit(
  trade: SweepTrade,
  bars: SweepBar[],
  params: SweepParams,
): { exitPrice: number; reason: "target" | "stop" | "eod" | "none" } {
  const clean = bars.filter((b) => b.high != null && b.low != null);
  if (clean.length === 0) return { exitPrice: trade.entry_price, reason: "none" };

  const isLong = trade.direction === "long";
  const useStop = params.exitRule !== "eod" && params.stopPoints != null && params.stopPoints > 0;
  const useTarget = params.exitRule === "stop_target" && params.targetR != null && useStop;

  const stopDist = params.stopPoints ?? 0;
  const stopPrice = isLong ? trade.entry_price - stopDist : trade.entry_price + stopDist;
  const targetDist = stopDist * (params.targetR ?? 0);
  const targetPrice = isLong ? trade.entry_price + targetDist : trade.entry_price - targetDist;

  for (const b of clean) {
    const high = b.high as number;
    const low = b.low as number;
    if (useStop) {
      const stopHit = isLong ? low <= stopPrice : high >= stopPrice;
      if (stopHit) return { exitPrice: stopPrice, reason: "stop" };
    }
    if (useTarget) {
      const targetHit = isLong ? high >= targetPrice : low <= targetPrice;
      if (targetHit) return { exitPrice: targetPrice, reason: "target" };
    }
  }
  // Never hit → exit at the session's last close (end-of-day).
  const lastClose = clean[clean.length - 1].close ?? trade.entry_price;
  return { exitPrice: lastClose, reason: "eod" };
}

function classify(originalCents: number, newCents: number | null): Classification {
  if (newCents == null) return "no_bars";
  const delta = newCents - originalCents;
  if (delta === 0) return "unchanged";
  if (originalCents < 0) return delta > 0 ? "rescued" : "deepened";
  return delta > 0 ? "winner_extended" : "winner_gaveback";
}

export function sweep(items: SweepItem[], params: SweepParams): SweepResult {
  const per: PerTradeResult[] = [];
  const summary: SweepSummary = {
    trade_count: items.length,
    with_bars: 0,
    original_net_pnl_cents: 0,
    new_net_pnl_cents: 0,
    net_delta_cents: 0,
    rescued: 0,
    deepened: 0,
    winners_extended: 0,
    winners_gaveback: 0,
    unchanged: 0,
    no_bars: 0,
  };

  for (const { trade, bars } of items) {
    const originalCents = dollarsToCents(trade.realized_pnl ?? 0);
    summary.original_net_pnl_cents += originalCents;

    const hasBars = bars.some((b) => b.high != null && b.low != null);
    if (!hasBars) {
      summary.no_bars++;
      // No counterfactual possible — its contribution to the new net is its
      // ORIGINAL outcome (we don't get to re-run it), and delta is 0.
      summary.new_net_pnl_cents += originalCents;
      per.push({
        trade_id: trade.id,
        symbol: trade.symbol,
        direction: trade.direction,
        original_pnl_cents: originalCents,
        new_pnl_cents: null,
        delta_cents: 0,
        new_exit_reason: "none",
        classification: "no_bars",
      });
      continue;
    }

    summary.with_bars++;
    const { exitPrice, reason } = counterfactualExit(trade, bars, params);
    const newCents = pnlCents({
      entryPrice: trade.entry_price,
      exitPrice,
      tickSize: trade.tick_size,
      pointValue: trade.point_value,
      size: trade.quantity,
      direction: trade.direction,
    });
    const delta = newCents - originalCents;
    const cls = classify(originalCents, newCents);

    summary.new_net_pnl_cents += newCents;
    summary.net_delta_cents += delta;
    switch (cls) {
      case "rescued": summary.rescued++; break;
      case "deepened": summary.deepened++; break;
      case "winner_extended": summary.winners_extended++; break;
      case "winner_gaveback": summary.winners_gaveback++; break;
      case "unchanged": summary.unchanged++; break;
      default: break;
    }

    per.push({
      trade_id: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      original_pnl_cents: originalCents,
      new_pnl_cents: newCents,
      delta_cents: delta,
      new_exit_reason: reason,
      classification: cls,
    });
  }

  return { params, summary, per_trade: per };
}

// Convenience for the UI: snap a points value to the instrument tick grid so a
// "30-point stop" lands on a real price level.
export function snapPointsToTick(points: number, tickSize: number): number {
  return ticksToPrice(priceToTicks(points, tickSize), tickSize);
}
