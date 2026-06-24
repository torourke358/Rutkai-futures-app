// Retrospective prop-firm rule checker.
//
// Given the trader's OWN closed trades and their firm's rule set, it finds where
// their history WOULD HAVE breached the rules — the day a daily-loss limit or
// trailing/static drawdown would have failed the account, a consistency-rule
// violation, and any oversized trades. It is descriptive of the user's history;
// it does not monitor or block anything live.
//
// Pure — no DB, no React, no live connection. Fully unit-tested.

export interface PropTrade {
  exit_at: string; // ISO; used for ordering + the local day key
  realized_pnl: number;
  quantity: number;
}

export type DrawdownType = "trailing" | "static";

export interface PropRules {
  startingBalance: number;
  dailyLossLimit: number | null; // positive $; breach if a day's loss reaches it
  maxDrawdown: number | null; // positive $; account-level drawdown limit
  drawdownType: DrawdownType; // trailing (from peak) or static (from start)
  consistencyPct: number | null; // e.g. 50 → best day can't exceed 50% of net profit
  maxContracts: number | null;
  minTradingDays: number | null;
}

export interface PropBreach {
  type: "daily_loss" | "drawdown";
  date: string;
  detail: string;
}

export interface PropResult {
  firstBreach: PropBreach | null;
  equityAtFirstBreach: number | null;
  afterBreachPnl: number | null; // P&L booked AFTER the first breach (wouldn't have counted)
  finalEquity: number;
  netProfit: number;
  dailyLossBreaches: { date: string; dayPnl: number; worstIntraday: number }[];
  drawdown: { limit: number | null; type: DrawdownType; maxObservedDD: number; breached: boolean; breachDate: string | null };
  consistency: { bestDay: number; bestDayDate: string | null; netProfit: number; ratio: number | null; limitPct: number | null; violated: boolean };
  oversized: { count: number; maxQty: number };
  tradingDays: number;
  minDaysMet: boolean | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function computePropRules(tradesIn: PropTrade[], rules: PropRules): PropResult {
  const trades = [...tradesIn].sort((a, b) =>
    a.exit_at < b.exit_at ? -1 : a.exit_at > b.exit_at ? 1 : 0,
  );

  let equity = rules.startingBalance;
  let peak = rules.startingBalance;
  let maxObservedDD = 0;

  const dayCum = new Map<string, number>(); // running intraday cumulative
  const dayWorst = new Map<string, number>(); // worst intraday cumulative (from day start)
  const dayPnl = new Map<string, number>(); // final day net

  let ddBreachDate: string | null = null;
  const dllBreachDates = new Set<string>();

  let firstBreach: PropBreach | null = null;
  let equityAtFirstBreach: number | null = null;
  let firstBreachIdx = -1;

  let maxQty = 0;
  let oversizedCount = 0;

  trades.forEach((t, i) => {
    const dk = dayKey(t.exit_at);
    maxQty = Math.max(maxQty, t.quantity);
    if (rules.maxContracts != null && t.quantity > rules.maxContracts) oversizedCount++;

    const cum = (dayCum.get(dk) ?? 0) + t.realized_pnl;
    dayCum.set(dk, cum);
    dayWorst.set(dk, Math.min(dayWorst.get(dk) ?? 0, cum));
    dayPnl.set(dk, (dayPnl.get(dk) ?? 0) + t.realized_pnl);

    equity += t.realized_pnl;
    if (equity > peak) peak = equity;
    const dd = rules.drawdownType === "trailing" ? peak - equity : rules.startingBalance - equity;
    if (dd > maxObservedDD) maxObservedDD = dd;

    // Drawdown breach (account-level, first time).
    if (rules.maxDrawdown != null && dd >= rules.maxDrawdown && ddBreachDate == null) {
      ddBreachDate = dk;
      if (firstBreach == null) {
        firstBreach = {
          type: "drawdown",
          date: dk,
          detail: `${rules.drawdownType} drawdown of $${rules.maxDrawdown} reached (equity $${r2(equity)})`,
        };
        equityAtFirstBreach = r2(equity);
        firstBreachIdx = i;
      }
    }

    // Daily-loss breach (intraday worst reaches the limit), once per day.
    if (
      rules.dailyLossLimit != null &&
      (dayWorst.get(dk) ?? 0) <= -rules.dailyLossLimit &&
      !dllBreachDates.has(dk)
    ) {
      dllBreachDates.add(dk);
      if (firstBreach == null) {
        firstBreach = {
          type: "daily_loss",
          date: dk,
          detail: `daily loss limit of $${rules.dailyLossLimit} reached`,
        };
        equityAtFirstBreach = r2(equity);
        firstBreachIdx = i;
      }
    }
  });

  const finalEquity = r2(equity);
  const netProfit = r2(equity - rules.startingBalance);

  const dailyLossBreaches = [...dllBreachDates]
    .sort()
    .map((date) => ({
      date,
      dayPnl: r2(dayPnl.get(date) ?? 0),
      worstIntraday: r2(dayWorst.get(date) ?? 0),
    }));

  // Consistency: best single up-day vs net profit.
  let bestDay = 0;
  let bestDayDate: string | null = null;
  for (const [date, pnl] of dayPnl) {
    if (pnl > bestDay) {
      bestDay = pnl;
      bestDayDate = date;
    }
  }
  const ratio = netProfit > 0 ? bestDay / netProfit : null;
  const consistencyViolated =
    rules.consistencyPct != null && netProfit > 0 && ratio != null && ratio * 100 > rules.consistencyPct;

  const afterBreachPnl =
    firstBreachIdx >= 0
      ? r2(trades.slice(firstBreachIdx + 1).reduce((s, t) => s + t.realized_pnl, 0))
      : null;

  return {
    firstBreach,
    equityAtFirstBreach,
    afterBreachPnl,
    finalEquity,
    netProfit,
    dailyLossBreaches,
    drawdown: {
      limit: rules.maxDrawdown,
      type: rules.drawdownType,
      maxObservedDD: r2(maxObservedDD),
      breached: ddBreachDate != null,
      breachDate: ddBreachDate,
    },
    consistency: {
      bestDay: r2(bestDay),
      bestDayDate,
      netProfit,
      ratio: ratio == null ? null : r2(ratio),
      limitPct: rules.consistencyPct,
      violated: consistencyViolated,
    },
    oversized: { count: oversizedCount, maxQty },
    tradingDays: dayPnl.size,
    minDaysMet: rules.minTradingDays == null ? null : dayPnl.size >= rules.minTradingDays,
  };
}
