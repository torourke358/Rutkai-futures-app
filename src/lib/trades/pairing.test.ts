// Unit tests for the FIFO pairing algorithm. Run with `npm test`.
// Uses node:test (built-in) so we don't pull jest/vitest in.
import { strict as assert } from "node:assert";
import test from "node:test";
import { pairTrades, type Execution } from "./pairing.ts";

function ex(
  id: string,
  symbol: string,
  side: "buy" | "sell",
  qty: number,
  price: number,
  at: string,
  fees = 0,
): Execution {
  return { id, symbol, side, quantity: qty, price, fees, executed_at: at };
}

test("single round-trip long → one closed trade with correct P&L", () => {
  const trades = pairTrades([
    ex("1", "ES", "buy", 1, 100, "2026-01-01T09:00:00Z", 2),
    ex("2", "ES", "sell", 1, 110, "2026-01-01T10:00:00Z", 2),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, "long");
  assert.equal(trades[0].entry_price, 100);
  assert.equal(trades[0].exit_price, 110);
  assert.equal(trades[0].quantity, 1);
  // (110-100)*1 - 2 - 2 = 6
  assert.equal(trades[0].realized_pnl, 6);
  assert.equal(trades[0].status, "closed");
});

test("single round-trip short → P&L sign flips correctly", () => {
  const trades = pairTrades([
    ex("1", "NQ", "sell", 2, 200, "2026-01-01T09:00:00Z"),
    ex("2", "NQ", "buy", 2, 190, "2026-01-01T10:00:00Z"),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, "short");
  assert.equal(trades[0].realized_pnl, 20); // (200-190)*2 - 0
});

test("multiple opening lots → multiple trades on aggregated close (FIFO)", () => {
  const trades = pairTrades([
    ex("1", "CL", "buy", 5, 70, "2026-01-01T09:00:00Z"),
    ex("2", "CL", "buy", 5, 72, "2026-01-01T09:30:00Z"),
    ex("3", "CL", "sell", 10, 75, "2026-01-01T10:00:00Z"),
  ]);
  assert.equal(trades.length, 2);
  // Lot 1 closed against the FIRST 5 of the sell
  assert.equal(trades[0].entry_price, 70);
  assert.equal(trades[0].exit_price, 75);
  assert.equal(trades[0].quantity, 5);
  assert.equal(trades[0].realized_pnl, 25);
  // Lot 2 closed against the REMAINING 5
  assert.equal(trades[1].entry_price, 72);
  assert.equal(trades[1].quantity, 5);
  assert.equal(trades[1].realized_pnl, 15);
});

test("partial close → trade emitted for matched qty, rest stays open", () => {
  const trades = pairTrades([
    ex("1", "GC", "buy", 10, 1800, "2026-01-01T09:00:00Z", 5),
    ex("2", "GC", "sell", 4, 1810, "2026-01-01T10:00:00Z", 2),
  ]);
  assert.equal(trades.length, 2);
  const closed = trades.find((t) => t.status === "closed")!;
  const open = trades.find((t) => t.status === "open")!;
  assert.equal(closed.quantity, 4);
  // Entry fees: (5 * 4/10) = 2; exit fees: 2 * (4/4) = 2
  assert.equal(closed.fees, 4);
  // (1810-1800)*4 - 4 = 36
  assert.equal(closed.realized_pnl, 36);
  assert.equal(open.quantity, 6);
  assert.equal(open.entry_price, 1800);
  assert.equal(open.exit_price, null);
  // Remaining fee on the open lot: 5 - 2 = 3
  assert.equal(open.fees, 3);
});

test("position flip: close all + open opposite direction", () => {
  const trades = pairTrades([
    ex("1", "MES", "buy", 3, 5000, "2026-01-01T09:00:00Z"),
    ex("2", "MES", "sell", 5, 5010, "2026-01-01T10:00:00Z"),
  ]);
  assert.equal(trades.length, 2);
  const closedLong = trades.find((t) => t.direction === "long")!;
  const openShort = trades.find((t) => t.direction === "short")!;
  assert.equal(closedLong.quantity, 3);
  assert.equal(closedLong.realized_pnl, 30);
  assert.equal(openShort.status, "open");
  assert.equal(openShort.quantity, 2);
  assert.equal(openShort.entry_price, 5010);
});

test("symbols are isolated — no cross-symbol matching", () => {
  const trades = pairTrades([
    ex("1", "ES", "buy", 1, 100, "2026-01-01T09:00:00Z"),
    ex("2", "NQ", "sell", 1, 200, "2026-01-01T09:30:00Z"),
    ex("3", "ES", "sell", 1, 105, "2026-01-01T10:00:00Z"),
    ex("4", "NQ", "buy", 1, 195, "2026-01-01T10:30:00Z"),
  ]);
  assert.equal(trades.length, 2);
  const es = trades.find((t) => t.symbol === "ES")!;
  const nq = trades.find((t) => t.symbol === "NQ")!;
  assert.equal(es.realized_pnl, 5);
  assert.equal(nq.realized_pnl, 5);
});

test("idempotent: re-running on the same input yields identical trades", () => {
  const execs: Execution[] = [
    ex("1", "ES", "buy", 2, 100, "2026-01-01T09:00:00Z"),
    ex("2", "ES", "buy", 3, 101, "2026-01-01T09:15:00Z"),
    ex("3", "ES", "sell", 4, 105, "2026-01-01T10:00:00Z"),
    ex("4", "ES", "sell", 1, 106, "2026-01-01T11:00:00Z"),
  ];
  const a = pairTrades(execs);
  const b = pairTrades([...execs].reverse().reverse()); // copy
  assert.deepEqual(a, b);
});

test("out-of-order timestamps are normalized before pairing", () => {
  // Same execs as the simple round-trip, fed in reverse — should still pair.
  const trades = pairTrades([
    ex("2", "ES", "sell", 1, 110, "2026-01-01T10:00:00Z"),
    ex("1", "ES", "buy", 1, 100, "2026-01-01T09:00:00Z"),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, "long");
  assert.equal(trades[0].realized_pnl, 10);
});

test("empty input → empty output", () => {
  assert.deepEqual(pairTrades([]), []);
});

test("point multiplier scales realized P&L but not fees", () => {
  const mult = new Map([["ES", 50]]);
  const trades = pairTrades(
    [
      ex("1", "ES", "buy", 1, 5000, "2026-01-01T09:00:00Z", 2),
      ex("2", "ES", "sell", 1, 5004, "2026-01-01T10:00:00Z", 2),
    ],
    mult,
  );
  assert.equal(trades.length, 1);
  assert.equal(trades[0].point_value, 50);
  // gross = (5004-5000)*1*50 = 200; fees 2+2=4 (unscaled) → 196
  assert.equal(trades[0].realized_pnl, 196);
  assert.equal(trades[0].fees, 4);
});

test("missing multiplier defaults to 1x", () => {
  const trades = pairTrades(
    [
      ex("1", "ZZ", "buy", 1, 100, "2026-01-01T09:00:00Z"),
      ex("2", "ZZ", "sell", 1, 110, "2026-01-01T10:00:00Z"),
    ],
    new Map([["ES", 50]]),
  );
  assert.equal(trades[0].point_value, 1);
  assert.equal(trades[0].realized_pnl, 10);
});
