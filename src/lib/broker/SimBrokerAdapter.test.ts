// Unit tests for the simulated fill engine. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { simulateFill } from "./SimBrokerAdapter.ts";
import type { BrokerOrder, SimBar } from "./BrokerAdapter.ts";

const longOrder: BrokerOrder = {
  direction: "long",
  size: 2,
  entry_price: 100,
  stop_price: 96,
  target_price: 108,
  point_value: 20,
  tickSize: 0.25,
};

function bar(ts: string, high: number, low: number, close = (high + low) / 2): SimBar {
  return { ts, open: low, high, low, close };
}

test("long target hit → exit at target, positive pnl", () => {
  const fill = simulateFill(longOrder, [
    bar("2026-01-01T09:01:00Z", 103, 99),
    bar("2026-01-01T09:02:00Z", 110, 104), // high 110 >= target 108
  ]);
  assert.equal(fill.exit_reason, "target");
  assert.equal(fill.exit_price, 108);
  // (108-100)*1*2*20 = 320
  assert.equal(fill.pnl_usd, 320);
  assert.equal(fill.exit_ts, "2026-01-01T09:02:00Z");
});

test("long stop hit → exit at stop, negative pnl", () => {
  const fill = simulateFill(longOrder, [bar("2026-01-01T09:01:00Z", 101, 95)]);
  assert.equal(fill.exit_reason, "stop");
  assert.equal(fill.exit_price, 96);
  // (96-100)*1*2*20 = -160
  assert.equal(fill.pnl_usd, -160);
});

test("bar spanning both stop and target → stop assumed first (conservative)", () => {
  const fill = simulateFill(longOrder, [bar("2026-01-01T09:01:00Z", 110, 95)]);
  assert.equal(fill.exit_reason, "stop");
});

test("no stop/target touch → exit at last close (eod)", () => {
  const fill = simulateFill(longOrder, [
    bar("2026-01-01T09:01:00Z", 103, 99, 101),
    bar("2026-01-01T09:02:00Z", 104, 100, 102),
  ]);
  assert.equal(fill.exit_reason, "eod");
  assert.equal(fill.exit_price, 102);
});

test("short target is below entry", () => {
  const shortOrder: BrokerOrder = {
    ...longOrder,
    direction: "short",
    stop_price: 104,
    target_price: 92,
  };
  const fill = simulateFill(shortOrder, [bar("2026-01-01T09:01:00Z", 99, 90)]);
  assert.equal(fill.exit_reason, "target");
  assert.equal(fill.exit_price, 92);
  // (92-100)*-1*2*20 = 320
  assert.equal(fill.pnl_usd, 320);
});

test("no bars → entered but unresolved", () => {
  const fill = simulateFill(longOrder, []);
  assert.equal(fill.exit_reason, "none");
  assert.equal(fill.exit_price, null);
  assert.equal(fill.pnl_usd, null);
});
