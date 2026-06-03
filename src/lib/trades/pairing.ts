// FIFO execution pairing — turns a stream of raw fills into closed round-trip
// trades plus any leftover open positions.
//
// Per symbol, walk executions in time order, maintaining a FIFO queue of
// "open lots" (entry executions with remaining quantity). When an opposing
// execution arrives, it consumes lots from the front of the queue, emitting
// one closed trade per (lot, close) match. Same-direction execs add lots to
// the queue. A close exec that exceeds the open position closes everything,
// then flips: the leftover quantity opens a new position in the opposite
// direction.
//
// Pure function — same inputs → same outputs. Re-running it over the full
// execution history reproduces the same closed trades, so the trades table
// can be UPSERTed by a deterministic pairing_key without dupes.

export interface Execution {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  executed_at: string; // ISO timestamp; comparable lexicographically when UTC
}

export interface PairedTrade {
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  fees: number;
  realized_pnl: number | null;
  status: "open" | "closed";
}

// A still-open entry execution with remaining un-matched quantity. The
// allocated fee tracks how much of the execution's commission still belongs
// to the un-matched portion so partial closes split fees proportionally.
interface OpenLot {
  exec: Execution;
  remainingQty: number;
  feeRemaining: number;
}

const EPS = 1e-9;

export function pairTrades(executions: Execution[]): PairedTrade[] {
  const bySymbol = new Map<string, Execution[]>();
  for (const e of executions) {
    const arr = bySymbol.get(e.symbol) ?? [];
    arr.push(e);
    bySymbol.set(e.symbol, arr);
  }

  const trades: PairedTrade[] = [];

  for (const [symbol, execs] of bySymbol) {
    execs.sort((a, b) => {
      if (a.executed_at !== b.executed_at) return a.executed_at < b.executed_at ? -1 : 1;
      // Stable secondary by id so the same input always sorts the same way.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    let openSide: "long" | "short" | null = null;
    const openLots: OpenLot[] = [];

    for (const exec of execs) {
      const execIsBuy = exec.side === "buy";
      let remaining = exec.quantity;
      // Track how much of this execution's fee still needs to be allocated
      // to matches; the leftover (if exec opens a new position) stays on the
      // resulting open lot.
      let feeRemaining = exec.fees;

      while (remaining > EPS) {
        const empty = openLots.length === 0;
        const sameDir =
          (openSide === "long" && execIsBuy) ||
          (openSide === "short" && !execIsBuy);

        if (empty || sameDir) {
          // Opening or adding to the existing position.
          openSide = openSide ?? (execIsBuy ? "long" : "short");
          const feePortion = feeRemaining * (remaining / exec.quantity);
          openLots.push({
            exec,
            remainingQty: remaining,
            feeRemaining: feePortion,
          });
          remaining = 0;
          break;
        }

        // Closing — match against the oldest open lot.
        const lot = openLots[0];
        const matchQty = Math.min(lot.remainingQty, remaining);
        const entryFeePortion = lot.feeRemaining * (matchQty / lot.remainingQty);
        const exitFeePortion = feeRemaining * (matchQty / exec.quantity);

        const dirMul = openSide === "long" ? 1 : -1;
        const grossPnl = (exec.price - lot.exec.price) * matchQty * dirMul;
        const pnl = grossPnl - entryFeePortion - exitFeePortion;

        trades.push({
          symbol,
          direction: openSide!,
          quantity: round6(matchQty),
          entry_price: lot.exec.price,
          exit_price: exec.price,
          entry_at: lot.exec.executed_at,
          exit_at: exec.executed_at,
          fees: round6(entryFeePortion + exitFeePortion),
          realized_pnl: round6(pnl),
          status: "closed",
        });

        lot.remainingQty -= matchQty;
        lot.feeRemaining -= entryFeePortion;
        remaining -= matchQty;
        feeRemaining -= exitFeePortion;

        if (lot.remainingQty <= EPS) {
          openLots.shift();
          if (openLots.length === 0) openSide = null;
        }
      }
    }

    // Anything left in the queue is an open position; aggregate to one row
    // per symbol/direction so the UI doesn't show one open trade per fill.
    if (openLots.length > 0 && openSide) {
      let qty = 0;
      let weighted = 0;
      let fees = 0;
      const entryAt = openLots[0].exec.executed_at;
      for (const lot of openLots) {
        qty += lot.remainingQty;
        weighted += lot.exec.price * lot.remainingQty;
        fees += lot.feeRemaining;
      }
      trades.push({
        symbol,
        direction: openSide,
        quantity: round6(qty),
        entry_price: round6(weighted / qty),
        exit_price: null,
        entry_at: entryAt,
        exit_at: null,
        fees: round6(fees),
        realized_pnl: null,
        status: "open",
      });
    }
  }

  return trades;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
