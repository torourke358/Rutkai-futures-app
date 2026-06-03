import type { Execution } from "@/lib/trades/pairing";

// Generic ingest contract. Phase 1 has one implementation (CsvImportSource).
// A future BrokerApiImportSource (Alpaca / IBKR / Tradovate) drops in here
// without touching the rest of the app.
export interface ParsedExecution extends Omit<Execution, "id"> {
  raw: Record<string, unknown>;
}

export interface ImportSource {
  // A short label shown in the UI for which source produced these execs.
  readonly label: string;
  // Parse a raw payload (the contents of a CSV, or API response) and return
  // a list of ParsedExecution rows ready for the pairing engine. Throw on
  // parse-level errors; row-level errors should be returned in the result.
  parse(input: ImportInput): Promise<ImportResult>;
}

export type ImportInput =
  | { kind: "csv"; text: string; mapping?: CsvColumnMapping }
  | { kind: "broker_api"; payload: unknown };

export interface ImportResult {
  rows: ParsedExecution[];
  errors: { rowNumber: number; reason: string; raw: Record<string, unknown> }[];
  detectedColumns?: string[];
}

// Maps source column header → execution field. Persisted per user in
// import_mappings so the next CSV from the same broker imports zero-click.
export interface CsvColumnMapping {
  symbol: string;
  side: string;
  quantity: string;
  price: string;
  executed_at: string;
  fees?: string | null;
}
