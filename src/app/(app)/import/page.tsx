import { createClient } from "@/lib/supabase/server";
import ImportWizard from "@/components/ImportWizard";
import BarsImportForm from "@/components/BarsImportForm";
import { formatDateTime } from "@/lib/format";
import type { CsvColumnMapping } from "@/lib/import/ImportSource";

export const dynamic = "force-dynamic";

interface BarSummary {
  symbol: string;
  timeframe: string;
  bar_count: number;
  first_ts: string;
  last_ts: string;
}

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedMapping: CsvColumnMapping | null = null;
  let symbols: string[] = ["NQ", "ES", "YM", "CL"];
  let marketData: BarSummary[] | null = null;
  let marketDataMissing = false;

  if (user) {
    const [{ data: mapData }, { data: instruments }, summary] = await Promise.all([
      supabase
        .from("import_mappings")
        .select("mapping")
        .eq("user_id", user.id)
        .maybeSingle<{ mapping: CsvColumnMapping }>(),
      supabase
        .from("instruments")
        .select("symbol")
        .eq("user_id", user.id)
        .order("symbol")
        .returns<{ symbol: string }[]>(),
      supabase.rpc("bars_summary"),
    ]);
    savedMapping = mapData?.mapping ?? null;
    if (instruments && instruments.length) symbols = instruments.map((i) => i.symbol);
    if (summary.error) marketDataMissing = true;
    else
      marketData = (summary.data ?? []).map((r: BarSummary) => ({
        ...r,
        bar_count: Number(r.bar_count),
      }));
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="font-display text-lg font-semibold text-ink">Import</h1>

      {/* Market-data overview — confirm bars landed on the right instrument. */}
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">Market data (imported bars)</h2>
        <p className="mb-3 text-xs text-muted">
          Bars on file per instrument and timeframe. Check the instrument matches
          your trades before relying on charts or the engine.
        </p>
        {marketDataMissing ? (
          <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
            Run migration <span className="font-mono">05_thor_market_data.sql</span> in
            Supabase to enable this summary.
          </p>
        ) : marketData && marketData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 text-left">Instrument</th>
                  <th className="py-1 text-left">Timeframe</th>
                  <th className="py-1 text-right">Bars</th>
                  <th className="py-1 text-left">First</th>
                  <th className="py-1 text-left">Last</th>
                </tr>
              </thead>
              <tbody>
                {marketData.map((r) => (
                  <tr key={`${r.symbol}-${r.timeframe}`} className="border-t border-line">
                    <td className="py-1.5 font-mono font-semibold text-ink">{r.symbol}</td>
                    <td className="py-1.5 font-mono text-muted">{r.timeframe}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink">
                      {r.bar_count.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-muted">{formatDateTime(r.first_ts)}</td>
                    <td className="py-1.5 text-muted">{formatDateTime(r.last_ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line bg-surface px-3 py-2 text-xs text-muted">
            No bars imported yet. Use &ldquo;Import bar data&rdquo; below.
          </p>
        )}
      </section>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Executions</h2>
        <ImportWizard savedMapping={savedMapping} />
      </div>

      <BarsImportForm symbols={symbols} />

      <details className="rounded-2xl border border-line bg-card p-4 text-xs text-muted">
        <summary className="cursor-pointer text-ink">
          How to export from NinjaTrader 8
        </summary>
        <ol className="ml-4 mt-2 list-decimal space-y-1">
          <li>Control Center → Trade Performance window</li>
          <li>Display dropdown → Executions</li>
          <li>Set the date range → Generate</li>
          <li>Right-click the grid → Export → save as CSV</li>
          <li>Drag the file into the box above</li>
        </ol>
        <p className="mt-2">
          For bars: export a chart&apos;s OHLCV data (or any CSV with date/time +
          open, high, low, close columns) and drop it into &ldquo;Import bar
          data&rdquo;.
        </p>
      </details>
    </div>
  );
}
