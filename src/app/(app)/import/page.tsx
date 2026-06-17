import { createClient } from "@/lib/supabase/server";
import ImportWizard from "@/components/ImportWizard";
import type { CsvColumnMapping } from "@/lib/import/ImportSource";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedMapping: CsvColumnMapping | null = null;
  if (user) {
    const { data } = await supabase
      .from("import_mappings")
      .select("mapping")
      .eq("user_id", user.id)
      .maybeSingle<{ mapping: CsvColumnMapping }>();
    savedMapping = data?.mapping ?? null;
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-semibold text-slate-100">Import</h1>
      <ImportWizard savedMapping={savedMapping} />

      <details className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)] text-xs text-slate-400">
        <summary className="cursor-pointer text-slate-300">
          How to export from NinjaTrader 8
        </summary>
        <ol className="ml-4 mt-2 list-decimal space-y-1">
          <li>Control Center → Trade Performance window</li>
          <li>Display dropdown → Executions</li>
          <li>Set the date range → Generate</li>
          <li>Right-click the grid → Export → save as CSV</li>
          <li>Drag the file into the box above</li>
        </ol>
      </details>
    </div>
  );
}
