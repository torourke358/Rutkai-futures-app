// Unit tests for integer-minor-unit money math. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  roundHalfAwayFromZero,
  dollarsToCents,
  centsToDollars,
  priceToTicks,
  centsPerTick,
  pnlCents,
  distanceCents,
} from "./money.ts";

test("round half away from zero (symmetric ties)", () => {
  assert.equal(roundHalfAwayFromZero(2.5), 3);
  assert.equal(roundHalfAwayFromZero(-2.5), -3);
  assert.equal(roundHalfAwayFromZero(2.4), 2);
  assert.equal(roundHalfAwayFromZero(-2.4), -2);
});

test("dollarsToCents kills IEEE-754 drift (0.1 + 0.2)", () => {
  assert.equal(dollarsToCents(0.1 + 0.2), 30); // 0.30000000000000004 → 30c
  assert.equal(dollarsToCents(0.07), 7);
  assert.equal(dollarsToCents(-1234.565), -123457); // half away from zero
  assert.equal(dollarsToCents(1234.565), 123457);
  assert.equal(centsToDollars(123457), 1234.57);
});

test("priceToTicks snaps to the tick grid", () => {
  assert.equal(priceToTicks(20000.25, 0.25), 80001);
  assert.equal(priceToTicks(20000.26, 0.25), 80001); // sub-tick noise snaps
  assert.equal(priceToTicks(99.99, 0.01), 9999);
});

test("centsPerTick for seeded contracts", () => {
  assert.equal(centsPerTick(20, 0.25), 500); // NQ: $5/tick
  assert.equal(centsPerTick(50, 0.25), 1250); // ES: $12.50/tick
  assert.equal(centsPerTick(1000, 0.01), 1000); // CL: $10/tick
  assert.equal(centsPerTick(5, 1), 500); // YM: $5/tick
});

test("pnlCents is exact for long and short", () => {
  // NQ long 1 contract, 40 pt gain = 160 ticks * 500c = 80000c = $800
  assert.equal(
    pnlCents({ entryPrice: 20000, exitPrice: 20040, tickSize: 0.25, pointValue: 20, size: 1, direction: "long" }),
    80000,
  );
  // short: same move against = -$800
  assert.equal(
    pnlCents({ entryPrice: 20000, exitPrice: 20040, tickSize: 0.25, pointValue: 20, size: 1, direction: "short" }),
    -80000,
  );
  // 2 contracts doubles it
  assert.equal(
    pnlCents({ entryPrice: 20000, exitPrice: 19980, tickSize: 0.25, pointValue: 20, size: 2, direction: "long" }),
    -80000,
  );
});

test("pnlCents accumulates without float drift across many small moves", () => {
  // 1000 trades each +0.25 pt (1 tick = $5 = 500c) on NQ → exactly $5,000,000c.
  let total = 0;
  for (let i = 0; i < 1000; i++) {
    total += pnlCents({ entryPrice: 100, exitPrice: 100.25, tickSize: 0.25, pointValue: 20, size: 1, direction: "long" });
  }
  assert.equal(total, 1000 * 500);
  assert.equal(centsToDollars(total), 5000);
});

test("distanceCents values a price distance in cents", () => {
  // 12 pt MAE on NQ, 2 contracts = 48 ticks * 500c * 2 = 48000c = $480
  assert.equal(distanceCents({ points: 12, tickSize: 0.25, pointValue: 20, size: 2 }), 48000);
  assert.equal(distanceCents({ points: 0, tickSize: 0.25, pointValue: 20, size: 1 }), 0);
});
