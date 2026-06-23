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

test("trailing stop: ratchets behind the best price and exits on the retrace", () => {
  const items: SweepItem[] = [
    {
      trade: trade("A", -400),
      bars: [
        bar("t1", 20010, 19999, 20005),
        bar("t2", 20020, 20012, 20018),
        bar("t3", 20016, 20013, 20014), // trail at 20015 → low 20013 hits it
      ],
    },
  ];
  const r = sweep(items, { stopPoints: 5, targetR: null, exitRule: "trailing" });
  assert.equal(r.per_trade[0].new_exit_reason, "stop");
  assert.equal(r.per_trade[0].new_pnl_cents, 30000); // +15pt * $20 = $300
  assert.equal(r.per_trade[0].classification, "rescued");
});

test("breakeven: moves the stop to entry after the trigger, exits flat", () => {
  const items: SweepItem[] = [
    {
      trade: trade("A", -400),
      bars: [
        bar("t1", 20006, 20001, 20004), // triggers BE (+5), stop -> 20000
        bar("t2", 20001, 19998, 19999), // hits breakeven stop
      ],
    },
  ];
  const r = sweep(items, { stopPoints: 5, targetR: null, exitRule: "breakeven", breakevenR: 1 });
  assert.equal(r.per_trade[0].new_exit_reason, "stop");
  assert.equal(r.per_trade[0].new_pnl_cents, 0); // exited at entry → flat
});

test("time exit: closes after N minutes at that bar's close", () => {
  const items: SweepItem[] = [
    {
      trade: trade("A", -400),
      bars: [
        bar("t0", 20001, 19999, 20000),
        bar("t1", 20003, 20000, 20002),
        bar("t2", 20009, 20005, 20008), // index 2 = exit at close 20008
      ],
    },
  ];
  const r = sweep(items, { stopPoints: null, targetR: null, exitRule: "time", timeMinutes: 2 });
  assert.equal(r.per_trade[0].new_exit_reason, "time");
  assert.equal(r.per_trade[0].new_pnl_cents, 16000); // +8pt * $20 = $160
});

test("ATR-mode stop: stop distance = atrMultiple * trade.atr", () => {
  const items: SweepItem[] = [
    { trade: { ...trade("A", -400), atr: 3 }, bars: [bar("t1", 20001, 19993, 19995)] },
  ];
  // 2 * ATR(3) = 6pt stop → 19994; low 19993 hits it
  const r = sweep(items, {
    stopPoints: null,
    targetR: null,
    exitRule: "stop_eod",
    stopMode: "atr",
    atrMultiple: 2,
  });
  assert.equal(r.per_trade[0].new_exit_reason, "stop");
  assert.equal(r.per_trade[0].new_pnl_cents, -12000); // -6pt * $20 = -$120
});

test("ATR-mode with no ATR available falls back to the session close (no stop)", () => {
  const items: SweepItem[] = [
    { trade: trade("A", -400), bars: [bar("t1", 20007, 19990, 20005)] },
  ];
  const r = sweep(items, {
    stopPoints: null,
    targetR: null,
    exitRule: "stop_eod",
    stopMode: "atr",
    atrMultiple: 2,
  });
  assert.equal(r.per_trade[0].new_exit_reason, "eod");
  assert.equal(r.per_trade[0].new_pnl_cents, 10000); // +5pt * $20 = $100
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
