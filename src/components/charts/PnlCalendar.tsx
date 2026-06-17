import type { CalendarDay } from "@/lib/analytics/stats";
import { formatSignedUsd } from "@/lib/format";

// GitHub-contributions-style heatmap: one cell per calendar day, columns are
// weeks, rows are weekdays (Sun→Sat). Green = profitable day, red = losing.
export default function PnlCalendar({ days }: { days: CalendarDay[] }) {
  if (days.length === 0)
    return (
      <div className="grid h-24 place-items-center text-sm text-slate-500">
        No trading days for the current filters.
      </div>
    );

  const byDate = new Map(days.map((d) => [d.date, d]));
  const sorted = [...days].map((d) => d.date).sort();
  const first = parseKey(sorted[0]);
  const last = parseKey(sorted[sorted.length - 1]);
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.netPnl)), 1);

  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back up to Sunday

  const weeks: { key: string; day?: CalendarDay }[][] = [];
  const cur = new Date(start);
  while (cur <= last) {
    const col: { key: string; day?: CalendarDay }[] = [];
    for (let i = 0; i < 7; i++) {
      const key = fmtKey(cur);
      col.push({ key, day: byDate.get(key) });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(col);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {col.map((cell) => (
              <div
                key={cell.key}
                title={
                  cell.day
                    ? `${cell.key}: ${formatSignedUsd(cell.day.netPnl)} · ${cell.day.tradeCount} trade${cell.day.tradeCount === 1 ? "" : "s"}`
                    : cell.key
                }
                className="h-3.5 w-3.5 rounded-sm"
                style={{ backgroundColor: cellColor(cell.day, maxAbs) }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(248,113,113,0.85)" }} />
          loss
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "#1a2440" }} />
          no trades
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(52,211,153,0.85)" }} />
          profit
        </span>
      </div>
    </div>
  );
}

function cellColor(day: CalendarDay | undefined, maxAbs: number): string {
  if (!day || day.tradeCount === 0) return "#1a2440";
  if (day.netPnl === 0) return "#334155";
  const intensity = 0.25 + 0.75 * Math.min(Math.abs(day.netPnl) / maxAbs, 1);
  return day.netPnl > 0
    ? `rgba(52,211,153,${intensity.toFixed(2)})`
    : `rgba(248,113,113,${intensity.toFixed(2)})`;
}

function parseKey(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
function fmtKey(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
