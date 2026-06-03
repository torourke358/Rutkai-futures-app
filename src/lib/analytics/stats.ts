// Pure TypeScript analytics over closed trades. Inputs are the rows the
// dashboard fetches; outputs feed the stat cards + equity curve + calendar
// heatmap. No DB calls in here, no React — keep it testable.

export interface TradeForStats {
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  realized_pnl: number;
  fees: number;
  entry_at: string;
  exit_at: string;
  setup_tag: string | null;
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
  expectancy: number;
  maxDrawdown: number; // absolute value of the worst peak-to-trough on the curve
  avgHoldWinMs: number;
  avgHoldLossMs: number;
}

export interface EquityPoint {
  at: string; // ISO timestamp of the closing exit
  cumulative: number;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD (local)
  netPnl: number;
  tradeCount: number;
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

  for (const t of trades) {
    netPnl += t.realized_pnl;
    fees += t.fees;
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
  const winRate = total === 0 ? 0 : wins / total;
  const avgWin = wins === 0 ? 0 : sumWin / wins;
  const avgLoss = losses === 0 ? 0 : sumLoss / losses;
  const profitFactor = grossLoss === 0 ? null : grossProfit / grossLoss;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

  // Max drawdown across the cumulative-P&L curve (in chronological order).
  const sorted = [...trades].sort((a, b) => a.exit_at.localeCompare(b.exit_at));
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  for (const t of sorted) {
    cumulative += t.realized_pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

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
    expectancy: round2(expectancy),
    maxDrawdown: round2(maxDrawdown),
    avgHoldWinMs: wins === 0 ? 0 : holdWinSum / wins,
    avgHoldLossMs: losses === 0 ? 0 : holdLossSum / losses,
  };
}

export function computeEquityCurve(trades: TradeForStats[]): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.exit_at.localeCompare(b.exit_at));
  let cumulative = 0;
  return sorted.map((t) => {
    cumulative += t.realized_pnl;
    return { at: t.exit_at, cumulative: round2(cumulative) };
  });
}

export function computeCalendar(trades: TradeForStats[]): CalendarDay[] {
  const byDay = new Map<string, CalendarDay>();
  for (const t of trades) {
    const d = new Date(t.exit_at);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const key = `${yyyy}-${mm}-${dd}`;
    const cur = byDay.get(key) ?? { date: key, netPnl: 0, tradeCount: 0 };
    cur.netPnl += t.realized_pnl;
    cur.tradeCount++;
    byDay.set(key, cur);
  }
  return [...byDay.values()]
    .map((d) => ({ ...d, netPnl: round2(d.netPnl) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Breakdowns — net P&L grouped by an axis. Sorted by net P&L desc so the UI
// can render top performers first.
export function breakdownByKey<K extends keyof TradeForStats>(
  trades: TradeForStats[],
  key: K,
): { label: string; netPnl: number; tradeCount: number }[] {
  const map = new Map<string, { label: string; netPnl: number; tradeCount: number }>();
  for (const t of trades) {
    const raw = t[key];
    const label = raw == null ? "(unset)" : String(raw);
    const cur = map.get(label) ?? { label, netPnl: 0, tradeCount: 0 };
    cur.netPnl += t.realized_pnl;
    cur.tradeCount++;
    map.set(label, cur);
  }
  return [...map.values()]
    .map((m) => ({ ...m, netPnl: round2(m.netPnl) }))
    .sort((a, b) => b.netPnl - a.netPnl);
}

function holdMs(t: TradeForStats): number {
  return new Date(t.exit_at).getTime() - new Date(t.entry_at).getTime();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
