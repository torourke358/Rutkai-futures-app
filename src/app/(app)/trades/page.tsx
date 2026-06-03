import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatSignedUsd, pnlToneClass } from "@/lib/format";
import type { TradeRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("trades")
    .select()
    .order("exit_at", { ascending: false, nullsFirst: true })
    .limit(200)
    .returns<TradeRow[]>();

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Trades</h1>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
        {(rows ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            No trades yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <Th>Symbol</Th>
                <Th>Side</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Entry</Th>
                <Th className="text-right">Exit</Th>
                <Th className="text-right">P&amp;L</Th>
                <Th>Entry at</Th>
                <Th>Exit at</Th>
                <Th>Setup</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                  <Td className="font-semibold text-slate-100">{r.symbol}</Td>
                  <Td>{r.direction}</Td>
                  <Td className="text-right tabular-nums">{r.quantity}</Td>
                  <Td className="text-right tabular-nums">{r.entry_price}</Td>
                  <Td className="text-right tabular-nums">
                    {r.exit_price ?? "—"}
                  </Td>
                  <Td
                    className={`text-right tabular-nums ${pnlToneClass(r.realized_pnl)}`}
                  >
                    {formatSignedUsd(r.realized_pnl)}
                  </Td>
                  <Td className="text-slate-400">{formatDateTime(r.entry_at)}</Td>
                  <Td className="text-slate-400">{formatDateTime(r.exit_at)}</Td>
                  <Td className="text-slate-400">{r.setup_tag ?? "—"}</Td>
                  <Td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        r.status === "closed"
                          ? "bg-slate-500/20 text-slate-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {r.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Dense table + sortable columns + inline notes are wired in the next
        build pass.
      </p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
