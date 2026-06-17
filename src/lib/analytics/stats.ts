// Pure TypeScript analytics over closed trades. Inputs are the rows the
// dashboard fetches (already annotated with an R-multiple via src/lib/risk.ts);
// outputs feed the stat cards, equity/drawdown curves, calendar heatmap,
// R-distribution histogram, and the setup/time/instrument breakdowns. No DB
// calls in here, no React — keep it testable.

export interface TradeForStats {
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  realized_pnl: number;
  fees: number;
  entry_at: string;
  exit_at: string;
  setup_tag: string | null;
  tags?: string[] | null;
  // R-multiple from the risk model. Optional/null when risk isn't configured.
  r?: number | null;
}

export interface Stats {
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  fees: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number; // 0..1
  avgWin: number;
  avgLoss: number; // absolute value (positive)
  profitFactor: number | null; // null when grossLoss is 0
  payoffRatio: number | null; // avgWin / avgLoss
  expectancy: number; // dollars per trade
  avgR: number | null; // mean R-multiple = expectancy in R; null if no R data
  tradesWithR: number;
  maxDrawdown: number; // absolute value of the worst peak-to-trough on the curve
  largestWin: number; // most positive realized P&L (0 if none)
  largestLoss: number; // most negative realized P&L (0 if none)
  maxConsecWins: number;
  maxConsecLosses: number;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
  avgDailyPnl: number;
  avgHoldWinMs: number;
  avgHoldLossMs: number;
}

export interface EquityPoint {
  at: string; // ISO timestamp of the closing exit
  cumulative: number;
}

export interface DrawdownPoint {
  at: string;
  drawdown: number; // <= 0: how far below the running peak
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD (local)
  netPnl: number;
  tradeCount: number;
}

export interface RBucket {
  label: string; // e.g. "-1R" meaning [-1, -0.5)
  start: number; // bucket lower bound in R
  count: number;
}

export interface SliceRow {
  label: string;
  count: number;
  netPnl: number;
  winRate: number; // 0..1
  expectancy: number; // dollars per trade in this bucket
  avgR: number | null;
}

export function computeStats(trades: TradeForStats[]): Stats {
  let netPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let fees = 0;
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let sumWin = 0;
  let sumLoss = 0;
  let holdWinSum = 0;
  let holdLossSum = 0;
  let sumR = 0;
  let tradesWithR = 0;
  let largestWin = 0;
  let largestLoss = 0;

  for (const t of trades) {
    netPnl += t.realized_pnl;
    fees += t.fees;
    if (t.realized_pnl > largestWin) largestWin = t.realized_pnl;
    if (t.realized_pnl < largestLoss) largestLoss = t.realized_pnl;
    if (t.r != null) {
      sumR += t.r;
      tradesWithR++;
    }
    if (t.realized_pnl > 0) {
      wins++;
      grossProfit += t.realized_pnl;
      sumWin += t.realized_pnl;
      holdWinSum += holdMs(t);
    } else if (t.realized_pnl < 0) {
      losses++;
      grossLoss += -t.realized_pnl;
      sumLoss += -t.realized_pnl;
      holdLossSum += holdMs(t);
    } else {
      breakEvens++;
    }
  }

  const total = wins + losses + breakEvens;
  const decisive = wins + losses; // exclude scratches from win rate
  const winRate = decisive === 0 ? 0 : wins / decisive;
  const avgWin = wins === 0 ? 0 : sumWin / wins;
  const avgLoss = losses === 0 ? 0 : sumLoss / losses;
  const profitFactor = grossLoss === 0 ? null : grossProfit / grossLoss;
  const payoffRatio = avgLoss === 0 ? null : avgWin / avgLoss;
  // True expected P&L per trade taken (scratches count as 0-P&L trades).
  const expectancy = total === 0 ? 0 : netPnl / total;
  const avgR = tradesWithR === 0 ? null : sumR / tradesWithR;

  const { maxConsecWins, maxConsecLosses } = streaks(trades);
  const days = computeCalendar(trades);
  const winningDays = days.filter((d) => d.netPnl > 0).length;
  const losingDays = days.filter((d) => d.netPnl < 0).length;
  const avgDailyPnl = days.length === 0 ? 0 : netPnl / days.length;

  return {
    netPnl: round2(netPnl),
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    fees: round2(fees),
    wins,
    losses,
    breakEvens,
    winRate,
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    profitFactor: profitFactor == null ? null : round2(profitFactor),
    payoffRatio: payoffRatio == null ? null : round2(payoffRatio),
    expectancy: round2(expectancy),
    avgR: avgR == null ? null : round2(avgR),
    tradesWithR,
    maxDrawdown: round2(maxDrawdownOf(trades)),
    largestWin: round2(largestWin),
    largestLoss: round2(largestLoss),
    maxConsecWins,
    maxConsecLosses,
    tradingDays: days.length,
    winningDays,
    losingDays,
    avgDailyPnl: round2(avgDailyPnl),
    avgHoldWinMs: wins === 0 ? 0 : holdWinSum / wins,
    avgHoldLossMs: losses === 0 ? 0 : holdLossSum / losses,
  };
}

export function computeEquityCurve(trades: TradeForStats[]): EquityPoint[] {
  const sorted = byExit(trades);
  let cumulative = 0;
  return sorted.map((t) => {
    cumulative += t.realized_pnl;
    return { at: t.exit_at, cumulative: round2(cumulative) };
  });
}

export function computeDrawdownCurve(trades: TradeForStats[]): DrawdownPoint[] {
  const sorted = byExit(trades);
  let cumulative = 0;
  let peak = 0;
  return sorted.map((t) => {
    cumulative += t.realized_pnl;
    if (cumulative > peak) peak = cumulative;
    return { at: t.exit_at, drawdown: round2(cumulative - peak) };
  });
}

export function computeCalendar(trades: TradeForStats[]): CalendarDay[] {
  const byDay = new Map<string, CalendarDay>();
  for (const t of trades) {
    const key = localDateKey(t.exit_at);
    const cur = byDay.get(key) ?? { date: key, netPnl: 0, tradeCount: 0 };
    cur.netPnl += t.realized_pnl;
    cur.tradeCount++;
    byDay.set(key, cur);
  }
  return [...byDay.values()]
    .map((d) => ({ ...d, netPnl: round2(d.netPnl) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Histogram of R-multiples in fixed-width buckets (default 0.5R). Only trades
// with a defined R are counted. Buckets span floor(min)..ceil(max).
export function computeRDistribution(
  trades: TradeForStats[],
  size = 0.5,
): RBucket[] {
  const rs = trades
    .map((t) => t.r)
    .filter((r): r is number => r != null && Number.isFinite(r));
  if (rs.length === 0) return [];
  const min = Math.min(...rs);
  const max = Math.max(...rs);
  const startBucket = Math.floor(min / size) * size;
  const endBucket = Math.floor(max / size) * size;
  const buckets = new Map<number, number>();
  for (let b = startBucket; b <= endBucket + 1e-9; b += size) {
    buckets.set(round2(b), 0);
  }
  for (const r of rs) {
    const b = round2(Math.floor(r / size) * size);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, count]) => ({
      start,
      count,
      label: `${start >= 0 ? "+" : ""}${start}R`,
    }));
}

// Per-bucket stats. keyFn returns one or more bucket labels for a trade (one
// label for setup/symbol/direction; multiple for free tags). Sorted by net
// P&L descending — top performers first.
export function sliceStats(
  trades: TradeForStats[],
  keyFn: (t: TradeForStats) => string[],
): SliceRow[] {
  const map = accumulate(trades, keyFn);
  return [...map.values()]
    .map(finalizeSlice)
    .sort((a, b) => b.netPnl - a.netPnl);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Day-of-week slice in chronological (Mon→Sun-ish) order, based on entry time.
export function sliceByDayOfWeek(trades: TradeForStats[]): SliceRow[] {
  const map = accumulate(trades, (t) => [
    WEEKDAYS[new Date(t.entry_at).getDay()],
  ]);
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return order
    .filter((d) => map.has(d))
    .map((d) => finalizeSlice(map.get(d)!));
}

// Hour-of-day slice (entry time, local), ordered 0→23.
export function sliceByHourOfDay(trades: TradeForStats[]): SliceRow[] {
  const map = accumulate(trades, (t) => [
    `${String(new Date(t.entry_at).getHours()).padStart(2, "0")}:00`,
  ]);
  return [...map.values()]
    .map(finalizeSlice)
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------- internals ----------

interface Acc {
  label: string;
  count: number;
  net: number;
  wins: number;
  losses: number;
  sumR: number;
  rCount: number;
}

function accumulate(
  trades: TradeForStats[],
  keyFn: (t: TradeForStats) => string[],
): Map<string, Acc> {
  const map = new Map<string, Acc>();
  for (const t of trades) {
    for (const rawLabel of keyFn(t)) {
      const label = rawLabel || "(unset)";
      const a =
        map.get(label) ??
        {
          label,
          count: 0,
          net: 0,
          wins: 0,
          losses: 0,
          sumR: 0,
          rCount: 0,
        };
      a.count++;
      a.net += t.realized_pnl;
      if (t.realized_pnl > 0) {
        a.wins++;
      } else if (t.realized_pnl < 0) {
        a.losses++;
      }
      if (t.r != null) {
        a.sumR += t.r;
        a.rCount++;
      }
      map.set(label, a);
    }
  }
  return map;
}

function finalizeSlice(a: Acc): SliceRow {
  const decisive = a.wins + a.losses;
  const winRate = decisive === 0 ? 0 : a.wins / decisive;
  const expectancy = a.count === 0 ? 0 : a.net / a.count;
  return {
    label: a.label,
    count: a.count,
    netPnl: round2(a.net),
    winRate,
    expectancy: round2(expectancy),
    avgR: a.rCount === 0 ? null : round2(a.sumR / a.rCount),
  };
}

function streaks(trades: TradeForStats[]): {
  maxConsecWins: number;
  maxConsecLosses: number;
} {
  const sorted = byExit(trades);
  let maxW = 0;
  let maxL = 0;
  let curW = 0;
  let curL = 0;
  for (const t of sorted) {
    if (t.realized_pnl > 0) {
      curW++;
      curL = 0;
      if (curW > maxW) maxW = curW;
    } else if (t.realized_pnl < 0) {
      curL++;
      curW = 0;
      if (curL > maxL) maxL = curL;
    } else {
      curW = 0;
      curL = 0;
    }
  }
  return { maxConsecWins: maxW, maxConsecLosses: maxL };
}

function maxDrawdownOf(trades: TradeForStats[]): number {
  const sorted = byExit(trades);
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  for (const t of sorted) {
    cumulative += t.realized_pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  return maxDrawdown;
}

function byExit(trades: TradeForStats[]): TradeForStats[] {
  return [...trades].sort((a, b) => a.exit_at.localeCompare(b.exit_at));
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function holdMs(t: TradeForStats): number {
  return new Date(t.exit_at).getTime() - new Date(t.entry_at).getTime();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
