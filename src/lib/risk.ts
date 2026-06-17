// Risk-per-trade resolution and R-multiples.
//
// The ONLY hardwired rule is: R = realized P&L / risk. Every input that feeds
// "risk" comes from the user's editable risk_settings (and, for the
// auto-tracked-equity method, their cash_flows). Per-trade `risk_amount` is an
// explicit dollar override that wins over the method baseline.
//
// Pure — no DB, no React. Tested in risk.test.ts and consumed by analytics.

export type RiskMethod = "flat" | "percent_static" | "percent_equity";

export interface RiskSettings {
  method: RiskMethod;
  default_risk_dollars: number | null;
  account_balance: number | null;
  risk_percent: number | null;
  starting_balance: number | null;
  starting_at: string | null;
}

export interface CashFlow {
  amount: number; // signed: + deposit, - withdrawal
  occurred_at: string;
}

export interface TradeForRisk {
  realized_pnl: number | null;
  entry_at: string;
  exit_at: string | null;
  risk_amount: number | null;
}

export interface RiskResult {
  risk: number | null; // effective dollar risk used as the R denominator
  r: number | null; // realized_pnl / risk
}

// Annotate each trade with its effective risk and R-multiple, preserving input
// order. For the percent_equity method, equity-at-entry = starting_balance +
// signed cash flows on/before entry + realized P&L of trades CLOSED before
// entry (computed in O(n log n) via sorted prefix sums).
export function annotateRisk<T extends TradeForRisk>(
  trades: T[],
  settings: RiskSettings | null,
  cashFlows: CashFlow[] = [],
): (T & RiskResult)[] {
  let equityAt: (entryIso: string) => number | null = () => null;

  if (
    settings &&
    settings.method === "percent_equity" &&
    settings.starting_balance != null
  ) {
    const start = settings.starting_balance;

    const closes = trades
      .filter((t) => t.exit_at && t.realized_pnl != null)
      .map((t) => ({
        at: Date.parse(t.exit_at as string),
        v: t.realized_pnl as number,
      }))
      .sort((a, b) => a.at - b.at);
    const closeTimes = closes.map((c) => c.at);
    const closeCum = cumulative(closes.map((c) => c.v));

    const flows = [...cashFlows]
      .map((c) => ({ at: Date.parse(c.occurred_at), v: c.amount }))
      .sort((a, b) => a.at - b.at);
    const flowTimes = flows.map((f) => f.at);
    const flowCum = cumulative(flows.map((f) => f.v));

    equityAt = (entryIso) => {
      const t = Date.parse(entryIso);
      const pnl = sumUpTo(closeTimes, closeCum, t, false); // strictly before
      const cash = sumUpTo(flowTimes, flowCum, t, true); // on/before
      return start + pnl + cash;
    };
  }

  return trades.map((t) => {
    const override =
      t.risk_amount != null && t.risk_amount > 0 ? t.risk_amount : null;
    const risk = override ?? baselineRisk(settings, t.entry_at, equityAt);
    const r =
      risk != null && risk > 0 && t.realized_pnl != null
        ? round4(t.realized_pnl / risk)
        : null;
    return { ...t, risk, r };
  });
}

function baselineRisk(
  settings: RiskSettings | null,
  entryIso: string,
  equityAt: (entryIso: string) => number | null,
): number | null {
  if (!settings) return null;
  let val: number | null = null;
  switch (settings.method) {
    case "flat":
      val = settings.default_risk_dollars;
      break;
    case "percent_static":
      if (settings.risk_percent != null && settings.account_balance != null) {
        val = (settings.risk_percent / 100) * settings.account_balance;
      }
      break;
    case "percent_equity": {
      const eq = equityAt(entryIso);
      if (eq != null && settings.risk_percent != null) {
        val = (settings.risk_percent / 100) * eq;
      }
      break;
    }
  }
  return val != null && val > 0 ? val : null;
}

function cumulative(xs: number[]): number[] {
  const out = new Array<number>(xs.length);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    out[i] = s;
  }
  return out;
}

// Sum of values whose time is < t (inclusive=false) or <= t (inclusive=true).
function sumUpTo(
  times: number[],
  cum: number[],
  t: number,
  inclusive: boolean,
): number {
  if (times.length === 0) return 0;
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const cond = inclusive ? times[mid] <= t : times[mid] < t;
    if (cond) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : cum[lo - 1];
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
