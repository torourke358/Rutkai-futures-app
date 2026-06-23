import type { EntryStrategy, StrategyBar } from "@/lib/engine/strategy";
import {
  atr,
  buildSizedCandidate,
  type RiskTemplateConfig,
  type InstrumentSpecLite,
  type SizedCandidate,
} from "@/lib/engine/riskTemplate";

// Orchestrates ONE generation pass: run the active entry strategy over recent
// bars to find the most recent signal that still has at least one subsequent
// bar (so the simulated fill can resolve), then apply the risk template to size
// it. Pure — the server action handles DB + guardrails around this.

export interface GenerateInput {
  strategy: EntryStrategy;
  config: RiskTemplateConfig;
  instrument: InstrumentSpecLite;
  instrumentSymbol: string;
  bars: StrategyBar[]; // ascending by time, single timeframe
  accountSizeUsd: number | null;
}

export type GenerateResult =
  | {
      ok: true;
      signalBarTs: string;
      rationaleTag: string;
      candidate: SizedCandidate;
    }
  | { ok: false; reason: string };

export function generateCandidate(input: GenerateInput): GenerateResult {
  const { strategy, config, instrument, instrumentSymbol, bars, accountSizeUsd } = input;

  if (bars.length < 3) {
    return { ok: false, reason: "Not enough imported bars to run the strategy." };
  }

  // Walk backward from the second-to-last bar so a fill can resolve on the
  // bars that follow the signal. Take the most recent firing signal.
  for (let i = bars.length - 2; i >= 1; i--) {
    const context = bars.slice(0, i + 1);
    const signal = strategy.evaluate({ instrumentSymbol, bars: context });
    if (!signal) continue;

    const atrValue =
      config.stop_mode === "atr_multiple" ? atr(context, config.atr_period) : null;

    const sized = buildSizedCandidate(
      config,
      instrument,
      { direction: signal.direction, entry_price: signal.entry_price },
      accountSizeUsd,
      atrValue,
    );
    if (!sized.ok) {
      // Config-level rejection (RR floor, account too small, etc.) — same for
      // any signal, so report it rather than scanning on.
      return { ok: false, reason: sized.reason };
    }
    return {
      ok: true,
      signalBarTs: bars[i].ts,
      rationaleTag: signal.rationale_tag,
      candidate: sized.candidate,
    };
  }

  return { ok: false, reason: "No entry signal in the recent bars." };
}
