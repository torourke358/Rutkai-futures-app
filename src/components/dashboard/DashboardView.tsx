"use client";

import { useMemo, useState } from "react";
import {
  computeStats,
  computeEquityCurve,
  computeDrawdownCurve,
  computeCalendar,
  computeRDistribution,
  sliceStats,
  sliceByDayOfWeek,
  sliceByHourOfDay,
  type TradeForStats,
} from "@/lib/analytics/stats";
import {
  formatSignedUsd,
  formatUsd,
  formatPct,
  pnlToneClass,
} from "@/lib/format";
import EquityCurve from "@/components/charts/EquityCurve";
import DrawdownCurve from "@/components/charts/DrawdownCurve";
import RDistribution from "@/components/charts/RDistribution";
import PnlCalendar from "@/components/charts/PnlCalendar";
import BreakdownPanel from "@/components/dashboard/BreakdownPanel";

interface Filters {
  from: string;
  to: string;
  symbol: string;
  setup: string;
  direction: string;
}

const EMPTY: Filters = {
  from: "",
  to: "",
  symbol: "",
  setup: "",
  direction: "",
};

export default function DashboardView({
  trades,
}: {
  trades: TradeForStats[];
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const symbols = useMemo(
    () => [...new Set(trades.map((t) => t.symbol))].sort(),
    [trades],
  );
  const setups = useMemo(
    () =>
      [...new Set(trades.map((t) => t.setup_tag).filter(Boolean))].sort() as string[],
    [trades],
  );

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      const day = localDateKey(t.exit_at);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      if (filters.symbol && t.symbol !== filters.symbol) return false;
      if (filters.setup && (t.setup_tag ?? "") !== filters.setup) return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      return true;
    });
  }, [trades, filters]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const equity = useMemo(() => computeEquityCurve(filtered), [filtered]);
  const drawdown = useMemo(() => computeDrawdownCurve(filtered), [filtered]);
  const calendar = useMemo(() => computeCalendar(filtered), [filtered]);
  const rdist = useMemo(() => computeRDistribution(filtered), [filtered]);
  const bySetup = useMemo(
    () => sliceStats(filtered, (t) => [t.setup_tag ?? "(unset)"]),
    [filtered],
  );
  const bySymbol = useMemo(
    () => sliceStats(filtered, (t) => [t.symbol]),
    [filtered],
  );
  const byDow = useMemo(() => sliceByDayOfWeek(filtered), [filtered]);
  const byHour = useMemo(() => sliceByHourOfDay(filtered), [filtered]);

  const cards: { label: string; value: string; tone?: string }[] = [
    { label: "Net P&L", value: formatSignedUsd(stats.netPnl), tone: pnlToneClass(stats.netPnl) },
    { label: "Win rate", value: formatPct(stats.winRate) },
    { label: "Profit factor", value: stats.profitFactor == null ? "∞" : stats.profitFactor.toFixed(2) },
    { label: "Expectancy", value: formatSignedUsd(stats.expectancy), tone: pnlToneClass(stats.expectancy) },
    { label: "Expectancy (R)", value: stats.avgR == null ? "—" : `${stats.avgR.toFixed(2)}R`, tone: stats.avgR == null ? undefined : pnlToneClass(stats.avgR) },
    { label: "Avg win", value: formatUsd(stats.avgWin), tone: "text-emerald-300" },
    { label: "Avg loss", value: formatUsd(stats.avgLoss), tone: "text-rose-300" },
    { label: "Payoff ratio", value: stats.payoffRatio == null ? "—" : stats.payoffRatio.toFixed(2) },
    { label: "Max drawdown", value: formatUsd(stats.maxDrawdown), tone: "text-rose-300" },
    { label: "Largest win", value: formatUsd(stats.largestWin), tone: "text-emerald-300" },
    { label: "Largest loss", value: formatUsd(Math.abs(stats.largestLoss)), tone: "text-rose-300" },
    { label: "Win streak", value: `${stats.maxConsecWins}` },
    { label: "Loss streak", value: `${stats.maxConsecLosses}` },
    { label: "Trades", value: `${stats.wins + stats.losses + stats.breakEvens}` },
    { label: "Win / loss days", value: `${stats.winningDays} / ${stats.losingDays}` },
    { label: "Total fees", value: formatUsd(stats.fees), tone: "text-slate-400" },
  ];

  const hasFilters =
    filters.from || filters.to || filters.symbol || filters.setup || filters.direction;

  return (
    <div className="space-y-5 pb-8">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
        <FilterDate
          label="From"
          value={filters.from}
          onChange={(v) => setFilters((f) => ({ ...f, from: v }))}
        />
        <FilterDate
          label="To"
          value={filters.to}
          onChange={(v) => setFilters((f) => ({ ...f, to: v }))}
        />
        <FilterSelect
          label="Symbol"
          value={filters.symbol}
          onChange={(v) => setFilters((f) => ({ ...f, symbol: v }))}
          options={symbols}
        />
        <FilterSelect
          label="Setup"
          value={filters.setup}
          onChange={(v) => setFilters((f) => ({ ...f, setup: v }))}
          options={setups}
        />
        <FilterSelect
          label="Direction"
          value={filters.direction}
          onChange={(v) => setFilters((f) => ({ ...f, direction: v }))}
          options={["long", "short"]}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY)}
            className="ml-auto rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-100"
          >
            Reset
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {c.label}
            </p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${c.tone ?? "text-slate-100"}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Equity + drawdown */}
      <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
        <h2 className="mb-2 text-sm font-semibold text-slate-100">Equity curve</h2>
        <EquityCurve data={equity} />
        <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-100">Drawdown</h2>
        <DrawdownCurve data={drawdown} />
      </section>

      {/* R distribution + calendar */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">
            R-multiple distribution
          </h2>
          <RDistribution data={rdist} />
        </section>
        <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">
            P&amp;L calendar
          </h2>
          <PnlCalendar days={calendar} />
        </section>
      </div>

      {/* Breakdowns */}
      <div className="grid gap-3 lg:grid-cols-2">
        <BreakdownPanel title="By setup" rows={bySetup} labelHeader="Setup" />
        <BreakdownPanel title="By instrument" rows={bySymbol} labelHeader="Symbol" />
        <BreakdownPanel title="By day of week" rows={byDow} labelHeader="Day" />
        <BreakdownPanel title="By hour of day" rows={byHour} labelHeader="Hour" />
      </div>
    </div>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-[10px] uppercase tracking-wide text-slate-500">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block rounded-lg bg-[var(--surface-2)] px-2 py-1.5 text-sm text-slate-100 ring-1 ring-[var(--border)]"
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="text-[10px] uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block rounded-lg bg-[var(--surface-2)] px-2 py-1.5 text-sm text-slate-100 ring-1 ring-[var(--border)]"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
