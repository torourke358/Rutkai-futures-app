// Resolve futures point multipliers for raw execution symbols.
//
// NinjaTrader exports symbols with contract-month suffixes — "ES 03-25",
// "ESH5", "MNQM25" — while instrument_specs is keyed by the root ("ES",
// "MNQ"). We match each raw symbol to a known root by:
//   1. exact match,
//   2. the token before the first space (handles "ES 03-25"),
//   3. longest-prefix match against known roots (handles "ESH5", "MNQM25"
//      and digit-bearing roots like "M2K" — longest root wins so "MES…"
//      never collapses to a shorter root).
// Unknown symbols fall back to 1× (P&L stays in price units until an admin
// adds a spec). Pure — no DB access; callers pass the spec list in.

export interface InstrumentSpec {
  symbol: string;
  point_value: number;
}

export function resolveMultipliers(
  rawSymbols: string[],
  specs: InstrumentSpec[],
): Map<string, number> {
  // Longest root first so prefix matching prefers "MES" over "ES", etc.
  const rootsByLen = [...specs].sort(
    (a, b) => b.symbol.length - a.symbol.length,
  );
  const map = new Map<string, number>();
  for (const raw of rawSymbols) {
    map.set(raw, resolveOne(raw, rootsByLen));
  }
  return map;
}

function resolveOne(raw: string, rootsByLen: InstrumentSpec[]): number {
  const upper = raw.trim().toUpperCase();
  const token = upper.split(/\s+/)[0];

  for (const candidate of [upper, token]) {
    const exact = rootsByLen.find((r) => r.symbol.toUpperCase() === candidate);
    if (exact) return exact.point_value;
  }
  const prefix = rootsByLen.find((r) =>
    token.startsWith(r.symbol.toUpperCase()),
  );
  return prefix ? prefix.point_value : 1;
}
