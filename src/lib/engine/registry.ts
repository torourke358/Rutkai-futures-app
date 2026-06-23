import type { EntryStrategy } from "@/lib/engine/strategy";
import { exampleMaCross } from "@/lib/engine/plugins/exampleMaCross";

// Explicit registry of available entry strategies. The owner adds their own
// implementation here (or licenses one and registers it). Ships with exactly
// one labeled placeholder so the pipeline runs for the demo.
const STRATEGIES: EntryStrategy[] = [exampleMaCross];

export function listStrategies(): EntryStrategy[] {
  return STRATEGIES;
}

export function getStrategy(id: string): EntryStrategy | null {
  return STRATEGIES.find((s) => s.id === id) ?? null;
}

export const DEFAULT_STRATEGY_ID = exampleMaCross.id;
