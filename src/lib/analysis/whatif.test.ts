// Unit tests for the what-if counterfactual sweep. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { sweep, type SweepItem, type SweepTrade, type SweepBar } from "./whatif.ts";

const NQ = { tick_size: 0.25, point_value: 20 };

function trade(id: string, realized_pnl: number, dir: "long" | "short" = "long"): SweepTrade {
  return { id, symbol: "NQ", direction: dir, quantity: 1, entry_price: 20000, realized_pnl, ...NQ };
}
function bar(ts: string, high: number, low: number, close: number): SweepBar {
  return { ts, open: (high + low) / 2, high, low, close };
}

test("models rescued losers AND given-back winners under one param set (no survivorship bias)", () => {
  // Under an end-of-session exit:
  //  A: a trade that was stopped for -$400 would have CLOSED at +$600 (rescued)
  //  B: a +$800 winner would have given back to +$200 (gaveback)
  const items: SweepItem[] = [
    {
      trade: trade("A", -400),
      bars: [bar("t1", 20005, 19980, 19990), bar("t2", 20035, 19995, 20030)], // closes +30pt
    },
    {
      trade: trade("B", 800),
      bars: [bar("t1", 20045, 20000, 20040), bar("t2", 20040, 20005, 20010)], // closes +10pt
    },
  ];
  const r = sweep(items, { stopPoints: null, targetR: null, exitRule: "eod" });

  assert.equal(r.summary.with_bars, 2);
  assert.equal(r.summary.rescued, 1);
  assert.equal(r.summary.winners_gaveback, 1);
  assert.equal(r.per_trade[0].classification, "rescued");
  assert.equal(r.per_trade[1].classification, "winner_gaveback");
  // A: +600 = 60000c (delta +100000); B: +200 = 20000c (delta -60000); net +40000c
  assert.equal(r.per_trade[0].new_pnl_cents, 60000);
  assert.equal(r.per_trade[1].new_pnl_cents, 20000);
  assert.equal(r.summary.net_delta_cents, 40000);
  // Honesty check: the headline is NET of both effects, not just the rescue.
  assert.equal(r.summary.new_net_pnl_cents, 80000);
  assert.equal(r.summary.original_net_pnl_cents, 40000);
});

test("stop_target: a wider stop rescues a stopped-out trade that later hit target", () => {
  // Original: stopped at -$400 (20pt). With a 30pt stop + 2R target, it survives
  // the dip to 19975 and reaches the 20060 target.
  const items: SweepItem[] = [
    {
      trade: trade("A", -400),
      bars: [bar("t1", 20002, 19975, 19990), bar("t2", 20065, 20040, 20060)],
    },
  ];
  const r = sweep(items, { stopPoints: 30, targetR: 2, exitRule: "stop_target" });
  assert.equal(r.per_trade[0].new_exit_reason, "target");
  assert.equal(r.per_trade[0].new_pnl_cents, 120000); // +60pt * $20 = $1200
  assert.equal(r.per_trade[0].classification, "rescued");
});

test("stop_target: a wider stop can DEEPEN a loss", () => {
  // Original -$400 (20pt). A 40pt stop just gets run harder → -$800.
  const items: SweepItem[] = [
    { trade: trade("A", -400), bars: [bar("t1", 20001, 19955, 19960)] },
  ];
  const r = sweep(items, { stopPoints: 40, targetR: 3, exitRule: "stop_target" });
  assert.equal(r.per_trade[0].new_exit_reason, "stop");
  assert.equal(r.per_trade[0].new_pnl_cents, -80000); // -40pt * $20 = -$800
  assert.equal(r.per_trade[0].classification, "deepened");
  assert.equal(r.summary.net_delta_cents, -40000);
});

test("is bit-for-bit reproducible across two runs", () => {
  const items: SweepItem[] = [
    { trade: trade("A", -400), bars: [bar("t1", 20002, 19975, 19990), bar("t2", 20065, 20040, 20060)] },
    { trade: trade("B", 800), bars: [bar("t1", 20045, 20000, 20040), bar("t2", 20040, 20005, 20010)] },
  ];
  const params = { stopPoints: 30, targetR: 2, exitRule: "stop_target" as const };
  const r1 = sweep(items, params);
  const r2 = sweep(items, params);
  assert.deepEqual(r1, r2);
});

test("trades with no covering bars are reported, not silently dropped", () => {
  const items: SweepItem[] = [{ trade: trade("A", -400), bars: [] }];
  const r = sweep(items, { stopPoints: 30, targetR: 2, exitRule: "stop_target" });
  assert.equal(r.summary.no_bars, 1);
  assert.equal(r.summary.with_bars, 0);
  assert.equal(r.per_trade[0].new_pnl_cents, null);
  assert.equal(r.per_trade[0].classification, "no_bars");
  // Its original outcome still counts toward the new net (we didn't re-run it).
  assert.equal(r.summary.new_net_pnl_cents, -40000);
});
