import type { EntryStrategy, EntryContext, EntrySignalOut } from "@/lib/engine/strategy";

// ============================================================================
// EXAMPLE ONLY — NOT A TRADING EDGE. Replace with your own strategy.
//
// A plain, textbook moving-average crossover that exists SOLELY so the engine
// runs end-to-end for a demo. It is deliberately trivial and is not, and is not
// presented as, a profitable method. It encodes no third party's logic.
// ============================================================================

const FAST = 9;
const SLOW = 21;

function sma(values: number[], end: number, period: number): number | null {
  const start = end - period + 1;
  if (start < 0) return null;
  let sum = 0;
  for (let i = start; i <= end; i++) sum += values[i];
  return sum / period;
}

export const exampleMaCross: EntryStrategy = {
  id: "example_ma_cross",
  label: "Example MA crossover",
  exampleNotice:
    "EXAMPLE ONLY — not a trading edge. Replace with your own strategy.",

  evaluate(ctx: EntryContext): EntrySignalOut | null {
    const closes = ctx.bars.map((b) => b.close);
    const n = closes.length;
    if (n < SLOW + 1) return null;

    const last = n - 1;
    const prev = n - 2;

    const fastNow = sma(closes, last, FAST);
    const slowNow = sma(closes, last, SLOW);
    const fastPrev = sma(closes, prev, FAST);
    const slowPrev = sma(closes, prev, SLOW);
    if (fastNow == null || slowNow == null || fastPrev == null || slowPrev == null) {
      return null;
    }

    const entry_price = closes[last];

    // Cross up → long; cross down → short; otherwise no signal.
    if (fastPrev <= slowPrev && fastNow > slowNow) {
      return { direction: "long", entry_price, rationale_tag: "ma_cross_up" };
    }
    if (fastPrev >= slowPrev && fastNow < slowNow) {
      return { direction: "short", entry_price, rationale_tag: "ma_cross_down" };
    }
    return null;
  },
};
