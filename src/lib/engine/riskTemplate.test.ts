// Unit tests for the generic risk/sizing/exit template. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildSizedCandidate,
  checkGuardrails,
  stopDistancePoints,
  atr,
  type RiskTemplateConfig,
  type InstrumentSpecLite,
} from "./riskTemplate.ts";

const NQ: InstrumentSpecLite = { point_value: 20, tick_size: 0.25 };

const baseConfig: RiskTemplateConfig = {
  risk_pct: 1, // 1% of account
  stop_mode: "fixed_points",
  stop_value: 20, // 20 pts
  atr_period: 14,
  min_rr: 1.5,
  target_r: 2,
  daily_loss_limit_usd: null,
  max_trades_per_day: null,
  max_risk_per_trade_usd: null,
};

test("fixed-fractional sizing on NQ: 1% of 50k, 20pt stop", () => {
  // risk budget = 500; per-contract risk = 20 * $20 = $400 → size floor = 1
  const res = buildSizedCandidate(baseConfig, NQ, { direction: "long", entry_price: 20000 }, 50000);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.candidate.size, 1);
  assert.equal(res.candidate.stop_price, 19980); // 20000 - 20
  assert.equal(res.candidate.target_price, 20040); // 20000 + 2*20
  assert.equal(res.candidate.rr_ratio, 2);
  assert.equal(res.candidate.risk_usd, 400);
});

test("short flips stop above and target below entry", () => {
  const res = buildSizedCandidate(baseConfig, NQ, { direction: "short", entry_price: 20000 }, 200000);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.candidate.stop_price, 20020);
  assert.equal(res.candidate.target_price, 19960);
  // budget 2000 / 400 = 5 contracts
  assert.equal(res.candidate.size, 5);
  assert.equal(res.candidate.risk_usd, 2000);
});

test("rejects when reward:risk is below the configured minimum", () => {
  const res = buildSizedCandidate(
    { ...baseConfig, target_r: 1, min_rr: 1.5 },
    NQ,
    { direction: "long", entry_price: 20000 },
    50000,
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /below the required minimum/i);
});

test("rejects when the risk budget can't afford one contract", () => {
  // 0.1% of 1000 = $1 budget; per-contract risk $400 → size 0 → reject
  const res = buildSizedCandidate(
    { ...baseConfig, risk_pct: 0.1 },
    NQ,
    { direction: "long", entry_price: 20000 },
    1000,
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /too small for even one contract/i);
});

test("max_risk_per_trade_usd caps the size", () => {
  // budget = 4000 → 10 contracts, but cap $800 → 2 contracts
  const res = buildSizedCandidate(
    { ...baseConfig, max_risk_per_trade_usd: 800 },
    NQ,
    { direction: "long", entry_price: 20000 },
    400000,
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.candidate.size, 2);
  assert.equal(res.candidate.risk_usd, 800);
});

test("rejects without a configured account size", () => {
  const res = buildSizedCandidate(baseConfig, NQ, { direction: "long", entry_price: 20000 }, null);
  assert.equal(res.ok, false);
});

test("ATR stop mode needs enough bars", () => {
  assert.equal(stopDistancePoints({ ...baseConfig, stop_mode: "atr_multiple" }, null), null);
  // ATR 10, multiple 2 → 20pt stop
  assert.equal(stopDistancePoints({ ...baseConfig, stop_mode: "atr_multiple", stop_value: 2 }, 10), 20);
});

test("atr computes average true range over the period", () => {
  // 4 bars, period 3. closes: 100, then ranges of 5,5,5 → ATR 5
  const bars = [
    { high: 100, low: 95, close: 100 },
    { high: 105, low: 100, close: 105 },
    { high: 110, low: 105, close: 110 },
    { high: 115, low: 110, close: 115 },
  ];
  assert.equal(atr(bars, 3), 5);
  assert.equal(atr(bars, 10), null);
});

test("guardrails: daily loss limit halts generation", () => {
  const res = checkGuardrails(
    { ...baseConfig, daily_loss_limit_usd: 1000 },
    { sessionPnlUsd: -1000, tradesToday: 0 },
  );
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /daily loss limit/i);
});

test("guardrails: max trades per day halts generation", () => {
  const res = checkGuardrails(
    { ...baseConfig, max_trades_per_day: 3 },
    { sessionPnlUsd: 0, tradesToday: 3 },
  );
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /max trades per day/i);
});

test("guardrails: within limits is ok", () => {
  const res = checkGuardrails(
    { ...baseConfig, daily_loss_limit_usd: 1000, max_trades_per_day: 5 },
    { sessionPnlUsd: -200, tradesToday: 2 },
  );
  assert.equal(res.ok, true);
});
