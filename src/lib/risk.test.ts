// Unit tests for risk resolution + R-multiples. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { annotateRisk, type RiskSettings, type TradeForRisk } from "./risk.ts";

function t(
  realized_pnl: number | null,
  entry_at: string,
  exit_at: string | null,
  risk_amount: number | null = null,
): TradeForRisk {
  return { realized_pnl, entry_at, exit_at, risk_amount };
}

test("flat method: R = pnl / default risk dollars", () => {
  const settings: RiskSettings = {
    method: "flat",
    default_risk_dollars: 200,
    account_balance: null,
    risk_percent: null,
    starting_balance: null,
    starting_at: null,
  };
  const out = annotateRisk(
    [t(400, "2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")],
    settings,
  );
  assert.equal(out[0].risk, 200);
  assert.equal(out[0].r, 2);
});

test("per-trade override wins over the method baseline", () => {
  const settings: RiskSettings = {
    method: "flat",
    default_risk_dollars: 200,
    account_balance: null,
    risk_percent: null,
    starting_balance: null,
    starting_at: null,
  };
  const out = annotateRisk(
    [t(300, "2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z", 150)],
    settings,
  );
  assert.equal(out[0].risk, 150);
  assert.equal(out[0].r, 2);
});

test("percent_static: R = pnl / (pct * balance)", () => {
  const settings: RiskSettings = {
    method: "percent_static",
    default_risk_dollars: null,
    account_balance: 25000,
    risk_percent: 1, // 1% of 25k = 250
    starting_balance: null,
    starting_at: null,
  };
  const out = annotateRisk(
    [t(500, "2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")],
    settings,
  );
  assert.equal(out[0].risk, 250);
  assert.equal(out[0].r, 2);
});

test("percent_equity: equity grows with prior closed P&L and deposits", () => {
  const settings: RiskSettings = {
    method: "percent_equity",
    default_risk_dollars: null,
    account_balance: null,
    risk_percent: 1,
    starting_balance: 20000,
    starting_at: "2026-01-01T00:00:00Z",
  };
  const trades = [
    // First trade: equity = 20000 → risk 200, pnl 400 → R 2
    t(400, "2026-01-02T09:00:00Z", "2026-01-02T10:00:00Z"),
    // Second trade entered after the first closed (+400) and a +600 deposit
    // → equity 21000 → risk 210, pnl 210 → R 1
    t(210, "2026-01-03T09:00:00Z", "2026-01-03T10:00:00Z"),
  ];
  const out = annotateRisk(trades, settings, [
    { amount: 600, occurred_at: "2026-01-02T12:00:00Z" },
  ]);
  assert.equal(out[0].risk, 200);
  assert.equal(out[0].r, 2);
  assert.equal(out[1].risk, 210);
  assert.equal(out[1].r, 1);
});

test("no/invalid settings → risk and R are null", () => {
  const out = annotateRisk(
    [t(100, "2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")],
    null,
  );
  assert.equal(out[0].risk, null);
  assert.equal(out[0].r, null);
});
