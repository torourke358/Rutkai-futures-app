"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CsvImportSource,
  NT8_DEFAULT_MAPPING,
} from "@/lib/import/CsvImportSource";
import type {
  CsvColumnMapping,
  ImportResult,
} from "@/lib/import/ImportSource";

const FIELDS: { key: keyof CsvColumnMapping; label: string; optional?: boolean }[] =
  [
    { key: "symbol", label: "Symbol" },
    { key: "side", label: "Side / Action" },
    { key: "quantity", label: "Quantity" },
    { key: "price", label: "Price" },
    { key: "executed_at", label: "Time" },
    { key: "fees", label: "Commission / Fees", optional: true },
  ];

interface ImportSummary {
  batch: string;
  executions: number;
  closed: number;
  open: number;
  deleted: number;
}

export default function ImportWizard({
  savedMapping,
}: {
  savedMapping: CsvColumnMapping | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping>(
    savedMapping ?? NT8_DEFAULT_MAPPING,
  );
  const [result, setResult] = useState<ImportResult | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "parsing" | "uploading" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const parse = useCallback(async (csv: string, map: CsvColumnMapping) => {
    setPhase("parsing");
    try {
      const out = await new CsvImportSource().parse({
        kind: "csv",
        text: csv,
        mapping: map,
      });
      setResult(out);
      setPhase("idle");
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }, []);

  async function onFile(file: File) {
    const csv = await file.text();
    setFileName(file.name);
    setText(csv);
    setSummary(null);
    await parse(csv, mapping);
  }

  function updateMapping(key: keyof CsvColumnMapping, value: string) {
    const next = { ...mapping, [key]: value === "" ? null : value };
    setMapping(next);
    if (text) void parse(text, next);
  }

  async function confirmImport() {
    if (!result) return;
    setPhase("uploading");
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: result.rows, mapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Import failed");
      setSummary(data as ImportSummary);
      setPhase("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  async function undo() {
    if (!summary) return;
    setPhase("uploading");
    try {
      const res = await fetch("/api/import/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batch: summary.batch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Undo failed");
      setSummary(null);
      setResult(null);
      setText(null);
      setFileName(null);
      setPhase("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  const detected = result?.detectedColumns ?? [];
  const validCount = result?.rows.length ?? 0;
  const errorCount = result?.errors.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
        onClick={() => fileInput.current?.click()}
        className="cursor-pointer rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center hover:border-indigo-400/50"
      >
        <p className="text-sm text-slate-300">
          {fileName ? (
            <span className="font-medium text-slate-100">{fileName}</span>
          ) : (
            "Drag a NinjaTrader 8 Executions CSV here, or click to choose"
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {fileName ? "Click to choose a different file" : ".csv exported from the Trade Performance window"}
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300 ring-1 ring-rose-500/30">
          {error}
        </div>
      )}

      {/* Column mapping */}
      {result && phase !== "done" && (
        <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)] space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">Column mapping</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="block text-xs text-slate-400">
                {f.label}
                {f.optional && <span className="text-slate-600"> (optional)</span>}
                <select
                  value={(mapping[f.key] as string) ?? ""}
                  onChange={(e) => updateMapping(f.key, e.target.value)}
                  className="mt-1 w-full rounded-lg bg-[var(--surface-2)] px-2 py-1.5 text-slate-100 ring-1 ring-[var(--border)]"
                >
                  {f.optional && <option value="">— none —</option>}
                  {detected.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {/* keep an unknown saved value selectable */}
                  {mapping[f.key] &&
                    !detected.includes(mapping[f.key] as string) && (
                      <option value={mapping[f.key] as string}>
                        {mapping[f.key]} (not in file)
                      </option>
                    )}
                </select>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
              {validCount} valid rows
            </span>
            {errorCount > 0 && (
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">
                {errorCount} skipped
              </span>
            )}
          </div>
        </section>
      )}

      {/* Preview */}
      {result && validCount > 0 && phase !== "done" && (
        <section className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-2)] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">Side</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Fees</th>
                  <th className="px-3 py-2 text-left">Executed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {result.rows.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-medium text-slate-100">{r.symbol}</td>
                    <td className="px-3 py-1.5">{r.side}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.quantity}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.price}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.fees}</td>
                    <td className="px-3 py-1.5 text-slate-400">
                      {new Date(r.executed_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {validCount > 25 && (
            <p className="px-3 py-2 text-xs text-slate-500">
              …and {validCount - 25} more rows
            </p>
          )}
        </section>
      )}

      {/* Error rows */}
      {result && errorCount > 0 && phase !== "done" && (
        <details className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <summary className="cursor-pointer text-sm text-slate-300">
            {errorCount} skipped rows
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {result.errors.slice(0, 50).map((e, i) => (
              <li key={i}>
                Row {e.rowNumber}: {e.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Confirm */}
      {result && validCount > 0 && phase !== "done" && (
        <button
          type="button"
          onClick={confirmImport}
          disabled={phase === "uploading"}
          className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
        >
          {phase === "uploading"
            ? "Importing…"
            : `Import ${validCount} executions`}
        </button>
      )}

      {/* Done */}
      {phase === "done" && summary && (
        <section className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/30 space-y-3">
          <p className="text-sm text-emerald-200">
            Imported {summary.executions} executions → {summary.closed} closed
            trades, {summary.open} open.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              View dashboard
            </button>
            <button
              type="button"
              onClick={undo}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-rose-300"
            >
              Undo this import
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
