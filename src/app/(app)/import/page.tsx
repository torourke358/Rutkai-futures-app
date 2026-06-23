import { createClient } from "@/lib/supabase/server";
import ImportWizard from "@/components/ImportWizard";
import BarsImportForm from "@/components/BarsImportForm";
import type { CsvColumnMapping } from "@/lib/import/ImportSource";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedMapping: CsvColumnMapping | null = null;
  let symbols: string[] = ["NQ", "ES", "YM", "CL"];
  if (user) {
    const [{ data: mapData }, { data: instruments }] = await Promise.all([
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
    ]);
    savedMapping = mapData?.mapping ?? null;
    if (instruments && instruments.length) symbols = instruments.map((i) => i.symbol);
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="font-display text-lg font-semibold text-ink">Import</h1>

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
