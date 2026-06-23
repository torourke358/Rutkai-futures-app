import type { CalendarDay } from "@/lib/analytics/stats";
import { formatCompactUsd, formatSignedUsd } from "@/lib/format";

// CrossTrade-style monthly P&L calendar: weeks as rows, weekdays as columns,
// each traded day a soft green/red card with the day's net P&L + trade count,
// and a weekly total down the right side.
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Cell {
  key: string;
  inRange: boolean;
  day?: CalendarDay;
}

export default function PnlCalendar({ days }: { days: CalendarDay[] }) {
  if (days.length === 0)
    return (
      <div className="grid h-24 place-items-center text-sm text-muted">
        No trading days for the current filters.
      </div>
    );

  const byDate = new Map(days.map((d) => [d.date, d]));
  const sorted = [...days].map((d) => d.date).sort();
  const first = parseKey(sorted[0]);
  const last = parseKey(sorted[sorted.length - 1]);

  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back to Sunday
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay())); // forward to Saturday

  const weeks: Cell[][] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const key = fmtKey(cur);
      const d = parseKey(key);
      row.push({
        key,
        inRange: d.getTime() >= first.getTime() && d.getTime() <= last.getTime(),
        day: byDate.get(key),
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-8 gap-1.5 px-0.5 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          {WD.map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
          <div className="text-center">Week</div>
        </div>

        <div className="space-y-1.5">
          {weeks.map((row, ri) => {
            const weekTotal = row.reduce((s, c) => s + (c.day?.netPnl ?? 0), 0);
            const weekTrades = row.reduce((s, c) => s + (c.day?.tradeCount ?? 0), 0);
            return (
              <div key={ri} className="grid grid-cols-8 gap-1.5">
                {row.map((cell) => (
                  <DayCell key={cell.key} cell={cell} />
                ))}
                <div className="flex h-16 flex-col justify-center rounded-lg border border-line bg-surface px-1.5 text-center">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-muted">Total</span>
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      weekTotal > 0 ? "text-gain" : weekTotal < 0 ? "text-loss" : "text-muted"
                    }`}
                  >
                    {weekTrades ? formatCompactUsd(weekTotal) : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayCell({ cell }: { cell: Cell }) {
  const d = cell.day;
  const dom = Number(cell.key.slice(-2));

  if (!d) {
    return (
      <div
        className={`h-16 rounded-lg ${cell.inRange ? "border border-line bg-card" : "border border-transparent"}`}
        title={cell.key}
      >
        {cell.inRange && <span className="block px-1.5 pt-1 text-[9px] text-muted">{dom}</span>}
      </div>
    );
  }

  const color = d.netPnl > 0 ? "var(--gain)" : d.netPnl < 0 ? "var(--loss)" : "var(--muted)";
  return (
    <div
      className="flex h-16 flex-col rounded-lg border p-1.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, white)`,
        borderColor: `color-mix(in srgb, ${color} 28%, white)`,
      }}
      title={`${cell.key}: ${formatSignedUsd(d.netPnl)} · ${d.tradeCount} trade${d.tradeCount === 1 ? "" : "s"}`}
    >
      <span className="text-[9px] text-muted">{dom}</span>
      <span className="mt-auto block font-mono text-xs font-semibold tabular-nums" style={{ color }}>
        {formatCompactUsd(d.netPnl)}
      </span>
      <span className="block text-[9px] text-muted">
        {d.tradeCount} trade{d.tradeCount === 1 ? "" : "s"}
      </span>
    </div>
  );
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
