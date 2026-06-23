// Unit tests for the MAE/MFE/R excursion engine. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  computeExcursion,
  realizedR,
  postExitExcursion,
  aggregateExcursion,
  bucketByStopDistance,
  type ExcursionBar,
  type TradeForExcursion,
} from "./excursion.ts";

function bar(ts: string, high: number, low: number, close = (high + low) / 2): ExcursionBar {
  return { ts, high, low, close };
}

const longTrade: TradeForExcursion = {
  direction: "long",
  entry_price: 100,
  exit_price: 110,
  entry_at: "2026-01-01T09:00:00Z",
  exit_at: "2026-01-01T09:05:00Z",
  quantity: 2,
  point_value: 20,
};

test("long: MAE is the worst dip below entry, MFE the best run above", () => {
  const bars = [
    bar("2026-01-01T09:01:00Z", 102, 96), // dips to 96 → adverse 4
    bar("2026-01-01T09:02:00Z", 108, 99), // up to 108 → favorable 8
    bar("2026-01-01T09:03:00Z", 112, 105), // up to 112 → favorable 12 (best)
  ];
  const r = computeExcursion(longTrade, bars);
  assert.equal(r.mae_points, 4);
  assert.equal(r.mfe_points, 12);
  // USD = points * point_value(20) * qty(2)
  assert.equal(r.mae_usd, 4 * 20 * 2);
  assert.equal(r.mfe_usd, 12 * 20 * 2);
  assert.equal(r.mae_ts, "2026-01-01T09:01:00Z");
  assert.equal(r.mfe_ts, "2026-01-01T09:03:00Z");
  assert.equal(r.bar_count, 3);
});

test("short: adverse is up, favorable is down", () => {
  const shortTrade: TradeForExcursion = {
    ...longTrade,
    direction: "short",
    entry_price: 100,
    exit_price: 90,
  };
  const bars = [
    bar("2026-01-01T09:01:00Z", 104, 98), // up to 104 → adverse 4
    bar("2026-01-01T09:02:00Z", 99, 88), // down to 88 → favorable 12
  ];
  const r = computeExcursion(shortTrade, bars);
  assert.equal(r.mae_points, 4);
  assert.equal(r.mfe_points, 12);
  assert.equal(r.mae_ts, "2026-01-01T09:01:00Z");
  assert.equal(r.mfe_ts, "2026-01-01T09:02:00Z");
});

test("excursions never go negative; price that only moves in favor has MAE 0", () => {
  const bars = [bar("2026-01-01T09:01:00Z", 105, 101)]; // never below entry 100
  const r = computeExcursion(longTrade, bars);
  assert.equal(r.mae_points, 0);
  assert.equal(r.mfe_points, 5);
});

test("no bars in window → graceful nulls, not a throw", () => {
  const r = computeExcursion(longTrade, []);
  assert.equal(r.mae_points, null);
  assert.equal(r.mfe_points, null);
  assert.equal(r.mae_usd, null);
  assert.equal(r.bar_count, 0);
});

test("bars outside [entry, exit] are ignored", () => {
  const bars = [
    bar("2026-01-01T08:59:00Z", 200, 10), // before entry — ignored
    bar("2026-01-01T09:02:00Z", 103, 98),
    bar("2026-01-01T09:30:00Z", 200, 10), // after exit — ignored
  ];
  const r = computeExcursion(longTrade, bars);
  assert.equal(r.bar_count, 1);
  assert.equal(r.mae_points, 2);
  assert.equal(r.mfe_points, 3);
});

test("realizedR: null without a planned stop, computed with one", () => {
  assert.equal(realizedR(longTrade), null);
  // entry 100, stop 96 → risk 4; exit 110 → +10 → 2.5R
  assert.equal(realizedR({ ...longTrade, planned_stop_price: 96 }), 2.5);
  // short: entry 100, stop 104 → risk 4; exit 90 → +10 → 2.5R
  assert.equal(
    realizedR({ ...longTrade, direction: "short", exit_price: 90, planned_stop_price: 104 }),
    2.5,
  );
});

test("realizedR: zero-width stop or open trade → null", () => {
  assert.equal(realizedR({ ...longTrade, planned_stop_price: 100 }), null);
  assert.equal(realizedR({ ...longTrade, exit_price: null, planned_stop_price: 96 }), null);
});

test("postExitExcursion: furthest favorable move after exit, in R when stop known", () => {
  const after = [
    bar("2026-01-01T09:06:00Z", 114, 109),
    bar("2026-01-01T09:07:00Z", 120, 112), // best high 120 → 10 pts above exit 110
  ];
  const res = postExitExcursion({ ...longTrade, planned_stop_price: 96 }, after);
  assert.equal(res.furthest_favorable_points, 10);
  assert.equal(res.furthest_favorable_ts, "2026-01-01T09:07:00Z");
  // 10 pts / 4-pt risk = 2.5R
  assert.equal(res.reached_r, 2.5);
  assert.equal(res.bar_count, 2);
});

test("aggregateExcursion: winners vs losers + MFE giveback", () => {
  const agg = aggregateExcursion([
    { realized_pnl: 100, mae_points: 2, mfe_points: 12, realized_points: 8, planned_stop_points: 10 },
    { realized_pnl: -50, mae_points: 9, mfe_points: 3, realized_points: -5, planned_stop_points: 10 },
    { realized_pnl: 200, mae_points: 4, mfe_points: 16, realized_points: 12, planned_stop_points: 20 },
  ]);
  assert.equal(agg.winners.count, 2);
  assert.equal(agg.losers.count, 1);
  assert.equal(agg.winners.avgMaePoints, 3); // (2+4)/2
  // avgMfe (12+3+16)/3 = 10.3333; avgRealized (8-5+12)/3 = 5
  assert.equal(agg.avgRealizedPoints, 5);
  assert.ok(agg.givebackPoints !== null && agg.givebackPoints > 5);
});

test("bucketByStopDistance: groups trades by logged stop width", () => {
  const buckets = bucketByStopDistance(
    [
      { realized_pnl: 100, mae_points: 2, mfe_points: 9, realized_points: 6, planned_stop_points: 5 },
      { realized_pnl: -50, mae_points: 8, mfe_points: 2, realized_points: -5, planned_stop_points: 8 },
      { realized_pnl: 150, mae_points: 4, mfe_points: 12, realized_points: 9, planned_stop_points: 25 },
    ],
    [10, 20, 30, 50],
  );
  const tight = buckets.find((b) => b.label === "0–10 pts");
  assert.ok(tight);
  assert.equal(tight!.count, 2);
  assert.equal(tight!.winRate, 0.5);
});
