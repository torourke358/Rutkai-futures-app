export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-semibold text-slate-100">Import</h1>
      <div className="rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--border)] space-y-3">
        <p className="text-sm text-slate-300">
          CSV import (NinjaTrader 8 Executions) is wired in the next build
          pass. The parser and FIFO pairing engine are already in place
          (<code className="rounded bg-[var(--surface-2)] px-1 text-xs">
            src/lib/import/CsvImportSource.ts
          </code>,{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 text-xs">
            src/lib/trades/pairing.ts
          </code>
          ).
        </p>
        <p className="text-xs text-slate-400">
          Export steps for users when this lands:
        </p>
        <ol className="ml-4 list-decimal text-xs text-slate-400 space-y-1">
          <li>Control Center → Trade Performance window</li>
          <li>Display dropdown → Executions</li>
          <li>Set the date range → Generate</li>
          <li>Right-click the grid → Export → save as CSV</li>
          <li>Drag the file here</li>
        </ol>
      </div>
    </div>
  );
}
