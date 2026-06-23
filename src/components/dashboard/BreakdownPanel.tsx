import type { SliceRow } from "@/lib/analytics/stats";
import { formatSignedUsd, formatPct, pnlToneClass } from "@/lib/format";

// A breakdown table for one axis (setup / instrument / day-of-week / hour).
// Each row shows trade count, win rate, avg R, expectancy, and net P&L with a
// magnitude bar so the eye finds the big winners/losers fast.
export default function BreakdownPanel({
  title,
  rows,
  labelHeader = "Group",
}: {
  title: string;
  rows: SliceRow[];
  labelHeader?: string;
}) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)));

  return (
    <section className="rounded-2xl bg-card p-4 border border-line shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">No data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted">
              <tr>
                <th className="py-1 text-left">{labelHeader}</th>
                <th className="py-1 text-right">Trades</th>
                <th className="py-1 text-right">Win%</th>
                <th className="py-1 text-right">Avg R</th>
                <th className="py-1 text-right">Expect.</th>
                <th className="py-1 text-right">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className="py-1.5 pr-2 font-medium text-ink">
                    {r.label}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted">
                    {r.count}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted">
                    {formatPct(r.winRate)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted">
                    {r.avgR == null ? "—" : `${r.avgR.toFixed(2)}R`}
                  </td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${pnlToneClass(r.expectancy)}`}
                  >
                    {formatSignedUsd(r.expectancy)}
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="hidden h-1.5 rounded-full sm:block"
                        style={{
                          width: `${(Math.abs(r.netPnl) / maxAbs) * 56}px`,
                          backgroundColor: r.netPnl >= 0 ? "#15a66a" : "#e0413e",
                        }}
                      />
                      <span
                        className={`tabular-nums ${pnlToneClass(r.netPnl)}`}
                      >
                        {formatSignedUsd(r.netPnl)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
