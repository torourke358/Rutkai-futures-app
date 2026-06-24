import Papa from "papaparse";
import { parseSide } from "@/lib/import/detect";
import type {
  CsvColumnMapping,
  ImportInput,
  ImportResult,
  ImportSource,
  ParsedExecution,
} from "@/lib/import/ImportSource";

// NinjaTrader 8 "Executions" export defaults. The mapping UI pre-selects
// these so a stock NT8 export imports with zero clicks.
export const NT8_DEFAULT_MAPPING: CsvColumnMapping = {
  symbol: "Instrument",
  side: "Action",
  quantity: "Quantity",
  price: "Price",
  executed_at: "Time",
  fees: "Commission",
};

export class CsvImportSource implements ImportSource {
  readonly label = "CSV (NinjaTrader 8 Executions)";

  async parse(input: ImportInput): Promise<ImportResult> {
    if (input.kind !== "csv") {
      throw new Error("CsvImportSource only accepts kind='csv'");
    }
    const parsed = Papa.parse<Record<string, string>>(input.text, {
      header: true,
      skipEmptyLines: true,
    });

    const mapping = input.mapping ?? NT8_DEFAULT_MAPPING;
    const detected = parsed.meta?.fields ?? [];
    const rows: ParsedExecution[] = [];
    const errors: ImportResult["errors"] = [];

    parsed.data.forEach((row, i) => {
      const rowNumber = i + 2; // 1-based, +1 for header row
      const symbol = (row[mapping.symbol] ?? "").trim();
      const sideRaw = (row[mapping.side] ?? "").trim().toLowerCase();
      const quantity = parseLooseNumber(row[mapping.quantity]);
      const price = parseLooseNumber(row[mapping.price]);
      const fees = mapping.fees ? parseLooseNumber(row[mapping.fees]) ?? 0 : 0;
      const timeRaw = (row[mapping.executed_at] ?? "").trim();
      const executed_at = parseTimestamp(timeRaw);

      if (!symbol) {
        errors.push({ rowNumber, reason: "empty symbol", raw: row });
        return;
      }
      const side = parseSide(sideRaw);
      if (!side) {
        errors.push({ rowNumber, reason: `unknown side "${sideRaw}"`, raw: row });
        return;
      }
      if (quantity == null || quantity <= 0) {
        errors.push({ rowNumber, reason: "invalid quantity", raw: row });
        return;
      }
      if (price == null || price < 0) {
        errors.push({ rowNumber, reason: "invalid price", raw: row });
        return;
      }
      if (!executed_at) {
        errors.push({ rowNumber, reason: "invalid timestamp", raw: row });
        return;
      }

      rows.push({
        symbol,
        side,
        quantity,
        price,
        fees: fees ?? 0,
        executed_at,
        raw: row,
      });
    });

    return { rows, errors, detectedColumns: detected };
  }
}

// "1,234.50" / "$1,234.50" / "1234" → 1234.5. Returns null for unparsable.
function parseLooseNumber(input: string | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// NinjaTrader 8 commonly exports timestamps like "12/31/2025 09:30:15" — the
// JS Date constructor parses this but assumes the user's local TZ. We accept
// that for now (yacht / trader timestamps are local to the trader); ISO 8601
// inputs pass through unchanged. Returns null on unparsable input.
function parseTimestamp(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
