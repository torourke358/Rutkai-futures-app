import type { CsvColumnMapping } from "@/lib/import/ImportSource";

// Broker-agnostic format detection for trade/execution CSV exports. Given the
// header row, it guesses which column is which (symbol / side / qty / price /
// time / fees) by matching against common header names across NinjaTrader,
// Tradovate, and generic broker exports — so a user can drop almost any fills
// export and have it auto-map. Pure + dependency-free (type-only import).

const CANDIDATES: Record<keyof Omit<CsvColumnMapping, "fees">, string[]> & { fees: string[] } = {
  symbol: ["instrument", "symbol", "contract", "ticker", "market", "sym"],
  side: ["action", "side", "b/s", "buy/sell", "direction", "type", "b / s"],
  quantity: ["quantity", "qty", "filled qty", "fillqty", "size", "contracts", "amount", "filled"],
  price: ["price", "fill price", "avg price", "average price", "exec price", "filled price", "avgprice"],
  executed_at: [
    "time",
    "fill time",
    "timestamp",
    "datetime",
    "date/time",
    "exec time",
    "execution time",
    "filled time",
    "date",
  ],
  fees: ["commission", "fees", "fee", "comm", "commissions"],
};

export interface DetectedFormat {
  mapping: CsvColumnMapping;
  broker: string;
  complete: boolean; // all required (non-fee) fields were matched
}

export function detectExecutionMapping(headers: string[]): DetectedFormat {
  const norm = headers.map((h) => ({ raw: h, low: h.trim().toLowerCase() }));
  const pick = (cands: string[]): string | null => {
    for (const c of cands) {
      const exact = norm.find((h) => h.low === c);
      if (exact) return exact.raw;
    }
    for (const c of cands) {
      const part = norm.find((h) => h.low.includes(c));
      if (part) return part.raw;
    }
    return null;
  };

  const mapping: CsvColumnMapping = {
    symbol: pick(CANDIDATES.symbol) ?? "",
    side: pick(CANDIDATES.side) ?? "",
    quantity: pick(CANDIDATES.quantity) ?? "",
    price: pick(CANDIDATES.price) ?? "",
    executed_at: pick(CANDIDATES.executed_at) ?? "",
    fees: pick(CANDIDATES.fees),
  };

  const low = norm.map((h) => h.low);
  let broker = "Generic CSV";
  if (low.includes("instrument") && low.includes("action")) broker = "NinjaTrader 8";
  else if (low.some((h) => h.includes("contract") || h.includes("fill time")) || low.includes("b/s"))
    broker = "Tradovate";

  const complete = Boolean(
    mapping.symbol && mapping.side && mapping.quantity && mapping.price && mapping.executed_at,
  );
  return { mapping, broker, complete };
}

// Normalize a side/action cell to buy/sell across broker conventions:
// Buy/Sell, B/S, BOT/SLD, Long/Short. Returns null if unrecognized.
export function parseSide(raw: string): "buy" | "sell" | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("buy") || s.startsWith("bot") || s.startsWith("long") || s === "b") return "buy";
  if (s.startsWith("sell") || s.startsWith("sld") || s.startsWith("short") || s === "s") return "sell";
  return null;
}
