// Broker abstraction.
//
// HARD BOUNDARY: this build is PAPER-ONLY. The only implemented adapter is the
// SimBrokerAdapter, which fills approved candidates against the user's imported
// bars. There is no live broker connection and no live-money routing anywhere.

// Hardcoded kill switch. Live execution is OFF and must stay off in this build.
export const LIVE_EXECUTION_ENABLED = false;

export interface SimBar {
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

export interface BrokerOrder {
  direction: "long" | "short";
  size: number;
  entry_price: number;
  stop_price: number;
  target_price: number;
  point_value: number;
  tickSize: number;
}

export type ExitReason = "target" | "stop" | "eod" | "none";

export interface BrokerFill {
  fill_price: number;
  size: number;
  entry_ts: string | null;
  exit_price: number | null;
  exit_ts: string | null;
  exit_reason: ExitReason;
  pnl_usd: number | null;
}

export interface BrokerAdapter {
  readonly id: string;
  readonly isSimulated: boolean;
  // Resolve an order into a fill. For the sim adapter, `bars` are the user's
  // imported bars at/after the approval moment.
  fill(order: BrokerOrder, bars: SimBar[]): Promise<BrokerFill>;
}

// ============================================================================
// LiveBrokerAdapter — DO NOT IMPLEMENT IN THIS BUILD.
//
// This class is intentionally left unimplemented behind LIVE_EXECUTION_ENABLED.
// None of this is to be built now. Before ANY live routing may be designed, ALL
// of the following preconditions must exist and be verified by counsel:
//
//   1. Completed CTA registration with the CFTC and NFA (Form 7-R, the
//      principal/AP Series 3 requirements, NFA membership).
//   2. A disclosure document filed with and ACCEPTED by the NFA.
//   3. A separate, signed scope agreement defining strategy ownership and
//      explicit allocation of loss liability.
//   4. Written legal sign-off from the futures/securities attorney on the
//      working system and its regulatory design.
//
// If any task seems to need live routing, STOP and ask the owner. Do not stub
// this "to almost work."
// ============================================================================
export class LiveBrokerAdapter implements BrokerAdapter {
  readonly id = "live";
  readonly isSimulated = false;

  constructor() {
    throw new Error(
      "LiveBrokerAdapter is not implemented. Live execution is disabled in this build " +
        "(LIVE_EXECUTION_ENABLED = false) pending CTA registration, an NFA-accepted " +
        "disclosure document, a signed scope agreement, and written legal sign-off.",
    );
  }

  async fill(): Promise<BrokerFill> {
    throw new Error("LiveBrokerAdapter.fill is not implemented and must not be.");
  }
}
