// Unit tests for the retrospective prop-firm rule checker. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { computePropRules, type PropTrade, type PropRules } from "./propRules.ts";

const base: PropRules = {
  startingBalance: 50000,
  dailyLossLimit: null,
  maxDrawdown: null,
  drawdownType: "trailing",
  consistencyPct: null,
  maxContracts: null,
  minTradingDays: null,
};

function t(date: string, hhmm: string, pnl: number, qty = 1): PropTrade {
  return { exit_at: `${date}T${hhmm}:00Z`, realized_pnl: pnl, quantity: qty };
}

test("daily loss limit: flags the day intraday loss reaches the limit", () => {
  const trades = [
    t("2026-03-02", "10:00", 300),
    t("2026-03-03", "10:00", -600),
    t("2026-03-03", "11:00", -500), // day worst -1100 → breaches $1000 DLL
    t("2026-03-03", "12:00", 400), // recovers, but the breach already happened
  ];
  const res = computePropRules(trades, { ...base, dailyLossLimit: 1000 });
  assert.equal(res.dailyLossBreaches.length, 1);
  assert.equal(res.dailyLossBreaches[0].date, "2026-03-03");
  assert.equal(res.dailyLossBreaches[0].worstIntraday, -1100);
  assert.equal(res.firstBreach?.type, "daily_loss");
});

test("trailing drawdown: fails when equity falls maxDD below the peak", () => {
  const trades = [
    t("2026-03-02", "10:00", 2000), // equity 52000 (peak)
    t("2026-03-03", "10:00", -1500),
    t("2026-03-03", "11:00", -1000), // equity 49500 → 2500 below peak → breaches $2500
  ];
  const res = computePropRules(trades, { ...base, maxDrawdown: 2500, drawdownType: "trailing" });
  assert.equal(res.drawdown.breached, true);
  assert.equal(res.drawdown.breachDate, "2026-03-03");
  assert.equal(res.firstBreach?.type, "drawdown");
  assert.equal(res.equityAtFirstBreach, 49500);
});

test("static drawdown measures from the starting balance, not the peak", () => {
  const trades = [
    t("2026-03-02", "10:00", 1000), // 51000
    t("2026-03-03", "10:00", -3500), // 47500 → 2500 below start → breaches static 2500
  ];
  const trailing = computePropRules(trades, { ...base, maxDrawdown: 2500, drawdownType: "trailing" });
  const staticDD = computePropRules(trades, { ...base, maxDrawdown: 2500, drawdownType: "static" });
  // trailing breaches earlier/harder (peak 51000); static measures from 50000
  assert.equal(staticDD.drawdown.breached, true);
  assert.equal(trailing.drawdown.breached, true);
});

test("first breach + after-breach P&L: what wouldn't have counted", () => {
  const trades = [
    t("2026-03-02", "10:00", -1200), // breaches $1000 DLL on day 1
    t("2026-03-03", "10:00", 5000), // booked AFTER the account would have died
  ];
  const res = computePropRules(trades, { ...base, dailyLossLimit: 1000 });
  assert.equal(res.firstBreach?.date, "2026-03-02");
  assert.equal(res.afterBreachPnl, 5000); // the $5k after wouldn't have counted
});

test("consistency rule: best day too large a share of net profit", () => {
  const trades = [
    t("2026-03-02", "10:00", 200),
    t("2026-03-03", "10:00", 200),
    t("2026-03-04", "10:00", 2000), // best day = 2000 of 2400 net = 83% > 50%
  ];
  const res = computePropRules(trades, { ...base, consistencyPct: 50 });
  assert.equal(res.consistency.violated, true);
  assert.equal(res.consistency.bestDay, 2000);
  assert.ok(res.consistency.ratio !== null && res.consistency.ratio > 0.8);
});

test("clean account within all rules: no breaches", () => {
  // Balanced up-days so no single day dominates net profit (consistency-clean).
  const trades = [
    t("2026-03-02", "10:00", 300),
    t("2026-03-03", "10:00", 300),
    t("2026-03-04", "10:00", 300),
  ];
  const res = computePropRules(trades, {
    ...base,
    dailyLossLimit: 1000,
    maxDrawdown: 2500,
    consistencyPct: 50,
    maxContracts: 3,
    minTradingDays: 3,
  });
  assert.equal(res.firstBreach, null);
  assert.equal(res.dailyLossBreaches.length, 0);
  assert.equal(res.drawdown.breached, false);
  assert.equal(res.consistency.violated, false);
  assert.equal(res.minDaysMet, true);
  assert.equal(res.tradingDays, 3);
});

test("oversized trades are counted against a max-contracts rule", () => {
  const trades = [t("2026-03-02", "10:00", 100, 5), t("2026-03-02", "11:00", 100, 2)];
  const res = computePropRules(trades, { ...base, maxContracts: 3 });
  assert.equal(res.oversized.count, 1);
  assert.equal(res.oversized.maxQty, 5);
});
