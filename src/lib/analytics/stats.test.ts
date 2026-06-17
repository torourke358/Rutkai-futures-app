// Unit tests for analytics. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  computeStats,
  computeEquityCurve,
  computeDrawdownCurve,
  computeRDistribution,
  sliceStats,
  sliceByDayOfWeek,
  type TradeForStats,
} from "./stats.ts";

function tr(
  realized_pnl: number,
  exit_at: string,
  r: number | null = null,
  extra: Partial<TradeForStats> = {},
): TradeForStats {
  return {
    symbol: extra.symbol ?? "ES",
    direction: extra.direction ?? "long",
    quantity: 1,
    realized_pnl,
    fees: 0,
    entry_at: extra.entry_at ?? exit_at,
    exit_at,
    setup_tag: extra.setup_tag ?? null,
    tags: extra.tags ?? null,
    r,
  };
}

const SAMPLE: TradeForStats[] = [
  tr(100, "2026-01-05T12:00:00Z", 2),
  tr(200, "2026-01-05T13:00:00Z", 1),
  tr(-50, "2026-01-08T12:00:00Z", -1),
  tr(0, "2026-01-08T13:00:00Z", null),
];

test("computeStats: core metrics", () => {
  const s = computeStats(SAMPLE);
  assert.equal(s.netPnl, 250);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 1);
  assert.equal(s.breakEvens, 1);
  assert.equal(s.avgWin, 150);
  assert.equal(s.avgLoss, 50);
  assert.equal(s.profitFactor, 6);
  assert.equal(s.payoffRatio, 3);
  assert.equal(s.winRate, 2 / 3); // wins/(wins+losses), scratches excluded
  assert.equal(s.expectancy, 62.5); // net 250 / 4 trades taken
  assert.equal(s.largestWin, 200);
  assert.equal(s.largestLoss, -50);
});

test("computeStats: R, streaks, day metrics", () => {
  const s = computeStats(SAMPLE);
  assert.equal(s.avgR, 0.67); // (2 + 1 - 1) / 3
  assert.equal(s.tradesWithR, 3);
  assert.equal(s.maxConsecWins, 2);
  assert.equal(s.maxConsecLosses, 1);
  assert.equal(s.tradingDays, 2);
  assert.equal(s.winningDays, 1);
  assert.equal(s.losingDays, 1);
  assert.equal(s.avgDailyPnl, 125);
});

test("computeStats: empty input is safe", () => {
  const s = computeStats([]);
  assert.equal(s.netPnl, 0);
  assert.equal(s.winRate, 0);
  assert.equal(s.avgR, null);
  assert.equal(s.profitFactor, null);
});

test("equity and drawdown curves", () => {
  const eq = computeEquityCurve(SAMPLE);
  assert.deepEqual(
    eq.map((p) => p.cumulative),
    [100, 300, 250, 250],
  );
  const dd = computeDrawdownCurve(SAMPLE);
  // Peak 300 after 2nd trade; -50 trade pulls 50 under water.
  assert.deepEqual(
    dd.map((p) => p.drawdown),
    [0, 0, -50, -50],
  );
});

test("R distribution buckets count only valued trades", () => {
  const dist = computeRDistribution(SAMPLE, 0.5);
  const total = dist.reduce((n, b) => n + b.count, 0);
  assert.equal(total, 3);
  assert.equal(dist.find((b) => b.start === 2)?.count, 1);
  assert.equal(dist.find((b) => b.start === -1)?.count, 1);
  assert.equal(dist.find((b) => b.start === 2)?.label, "+2R");
});

test("sliceStats by setup: win rate + expectancy per bucket", () => {
  const trades = [
    tr(100, "2026-01-05T12:00:00Z", 1, { setup_tag: "breakout" }),
    tr(-40, "2026-01-05T13:00:00Z", -1, { setup_tag: "breakout" }),
    tr(60, "2026-01-06T12:00:00Z", 1, { setup_tag: "reversal" }),
  ];
  const rows = sliceStats(trades, (t) => [t.setup_tag ?? "(unset)"]);
  const breakout = rows.find((r) => r.label === "breakout")!;
  assert.equal(breakout.count, 2);
  assert.equal(breakout.winRate, 0.5);
  assert.equal(breakout.netPnl, 60);
  // reversal: single win
  const reversal = rows.find((r) => r.label === "reversal")!;
  assert.equal(reversal.winRate, 1);
});

test("sliceByDayOfWeek orders Mon→Sun", () => {
  const trades = [
    tr(10, "2026-01-06T12:00:00Z", null, { entry_at: "2026-01-06T12:00:00Z" }), // Tue
    tr(20, "2026-01-05T12:00:00Z", null, { entry_at: "2026-01-05T12:00:00Z" }), // Mon
  ];
  const rows = sliceByDayOfWeek(trades);
  assert.equal(rows[0].label, "Mon");
  assert.equal(rows[1].label, "Tue");
});
