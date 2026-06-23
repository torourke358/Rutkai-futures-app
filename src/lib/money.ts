// Centralized money math in INTEGER MINOR UNITS. Every P&L/price calculation
// routes through here so financial figures are exact and reproducible — raw
// IEEE-754 drifts in the last cents (`0.1 + 0.2 !== 0.3`), which is
// unacceptable for an accounting-grade product.
//
// Conventions:
//   - Dollar amounts are integer CENTS.
//   - Prices are integer TICKS (via the instrument tick_size).
//   - The ONE rounding rule: round half AWAY FROM ZERO, at the cent.
//   - Convert to display units only at the formatting edge (see lib/format.ts).
//
// Pure and fully unit-tested in money.test.ts.

// The single rounding rule for the whole app: round half away from zero.
// (ROUND_HALF_UP in decimal-lib terms: ties go away from zero, so 2.5 -> 3 and
// -2.5 -> -3, keeping gains and losses symmetric.)
export function roundHalfAwayFromZero(n: number): number {
  return n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5);
}

// Dollars (possibly float-noisy) -> integer cents. A tiny sign-aware epsilon
// absorbs representation noise (e.g. 30.000000000000004 / 29.999999999999996)
// before the rounding boundary so genuine half-cents still round away from zero.
export function dollarsToCents(dollars: number): number {
  const scaled = dollars * 100;
  const eps = scaled >= 0 ? 1e-6 : -1e-6;
  return roundHalfAwayFromZero(scaled + eps);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

// Price -> nearest integer number of ticks. Snapping to the tick grid removes
// sub-tick float noise in imported prices before any subtraction.
export function priceToTicks(price: number, tickSize: number): number {
  if (!tickSize || tickSize <= 0) return Math.round(price * 100); // fallback: price-cents
  return Math.round(price / tickSize);
}

export function ticksToPrice(ticks: number, tickSize: number): number {
  return ticks * tickSize;
}

// Integer cents of value per ONE tick of price for ONE contract:
//   dollars per tick = pointValue * tickSize  ->  * 100 cents.
// For the seeded contracts this is always a whole number of cents (NQ 0.25 *
// $20 = $5 = 500c; ES 0.25 * $50 = $12.50 = 1250c; CL 0.01 * $1000 = $10 =
// 1000c). dollarsToCents handles any odd spec safely.
export function centsPerTick(pointValue: number, tickSize: number): number {
  return dollarsToCents(pointValue * tickSize);
}

// Exact realized P&L in integer cents for a position:
//   moveTicks * centsPerTick * size, signed by direction.
// `size` may be fractional (journal quantity); a single controlled rounding at
// the end keeps the result an integer number of cents.
export function pnlCents(args: {
  entryPrice: number;
  exitPrice: number;
  tickSize: number;
  pointValue: number;
  size: number;
  direction: "long" | "short";
}): number {
  const { entryPrice, exitPrice, tickSize, pointValue, size, direction } = args;
  const moveTicks = priceToTicks(exitPrice, tickSize) - priceToTicks(entryPrice, tickSize);
  const dir = direction === "long" ? 1 : -1;
  return roundHalfAwayFromZero(moveTicks * centsPerTick(pointValue, tickSize) * size * dir);
}

// A price DISTANCE (e.g. an MAE/MFE magnitude in price points) expressed as an
// integer number of ticks. Always non-negative input expected.
export function distanceToTicks(points: number, tickSize: number): number {
  return priceToTicks(points, tickSize);
}

// Value (integer cents) of a price distance over `size` units:
//   |ticks| * centsPerTick * size.
export function distanceCents(args: {
  points: number;
  tickSize: number;
  pointValue: number;
  size: number;
}): number {
  const { points, tickSize, pointValue, size } = args;
  const ticks = Math.abs(distanceToTicks(points, tickSize));
  return roundHalfAwayFromZero(ticks * centsPerTick(pointValue, tickSize) * size);
}
