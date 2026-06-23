// MAE / MFE / R-multiple excursion engine.
//
// For a paired trade, walk the user's imported bars over [entry, exit] and
// measure how far price ran AGAINST the position (Maximum Adverse Excursion)
// and how far it ran IN FAVOR (Maximum Favorable Excursion), in points and in
// USD, recording the timestamp of each extreme so the chart can mark them.
//
// Everything here is a DESCRIPTION of what the user's own bars did during a
// trade they already took. Nothing forward-looking. Pure — no DB, no React —
// so it is fully unit-tested in excursion.test.ts.
//
// Money/price math goes through lib/money.ts: extremes are found on the integer
// TICK grid and USD is integer CENTS, so figures are exact and reproducible.

import {
  priceToTicks,
  ticksToPrice,
  centsPerTick,
  centsToDollars,
  roundHalfAwayFromZero,
} from "../money.ts";

export interface ExcursionBar {
  ts: string; // ISO timestamp
  high: number | null;
  low: number | null;
  close?: number | null;
}

export interface TradeForExcursion {
  direction: "long" | "short";
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  quantity: number;
  point_value: number;
  // Instrument tick size, used to snap prices to the integer tick grid. When
  // omitted, falls back to a fine 0.01 grid (correct for points/USD, which are
  // grid-invariant; pass the real tick for exact snapping).
  tick_size?: number;
  // Optional manual field. R-multiple is only computed when this is present.
  planned_stop_price?: number | null;
}

export interface ExcursionResult {
  // Adverse / favorable move in PRICE POINTS (always >= 0). 0 when price never
  // moved that way during the window.
  mae_points: number | null;
  mfe_points: number | null;
  // The same moves expressed in USD for the actual position size
  // (points * point_value * quantity).
  mae_usd: number | null;
  mfe_usd: number | null;
  // Timestamp of the bar that produced each extreme (for chart markers).
  mae_ts: string | null;
  mfe_ts: string | null;
  // Realized R-multiple, computed ONLY when planned_stop_price is present:
  //   risk-per-unit (points) = |entry - planned_stop|
  //   R = signed(exit - entry) / risk-per-unit
  // Null when there is no exit, no stop, or a zero-width stop.
  r_multiple: number | null;
  // How many bars fell inside the window (0 => "no bars" state).
  bar_count: number;
}

const EMPTY: ExcursionResult = {
  mae_points: null,
  mfe_points: null,
  mae_usd: null,
  mfe_usd: null,
  mae_ts: null,
  mfe_ts: null,
  r_multiple: null,
  bar_count: 0,
};

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function tickOf(trade: TradeForExcursion): number {
  return trade.tick_size && trade.tick_size > 0 ? trade.tick_size : 0.01;
}

// Bars within [entry_at, exit_at]. For an open trade (no exit) the window runs
// to the last available bar. Bars with null high/low are skipped.
function windowBars(trade: TradeForExcursion, bars: ExcursionBar[]): ExcursionBar[] {
  const start = Date.parse(trade.entry_at);
  const end = trade.exit_at ? Date.parse(trade.exit_at) : Number.POSITIVE_INFINITY;
  return bars.filter((b) => {
    if (b.high == null || b.low == null) return false;
    const t = Date.parse(b.ts);
    return t >= start && t <= end;
  });
}

// Core computation. Always defined; returns the graceful "no bars" EMPTY shape
// when the window is empty so callers never special-case it.
export function computeExcursion(
  trade: TradeForExcursion,
  bars: ExcursionBar[],
): ExcursionResult {
  const inWindow = windowBars(trade, bars);

  const rMultiple = realizedR(trade);

  if (inWindow.length === 0) {
    return { ...EMPTY, r_multiple: rMultiple, bar_count: 0 };
  }

  const isLong = trade.direction === "long";
  const tick = tickOf(trade);
  const entryTicks = priceToTicks(trade.entry_price, tick);

  let worstAdverseTicks = -Infinity; // largest adverse move (ticks)
  let worstAdverseTs = inWindow[0].ts;
  let bestFavorableTicks = -Infinity; // largest favorable move (ticks)
  let bestFavorableTs = inWindow[0].ts;

  for (const b of inWindow) {
    const highTicks = priceToTicks(b.high as number, tick);
    const lowTicks = priceToTicks(b.low as number, tick);
    // Adverse extreme: the worst price reached against the position.
    // Favorable extreme: the best price reached in favor of it.
    const adverse = isLong ? entryTicks - lowTicks : highTicks - entryTicks;
    const favorable = isLong ? highTicks - entryTicks : entryTicks - lowTicks;

    if (adverse > worstAdverseTicks) {
      worstAdverseTicks = adverse;
      worstAdverseTs = b.ts;
    }
    if (favorable > bestFavorableTicks) {
      bestFavorableTicks = favorable;
      bestFavorableTs = b.ts;
    }
  }

  // Excursions are reported as non-negative magnitudes; if price never moved a
  // given way, the excursion is 0 (not negative). USD is exact integer cents.
  const maeTicks = Math.max(0, worstAdverseTicks);
  const mfeTicks = Math.max(0, bestFavorableTicks);
  const cpt = centsPerTick(trade.point_value, tick);
  const maeCents = roundHalfAwayFromZero(maeTicks * cpt * trade.quantity);
  const mfeCents = roundHalfAwayFromZero(mfeTicks * cpt * trade.quantity);

  return {
    mae_points: round(ticksToPrice(maeTicks, tick)),
    mfe_points: round(ticksToPrice(mfeTicks, tick)),
    mae_usd: centsToDollars(maeCents),
    mfe_usd: centsToDollars(mfeCents),
    mae_ts: worstAdverseTs,
    mfe_ts: bestFavorableTs,
    r_multiple: rMultiple,
    bar_count: inWindow.length,
  };
}

// Realized R from the PLANNED stop only. Returns null unless we have both an
// exit and a non-zero-width planned stop.
export function realizedR(trade: TradeForExcursion): number | null {
  const stop = trade.planned_stop_price;
  if (stop == null || trade.exit_price == null) return null;
  const tick = tickOf(trade);
  const entryTicks = priceToTicks(trade.entry_price, tick);
  const stopTicks = priceToTicks(stop, tick);
  const riskTicks = Math.abs(entryTicks - stopTicks);
  if (riskTicks === 0) return null;
  const exitTicks = priceToTicks(trade.exit_price, tick);
  const signedTicks =
    trade.direction === "long" ? exitTicks - entryTicks : entryTicks - exitTicks;
  return round(signedTicks / riskTicks, 4);
}

// ---- Post-exit excursion (OPTIONAL, retrospective, hypothetical) ----
//
// "What your data did after you exited." For a losing/closed trade, look at
// bars AFTER the exit and report the furthest favorable move and whether price
// reached a hypothetical R level. Strictly descriptive of history — NEVER a
// "next time, hold for X" instruction; callers must label it hypothetical.
export interface PostExitResult {
  reached_r: number | null; // furthest favorable move after exit, in R units
  furthest_favorable_points: number | null;
  furthest_favorable_ts: string | null;
  bar_count: number;
}

export function postExitExcursion(
  trade: TradeForExcursion,
  barsAfterExit: ExcursionBar[],
): PostExitResult {
  if (trade.exit_at == null || trade.exit_price == null) {
    return { reached_r: null, furthest_favorable_points: null, furthest_favorable_ts: null, bar_count: 0 };
  }
  const exitT = Date.parse(trade.exit_at);
  const after = barsAfterExit.filter((b) => {
    if (b.high == null || b.low == null) return false;
    return Date.parse(b.ts) > exitT;
  });
  if (after.length === 0) {
    return { reached_r: null, furthest_favorable_points: null, furthest_favorable_ts: null, bar_count: 0 };
  }

  const isLong = trade.direction === "long";
  const tick = tickOf(trade);
  const exitTicks = priceToTicks(trade.exit_price, tick);
  // Favorable is measured from the EXIT price (where the trader actually got out).
  let bestTicks = -Infinity;
  let bestTs = after[0].ts;
  for (const b of after) {
    const favorable = isLong
      ? priceToTicks(b.high as number, tick) - exitTicks
      : exitTicks - priceToTicks(b.low as number, tick);
    if (favorable > bestTicks) {
      bestTicks = favorable;
      bestTs = b.ts;
    }
  }
  const furthestTicks = Math.max(0, bestTicks);

  let reachedR: number | null = null;
  if (trade.planned_stop_price != null) {
    const riskTicks = Math.abs(
      priceToTicks(trade.entry_price, tick) - priceToTicks(trade.planned_stop_price, tick),
    );
    if (riskTicks > 0) reachedR = round(furthestTicks / riskTicks, 4);
  }

  return {
    reached_r: reachedR,
    furthest_favorable_points: round(ticksToPrice(furthestTicks, tick)),
    furthest_favorable_ts: bestTs,
    bar_count: after.length,
  };
}

// ---- Aggregates (descriptions of the user's OWN history) ----

export interface ExcursionRow {
  realized_pnl: number | null;
  mae_points: number | null;
  mfe_points: number | null;
  // Realized exit move in points (signed in favor of the position), for the
  // MFE-giveback view. Null when the trade is open.
  realized_points: number | null;
  planned_stop_points: number | null; // |entry - planned_stop|, when logged
}

export interface ExcursionAggregate {
  winners: { count: number; avgMaePoints: number | null; avgMfePoints: number | null };
  losers: { count: number; avgMaePoints: number | null; avgMfePoints: number | null };
  // Average MFE vs. average realized move (target efficiency / giveback).
  avgMfePoints: number | null;
  avgRealizedPoints: number | null;
  givebackPoints: number | null; // avgMfe - avgRealized, when both exist
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return round(xs.reduce((a, b) => a + b, 0) / xs.length, 4);
}

export function aggregateExcursion(rows: ExcursionRow[]): ExcursionAggregate {
  const winners = rows.filter((r) => (r.realized_pnl ?? 0) > 0);
  const losers = rows.filter((r) => (r.realized_pnl ?? 0) < 0);

  const maeOf = (rs: ExcursionRow[]) =>
    avg(rs.map((r) => r.mae_points).filter((v): v is number => v != null));
  const mfeOf = (rs: ExcursionRow[]) =>
    avg(rs.map((r) => r.mfe_points).filter((v): v is number => v != null));

  const avgMfe = mfeOf(rows);
  const avgRealized = avg(
    rows.map((r) => r.realized_points).filter((v): v is number => v != null),
  );

  return {
    winners: { count: winners.length, avgMaePoints: maeOf(winners), avgMfePoints: mfeOf(winners) },
    losers: { count: losers.length, avgMaePoints: maeOf(losers), avgMfePoints: mfeOf(losers) },
    avgMfePoints: avgMfe,
    avgRealizedPoints: avgRealized,
    givebackPoints:
      avgMfe != null && avgRealized != null ? round(avgMfe - avgRealized, 4) : null,
  };
}

// Bucket win-rate / expectancy by logged stop-distance. Descriptive only: it
// surfaces patterns like "your tighter-stop trades got run more often" as a
// fact about the user's fills, never as a recommendation.
export interface StopBucket {
  label: string;
  lo: number;
  hi: number | null;
  count: number;
  winRate: number | null;
  avgPnl: number | null;
}

export function bucketByStopDistance(
  rows: ExcursionRow[],
  edges: number[] = [10, 20, 30, 50],
): StopBucket[] {
  const withStop = rows.filter((r) => r.planned_stop_points != null);
  const buckets: StopBucket[] = [];
  const bounds = [0, ...edges, null];
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i] as number;
    const hi = bounds[i + 1];
    const inBucket = withStop.filter((r) => {
      const d = r.planned_stop_points as number;
      return d >= lo && (hi == null || d < hi);
    });
    const closed = inBucket.filter((r) => r.realized_pnl != null);
    const wins = closed.filter((r) => (r.realized_pnl as number) > 0).length;
    buckets.push({
      label: hi == null ? `${lo}+ pts` : `${lo}–${hi} pts`,
      lo,
      hi,
      count: inBucket.length,
      winRate: closed.length ? round(wins / closed.length, 4) : null,
      avgPnl: avg(closed.map((r) => r.realized_pnl as number)),
    });
  }
  return buckets;
}
