// Risk / sizing / exit template — GENERIC, standard risk-management concepts
// owned by no one (fixed-fractional sizing, a defined-risk stop, a required
// minimum reward:risk, target as an R-multiple of the stop, and session
// guardrails). Do NOT attribute these to any person or company.
//
// Pure: given a config, an instrument spec, an entry signal, and an account
// size, it returns a fully-specified candidate or a structured rejection. No
// DB, no React, no money path — fully unit-tested in riskTemplate.test.ts.
//
// Sizing/risk math goes through lib/money.ts (integer cents/ticks) so the risk
// budget vs. per-contract risk comparison is exact.

import {
  dollarsToCents,
  centsToDollars,
  centsPerTick,
  distanceToTicks,
} from "../money.ts";

export interface RiskTemplateConfig {
  risk_pct: number; // percent of account risked per trade
  stop_mode: "fixed_points" | "atr_multiple";
  stop_value: number; // points (fixed_points) or ATR multiple (atr_multiple)
  atr_period: number;
  min_rr: number; // required minimum reward:risk
  target_r: number; // target placed at target_r * stop distance
  daily_loss_limit_usd: number | null;
  max_trades_per_day: number | null;
  max_risk_per_trade_usd: number | null;
}

export interface InstrumentSpecLite {
  point_value: number; // USD per 1.00 point
  tick_size: number;
}

export interface EntrySignal {
  direction: "long" | "short";
  entry_price: number;
}

export interface SizedCandidate {
  direction: "long" | "short";
  entry_price: number;
  stop_price: number;
  target_price: number;
  size: number; // contracts
  rr_ratio: number;
  risk_usd: number;
  stop_distance_points: number;
}

export type BuildResult =
  | { ok: true; candidate: SizedCandidate }
  | { ok: false; reason: string };

export interface BarHLC {
  high: number | null;
  low: number | null;
  close: number | null;
}

// Average True Range over the last `period` bars. Null when there isn't enough
// clean data. Standard TR = max(H-L, |H-prevC|, |L-prevC|).
export function atr(bars: BarHLC[], period: number): number | null {
  const clean = bars.filter(
    (b): b is { high: number; low: number; close: number } =>
      b.high != null && b.low != null && b.close != null,
  );
  if (clean.length < period + 1 || period <= 0) return null;
  const trs: number[] = [];
  for (let i = clean.length - period; i < clean.length; i++) {
    const cur = clean[i];
    const prev = clean[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function roundToTick(price: number, tick: number): number {
  if (!tick || tick <= 0) return round2(price);
  return round2(Math.round(price / tick) * tick);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Stop distance in POINTS for the active mode. Returns null if it can't be
// determined (e.g., ATR mode without enough bars).
export function stopDistancePoints(
  config: RiskTemplateConfig,
  atrValue: number | null,
): number | null {
  if (config.stop_mode === "fixed_points") {
    return config.stop_value > 0 ? config.stop_value : null;
  }
  if (atrValue == null || atrValue <= 0 || config.stop_value <= 0) return null;
  return atrValue * config.stop_value;
}

// Fixed-fractional sizing + defined-risk stop + R-multiple target + min R:R.
// Returns a structured rejection (never throws) so the UI can say WHY nothing
// was proposed.
export function buildSizedCandidate(
  config: RiskTemplateConfig,
  instrument: InstrumentSpecLite,
  signal: EntrySignal,
  accountSizeUsd: number | null,
  atrValue: number | null = null,
): BuildResult {
  if (!accountSizeUsd || accountSizeUsd <= 0) {
    return { ok: false, reason: "Account size is not configured." };
  }
  if (!(config.risk_pct > 0)) {
    return { ok: false, reason: "Risk percent must be greater than zero." };
  }
  const pointValue = instrument.point_value || 1;

  const stopDist = stopDistancePoints(config, atrValue);
  if (stopDist == null || stopDist <= 0) {
    return {
      ok: false,
      reason:
        config.stop_mode === "atr_multiple"
          ? "Not enough bars to compute ATR for the stop."
          : "Stop distance must be greater than zero.",
    };
  }

  // Required minimum reward:risk. Target sits at target_r * stop distance, so
  // the ratio IS target_r; reject if it doesn't clear the floor.
  const rrRatio = config.target_r;
  if (rrRatio < config.min_rr) {
    return {
      ok: false,
      reason: `Reward:risk ${rrRatio} is below the required minimum ${config.min_rr}.`,
    };
  }

  // Sizing in INTEGER CENTS so risk budget vs. per-contract risk is exact.
  const riskPerContractCents =
    distanceToTicks(stopDist, instrument.tick_size) * centsPerTick(pointValue, instrument.tick_size);
  if (riskPerContractCents <= 0) {
    return { ok: false, reason: "Computed per-contract risk is zero." };
  }

  const budgetCents = dollarsToCents(accountSizeUsd * (config.risk_pct / 100));
  let size = Math.floor(budgetCents / riskPerContractCents);

  // Optional hard cap on dollar risk per trade.
  if (config.max_risk_per_trade_usd != null) {
    const capSize = Math.floor(
      dollarsToCents(config.max_risk_per_trade_usd) / riskPerContractCents,
    );
    size = Math.min(size, capSize);
  }

  if (size < 1) {
    return {
      ok: false,
      reason:
        "Risk budget is too small for even one contract at this stop distance.",
    };
  }

  const targetDist = stopDist * config.target_r;
  const isLong = signal.direction === "long";
  const stopPrice = roundToTick(
    isLong ? signal.entry_price - stopDist : signal.entry_price + stopDist,
    instrument.tick_size,
  );
  const targetPrice = roundToTick(
    isLong ? signal.entry_price + targetDist : signal.entry_price - targetDist,
    instrument.tick_size,
  );
  const riskUsd = centsToDollars(size * riskPerContractCents);

  return {
    ok: true,
    candidate: {
      direction: signal.direction,
      entry_price: round2(signal.entry_price),
      stop_price: stopPrice,
      target_price: targetPrice,
      size,
      rr_ratio: round2(rrRatio),
      risk_usd: riskUsd,
      stop_distance_points: round2(stopDist),
    },
  };
}

// ---- Session guardrails ----
// Halt CANDIDATE GENERATION for the session when a limit is hit. Checked before
// (and independently of) sizing so the engine can refuse to propose anything.

export interface GuardrailContext {
  sessionPnlUsd: number; // realized simulated P&L so far today (signed)
  tradesToday: number; // approved/filled paper trades today
}

export interface GuardrailResult {
  ok: boolean;
  reason?: string;
}

export function checkGuardrails(
  config: RiskTemplateConfig,
  ctx: GuardrailContext,
): GuardrailResult {
  if (
    config.daily_loss_limit_usd != null &&
    ctx.sessionPnlUsd <= -Math.abs(config.daily_loss_limit_usd)
  ) {
    return {
      ok: false,
      reason: `Daily loss limit reached (${ctx.sessionPnlUsd} ≤ -${config.daily_loss_limit_usd}). No more candidates this session.`,
    };
  }
  if (
    config.max_trades_per_day != null &&
    ctx.tradesToday >= config.max_trades_per_day
  ) {
    return {
      ok: false,
      reason: `Max trades per day reached (${ctx.tradesToday}/${config.max_trades_per_day}).`,
    };
  }
  return { ok: true };
}
