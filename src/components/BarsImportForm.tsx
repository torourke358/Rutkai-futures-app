"use client";

import { useRef, useState } from "react";
import {
  BarsCsvSource,
  detectBarMapping,
  type BarColumnMapping,
  type ParsedBar,
} from "@/lib/import/BarsCsvSource";

// Import OHLCV bars for one instrument + timeframe. Parses CLIENT-SIDE (trader
// local tz) then posts the parsed bars to /api/bars/import for an idempotent
// upsert. Bars feed the MAE/MFE engine, the candlestick charts, and the
// simulated fills — never any live action.

type Stage = "choose" | "preview" | "done";

export default function BarsImportForm({ symbols }: { symbols: string[] }) {
  const [symbol, setSymbol] = useState(symbols[0] ?? "");
  const [timeframe, setTimeframe] = useState("1m");
  const [stage, setStage] = useState<Stage>("choose");
  const [rows, setRows] = useState<ParsedBar[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<BarColumnMapping | null>(null);
  const [parseErrors, setParseErrors] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ upserted: number; instrument: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setError(null);
    const text = await file.text();
    const source = new BarsCsvSource();
    const detected = detectBarMapping(
      text.split(/\r?\n/, 1)[0]?.split(",").map((h) => h.replace(/^"|"$/g, "")) ?? [],
    );
    const parsed = source.parse(text, detected);
    if (parsed.rows.length === 0) {
      setError(
        parsed.errors[0]?.reason
          ? `No usable bars. First issue: ${parsed.errors[0].reason}`
          : "No usable bars found in this file.",
      );
      return;
    }
    setHeaders(parsed.detectedColumns);
    setMapping(detected);
    setRows(parsed.rows);
    setParseErrors(parsed.errors.length);
    setStage("preview");
  }

  async function doImport() {
    if (!symbol.trim()) {
      setError("Pick an instrument symbol first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bars/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), timeframe, bars: rows }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail ?? json.error ?? "Import failed.");
        return;
      }
      setResult({ upserted: json.upserted, instrument: json.instrument });
      setStage("done");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("choose");
    setRows([]);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const first = rows[0]?.ts;
  const last = rows[rows.length - 1]?.ts;

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="font-display text-sm font-semibold text-ink">Import bar data</h2>
      <p className="mt-1 text-xs text-muted">
        OHLCV bars power the MAE/MFE analysis, charts, and simulated fills. One
        instrument and timeframe per file.
      </p>

      {stage === "choose" && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-muted">
              Instrument
              <input
                list="bars-symbols"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="NQ"
                className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 font-mono text-sm text-ink tabular-nums"
              />
              <datalist id="bars-symbols">
                {symbols.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="block text-xs font-medium text-muted">
              Timeframe
              <input
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                placeholder="1m"
                className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 font-mono text-sm text-ink"
              />
            </label>
          </div>

          <label
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted hover:border-accent"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
          >
            <span className="font-medium text-ink">Drop a CSV here</span>
            <span className="mt-1 text-xs">or click to choose a bar-data export</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
        </div>
      )}

      {stage === "preview" && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-line bg-surface p-3 text-sm text-ink">
            <p className="font-medium">
              {rows.length.toLocaleString()} bars parsed
              {parseErrors > 0 && (
                <span className="text-muted"> · {parseErrors} rows skipped</span>
              )}
            </p>
            <p className="mt-1 font-mono text-xs text-muted tabular-nums">
              {first ? new Date(first).toLocaleString() : "—"} →{" "}
              {last ? new Date(last).toLocaleString() : "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Detected columns: {headers.join(", ") || "—"}
            </p>
            {mapping && (
              <p className="mt-1 text-xs text-muted">
                Mapped O/H/L/C: {mapping.open} / {mapping.high} / {mapping.low} /{" "}
                {mapping.close}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doImport}
              disabled={busy}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Importing…" : `Import ${rows.length.toLocaleString()} bars`}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === "done" && result && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-line bg-surface p-3 text-sm text-ink">
            Imported {result.upserted.toLocaleString()} bars for{" "}
            <span className="font-mono">{result.instrument}</span>.
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink"
          >
            Import another file
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}
    </section>
  );
}
