import type {
  BrokerAdapter,
  BrokerOrder,
  BrokerFill,
  SimBar,
  ExitReason,
} from "@/lib/broker/BrokerAdapter";
import { pnlCents, centsToDollars } from "../money.ts";

// The ONLY broker implementation in this build. Produces a SIMULATED fill of an
// approved candidate against the user's imported bars: it enters at the
// candidate's entry price, then walks bars forward until the stop or target is
// touched (stop assumed first when a single bar spans both — the conservative
// choice), otherwise exits at the last bar's close. Pure and deterministic.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Exposed for unit testing; the adapter just wraps this.
export function simulateFill(order: BrokerOrder, bars: SimBar[]): BrokerFill {
  const clean = bars
    .filter((b) => b.high != null && b.low != null)
    .slice()
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  const base: BrokerFill = {
    fill_price: round2(order.entry_price),
    size: order.size,
    entry_ts: clean[0]?.ts ?? null,
    exit_price: null,
    exit_ts: null,
    exit_reason: "none",
    pnl_usd: null,
  };

  if (clean.length === 0) return base; // no bars → entered, not yet resolved

  const isLong = order.direction === "long";
  let exitPrice: number | null = null;
  let exitTs: string | null = null;
  let reason: ExitReason = "eod";

  for (const b of clean) {
    const high = b.high as number;
    const low = b.low as number;
    const stopHit = isLong ? low <= order.stop_price : high >= order.stop_price;
    const targetHit = isLong ? high >= order.target_price : low <= order.target_price;

    if (stopHit) {
      // Conservative: if a bar spans both, assume the stop filled first.
      exitPrice = order.stop_price;
      exitTs = b.ts;
      reason = "stop";
      break;
    }
    if (targetHit) {
      exitPrice = order.target_price;
      exitTs = b.ts;
      reason = "target";
      break;
    }
  }

  if (exitPrice == null) {
    const lastClose = clean[clean.length - 1].close;
    exitPrice = lastClose ?? order.entry_price;
    exitTs = clean[clean.length - 1].ts;
    reason = "eod";
  }

  // Exact P&L in integer cents (snapped to the tick grid), then to dollars.
  const pnl = centsToDollars(
    pnlCents({
      entryPrice: order.entry_price,
      exitPrice,
      tickSize: order.tickSize,
      pointValue: order.point_value,
      size: order.size,
      direction: order.direction,
    }),
  );

  return {
    ...base,
    exit_price: round2(exitPrice),
    exit_ts: exitTs,
    exit_reason: reason,
    pnl_usd: pnl,
  };
}

export class SimBrokerAdapter implements BrokerAdapter {
  readonly id = "sim";
  readonly isSimulated = true;

  async fill(order: BrokerOrder, bars: SimBar[]): Promise<BrokerFill> {
    return simulateFill(order, bars);
  }
}
