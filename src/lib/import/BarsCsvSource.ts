import Papa from "papaparse";

// OHLCV bar CSV parser. Mirrors CsvImportSource: runs CLIENT-SIDE in the
// trader's browser so wall-clock timestamps resolve in the trader's local
// timezone (never assumed UTC on Vercel), exactly like the executions importer.
// This is what keeps imported bars aligned with imported fills.

export interface ParsedBar {
  ts: string; // ISO timestamp
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface BarColumnMapping {
  // Either a single combined datetime column…
  timestamp?: string | null;
  // …or separate date + time columns (combined "MM/DD/YYYY HH:MM:SS").
  date?: string | null;
  time?: string | null;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string | null;
}

export interface BarsParseResult {
  rows: ParsedBar[];
  errors: { rowNumber: number; reason: string }[];
  detectedColumns: string[];
}

// Best-effort header auto-detection (case-insensitive). NinjaTrader and most
// charting exports use plain Open/High/Low/Close/Volume headers and either a
// single Time column or split Date/Time columns.
export function detectBarMapping(headers: string[]): BarColumnMapping {
  const find = (...names: string[]) =>
    headers.find((h) => names.some((n) => h.trim().toLowerCase() === n)) ?? null;

  const single = find("timestamp", "datetime", "date/time", "time");
  const date = find("date");
  const time = find("time");

  return {
    timestamp: single && !(date && time) ? single : null,
    date: !single ? date : date && time ? date : null,
    time: !single ? time : date && time ? time : null,
    open: find("open", "o") ?? "Open",
    high: find("high", "h") ?? "High",
    low: find("low", "l") ?? "Low",
    close: find("close", "last", "c") ?? "Close",
    volume: find("volume", "vol", "v"),
  };
}

export class BarsCsvSource {
  readonly label = "CSV (OHLCV bars)";

  parse(text: string, mapping?: BarColumnMapping): BarsParseResult {
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const detected = parsed.meta?.fields ?? [];
    const map = mapping ?? detectBarMapping(detected);

    const rows: ParsedBar[] = [];
    const errors: BarsParseResult["errors"] = [];

    parsed.data.forEach((row, i) => {
      const rowNumber = i + 2; // 1-based + header
      const ts = parseTimestamp(tsInput(row, map));
      if (!ts) {
        errors.push({ rowNumber, reason: "invalid or missing timestamp" });
        return;
      }
      const open = parseLooseNumber(row[map.open]);
      const high = parseLooseNumber(row[map.high]);
      const low = parseLooseNumber(row[map.low]);
      const close = parseLooseNumber(row[map.close]);
      const volume = map.volume ? parseLooseNumber(row[map.volume]) : null;

      if (high == null || low == null) {
        errors.push({ rowNumber, reason: "missing high/low (needed for MAE/MFE)" });
        return;
      }
      rows.push({ ts, open, high, low, close, volume });
    });

    return { rows, errors, detectedColumns: detected };
  }
}

function tsInput(row: Record<string, string>, map: BarColumnMapping): string {
  if (map.timestamp) return (row[map.timestamp] ?? "").trim();
  const d = map.date ? (row[map.date] ?? "").trim() : "";
  const t = map.time ? (row[map.time] ?? "").trim() : "";
  return `${d} ${t}`.trim();
}

// Same local-tz behavior as the executions importer: the JS Date constructor
// parses "MM/DD/YYYY HH:MM:SS" in the running environment's local timezone.
// Run in the browser, that's the trader's timezone. ISO inputs pass through.
function parseTimestamp(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// "1,234.50" / "$1,234.50" / "1234" → 1234.5. Returns null for unparsable.
function parseLooseNumber(input: string | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
