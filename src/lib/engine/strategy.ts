// Pluggable entry-strategy contract.
//
// The ENGINE owns risk/sizing/exits (riskTemplate.ts). The ENTRY decision is a
// pluggable interface the owner fills with their OWN logic — or licenses one
// and drops it into the same slot. No third-party method is encoded anywhere in
// this codebase; the only shipped implementation is a labeled placeholder.
//
// A strategy receives bars/derived data for one instrument and returns at most
// one entry signal, or null when it sees nothing.

export interface StrategyBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface EntryContext {
  instrumentSymbol: string;
  bars: StrategyBar[]; // ascending by time; last bar is the most recent
}

export interface EntrySignalOut {
  direction: "long" | "short";
  entry_price: number;
  rationale_tag: string;
}

export interface EntryStrategy {
  id: string;
  label: string;
  // Non-empty for the placeholder so the UI can warn it is not an edge. Real
  // owner strategies leave this undefined.
  exampleNotice?: string;
  evaluate(ctx: EntryContext): EntrySignalOut | null;
}
