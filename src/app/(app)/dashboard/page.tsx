import { createClient } from "@/lib/supabase/server";
import {
  computeStats,
  computeEquityCurve,
  computeCalendar,
  type TradeForStats,
} from "@/lib/analytics/stats";
import { formatSignedUsd, formatUsd, pnlToneClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: closed } = await supabase
    .from("trades")
    .select(
      "symbol, direction, quantity, realized_pnl, fees, entry_at, exit_at, setup_tag",
    )
    .eq("status", "closed")
    .order("exit_at", { ascending: false });

  const trades: TradeForStats[] = (closed ?? []).map((t) => ({
    symbol: t.symbol,
    direction: t.direction,
    quantity: t.quantity,
    realized_pnl: t.realized_pnl ?? 0,
    fees: t.fees ?? 0,
    entry_at: t.entry_at,
    exit_at: t.exit_at as string,
    setup_tag: t.setup_tag,
  }));

  const stats = computeStats(trades);
  const equity = computeEquityCurve(trades);
  const calendar = computeCalendar(trades);

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-lg font-semibold text-slate-100">Dashboard</h1>

      {trades.length === 0 ? (
        <div className="rounded-2xl bg-[var(--surface)] p-6 text-center text-sm text-slate-400 ring-1 ring-[var(--border)]">
          No closed trades yet. Import a NinjaTrader Executions CSV on the
          Import tab to get started.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Net P&L"
              value={formatSignedUsd(stats.netPnl)}
              tone={pnlToneClass(stats.netPnl)}
            />
            <StatCard
              label="Win rate"
              value={`${Math.round(stats.winRate * 100)}%`}
              tone="text-slate-100"
            />
            <StatCard
              label="Profit factor"
              value={stats.profitFactor == null ? "∞" : stats.profitFactor.toFixed(2)}
              tone="text-slate-100"
            />
            <StatCard
              label="Expectancy"
              value={formatSignedUsd(stats.expectancy)}
              tone={pnlToneClass(stats.expectancy)}
            />
            <StatCard
              label="Avg win"
              value={formatUsd(stats.avgWin)}
              tone="text-emerald-300"
            />
            <StatCard
              label="Avg loss"
              value={formatUsd(stats.avgLoss)}
              tone="text-rose-300"
            />
            <StatCard
              label="Max drawdown"
              value={formatUsd(stats.maxDrawdown)}
              tone="text-rose-300"
            />
            <StatCard
              label="Total fees"
              value={formatUsd(stats.fees)}
              tone="text-slate-400"
            />
          </div>

          <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
            <h2 className="text-sm font-semibold text-slate-100">Equity curve</h2>
            <p className="mt-1 text-xs text-slate-400">
              {equity.length} closed trades · chart rendering wired in the next
              build pass (recharts).
            </p>
          </section>

          <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
            <h2 className="text-sm font-semibold text-slate-100">P&amp;L calendar</h2>
            <p className="mt-1 text-xs text-slate-400">
              {calendar.length} trading days · heatmap rendering wired in the
              next build pass.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
    </div>
  );
}
