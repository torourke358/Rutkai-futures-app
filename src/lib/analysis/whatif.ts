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
  // Pre-entry ATR (price points), used only when stopMode === "atr" to size the
  // stop by volatility. Computed by the caller from bars before the entry.
  atr?: number | null;
}

export type ExitRule =
  | "stop_target" // stop + target (target = targetR * stop)
  | "stop_eod" // stop, else exit at session close
  | "eod" // hold to session close (no stop/target)
  | "trailing" // trail the stop by the stop distance behind the best price
  | "breakeven" // stop, move to breakeven after +breakevenR, optional target
  | "time"; // exit after timeMinutes (stop still applies if set)

export type StopMode = "points" | "atr";

export interface SweepParams {
  exitRule: ExitRule;
  // How the stop/trail distance is derived. Defaults to "points".
  stopMode?: StopMode;
  // Stop/trail distance in price points (stopMode "points").
  stopPoints: number | null;
  // Stop/trail distance as a multiple of the trade's pre-entry ATR (stopMode "atr").
  atrMultiple?: number | null;
  // Target as an R-multiple of the stop distance (stop_target, breakeven).
  targetR: number | null;
  // Breakeven trigger as an R-multiple of the stop distance (breakeven). Default 1.
  breakevenR?: number | null;
  // Minutes (1m bars) to hold before a time exit (time).
  timeMinutes?: number | null;
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
  new_exit_reason: ExitReason;
  classification: Classification;
}

export type ExitReason = "target" | "stop" | "eod" | "time" | "none";

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

// The effective stop/trail distance in price points for a trade, honoring
// stopMode (raw points vs. an ATR multiple). Null when it can't be determined
// (e.g., ATR mode with no ATR available) — callers then treat the trade as
// having no stop and fall through to the session close.
function stopDistanceOf(trade: SweepTrade, params: SweepParams): number | null {
  if ((params.stopMode ?? "points") === "atr") {
    const m = params.atrMultiple;
    if (m != null && m > 0 && trade.atr != null && trade.atr > 0) return m * trade.atr;
    return null;
  }
  return params.stopPoints != null && params.stopPoints > 0 ? params.stopPoints : null;
}

// Walk a single trade's session bars under the new params and return the
// counterfactual exit. Stop is assumed to fill before target when one bar spans
// both (the conservative choice — matches the SimBrokerAdapter).
function counterfactualExit(
  trade: SweepTrade,
  bars: SweepBar[],
  params: SweepParams,
): { exitPrice: number; reason: ExitReason } {
  const clean = bars.filter((b) => b.high != null && b.low != null);
  if (clean.length === 0) return { exitPrice: trade.entry_price, reason: "none" };

  const isLong = trade.direction === "long";
  const entry = trade.entry_price;
  const stopDist = stopDistanceOf(trade, params);
  const lastClose = () => clean[clean.length - 1].close ?? entry;
  const rule = params.exitRule;

  // Hold to session close — no stop, no target.
  if (rule === "eod") return { exitPrice: lastClose(), reason: "eod" };

  // Trailing stop: ratchet the stop `stopDist` behind the best price reached.
  if (rule === "trailing") {
    if (stopDist == null) return { exitPrice: lastClose(), reason: "eod" };
    let trail = isLong ? entry - stopDist : entry + stopDist;
    for (const b of clean) {
      const high = b.high as number;
      const low = b.low as number;
      if (isLong ? low <= trail : high >= trail) return { exitPrice: trail, reason: "stop" };
      trail = isLong ? Math.max(trail, high - stopDist) : Math.min(trail, low + stopDist);
    }
    return { exitPrice: lastClose(), reason: "eod" };
  }

  // Time exit: close after `timeMinutes` bars (a stop, if set, can fire first).
  if (rule === "time") {
    const exitIdx = Math.min(
      params.timeMinutes != null && params.timeMinutes > 0 ? params.timeMinutes : clean.length - 1,
      clean.length - 1,
    );
    const stopPrice = stopDist == null ? null : isLong ? entry - stopDist : entry + stopDist;
    for (let i = 0; i <= exitIdx; i++) {
      const b = clean[i];
      if (stopPrice != null) {
        const hit = isLong ? (b.low as number) <= stopPrice : (b.high as number) >= stopPrice;
        if (hit) return { exitPrice: stopPrice, reason: "stop" };
      }
      if (i === exitIdx) return { exitPrice: b.close ?? entry, reason: "time" };
    }
    return { exitPrice: lastClose(), reason: "time" };
  }

  // Breakeven: start at the stop; once price is +breakevenR*stop in favor, move
  // the stop to entry. Optional target at targetR*stop.
  if (rule === "breakeven") {
    if (stopDist == null) return { exitPrice: lastClose(), reason: "eod" };
    let stopPrice = isLong ? entry - stopDist : entry + stopDist;
    const trigDist = (params.breakevenR ?? 1) * stopDist;
    const trigger = isLong ? entry + trigDist : entry - trigDist;
    const targetPrice =
      params.targetR != null
        ? isLong
          ? entry + params.targetR * stopDist
          : entry - params.targetR * stopDist
        : null;
    let movedBE = false;
    for (const b of clean) {
      const high = b.high as number;
      const low = b.low as number;
      if (isLong ? low <= stopPrice : high >= stopPrice) return { exitPrice: stopPrice, reason: "stop" };
      if (targetPrice != null && (isLong ? high >= targetPrice : low <= targetPrice))
        return { exitPrice: targetPrice, reason: "target" };
      if (!movedBE && (isLong ? high >= trigger : low <= trigger)) {
        stopPrice = entry;
        movedBE = true;
      }
    }
    return { exitPrice: lastClose(), reason: "eod" };
  }

  // stop_target / stop_eod: fixed stop, optional target.
  const useStop = stopDist != null;
  const useTarget = rule === "stop_target" && params.targetR != null && useStop;
  const stopPrice = isLong ? entry - (stopDist ?? 0) : entry + (stopDist ?? 0);
  const targetDist = (stopDist ?? 0) * (params.targetR ?? 0);
  const targetPrice = isLong ? entry + targetDist : entry - targetDist;
  for (const b of clean) {
    const high = b.high as number;
    const low = b.low as number;
    if (useStop && (isLong ? low <= stopPrice : high >= stopPrice))
      return { exitPrice: stopPrice, reason: "stop" };
    if (useTarget && (isLong ? high >= targetPrice : low <= targetPrice))
      return { exitPrice: targetPrice, reason: "target" };
  }
  return { exitPrice: lastClose(), reason: "eod" };
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
