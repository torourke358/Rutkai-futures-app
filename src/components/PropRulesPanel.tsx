"use client";

import { useMemo, useState } from "react";
import {
  computePropRules,
  type PropTrade,
  type PropRules,
  type DrawdownType,
} from "@/lib/analysis/propRules";
import { formatSignedUsd, formatUsd } from "@/lib/format";

const field =
  "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent font-mono tabular-nums";

// Example rule sets — illustrative only; confirm the real numbers with your firm.
const PRESETS: Record<string, PropRules> = {
  "50K eval (example)": { startingBalance: 50000, dailyLossLimit: 1000, maxDrawdown: 2000, drawdownType: "trailing", consistencyPct: 50, maxContracts: 5, minTradingDays: 5 },
  "100K eval (example)": { startingBalance: 100000, dailyLossLimit: 2000, maxDrawdown: 3000, drawdownType: "trailing", consistencyPct: 50, maxContracts: 10, minTradingDays: 5 },
  "150K eval (example)": { startingBalance: 150000, dailyLossLimit: 3000, maxDrawdown: 4500, drawdownType: "trailing", consistencyPct: 50, maxContracts: 15, minTradingDays: 5 },
};

export default function PropRulesPanel({ trades }: { trades: PropTrade[] }) {
  const [rules, setRules] = useState<PropRules>(PRESETS["50K eval (example)"]);
  const set = <K extends keyof PropRules>(k: K, v: PropRules[K]) =>
    setRules((r) => ({ ...r, [k]: v }));

  const res = useMemo(() => computePropRules(trades, rules), [trades, rules]);

  return (
    <div className="space-y-4">
      {/* rule inputs */}
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-muted">
            Preset
            <select
              onChange={(e) => e.target.value && setRules(PRESETS[e.target.value])}
              defaultValue="50K eval (example)"
              className="mt-1 block rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent"
            >
              {Object.keys(PRESETS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[11px] text-muted">Presets are examples — set your firm&apos;s real numbers below.</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Starting balance ($)" value={rules.startingBalance} onChange={(v) => set("startingBalance", v ?? 50000)} />
          <Num label="Daily loss limit ($)" value={rules.dailyLossLimit} onChange={(v) => set("dailyLossLimit", v)} />
          <Num label="Max drawdown ($)" value={rules.maxDrawdown} onChange={(v) => set("maxDrawdown", v)} />
          <label className="text-xs font-medium text-muted">
            Drawdown type
            <select
              value={rules.drawdownType}
              onChange={(e) => set("drawdownType", e.target.value as DrawdownType)}
              className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent"
            >
              <option value="trailing">Trailing (from peak)</option>
              <option value="static">Static (from start)</option>
            </select>
          </label>
          <Num label="Consistency (% of profit)" value={rules.consistencyPct} onChange={(v) => set("consistencyPct", v)} />
          <Num label="Max contracts" value={rules.maxContracts} onChange={(v) => set("maxContracts", v)} />
          <Num label="Min trading days" value={rules.minTradingDays} onChange={(v) => set("minTradingDays", v)} />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Leave a field blank to skip that rule. Retrospective only — this describes where your
          history <em>would</em> have breached; it does not watch or block live trades.
        </p>
      </div>

      {/* verdict */}
      {res.firstBreach ? (
        <div className="rounded-2xl border border-loss/40 bg-loss/5 p-4 shadow-sm">
          <p className="font-display text-sm font-semibold text-loss">
            Account would have been failed on {res.firstBreach.date}
          </p>
          <p className="mt-1 text-sm text-ink">
            First breach: {res.firstBreach.detail}.
          </p>
          <p className="mt-1 text-xs text-muted">
            Equity at that point: {formatUsd(res.equityAtFirstBreach)}.
            {res.afterBreachPnl != null && Math.abs(res.afterBreachPnl) > 0 && (
              <>
                {" "}You booked {formatSignedUsd(res.afterBreachPnl)} after that date — it
                wouldn&apos;t have counted.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gain/40 bg-gain/5 p-4 shadow-sm">
          <p className="font-display text-sm font-semibold text-gain">
            No rule breach across {res.tradingDays} day{res.tradingDays === 1 ? "" : "s"} ({trades.length} trades)
          </p>
          <p className="mt-1 text-xs text-muted">
            Net P&amp;L {formatSignedUsd(res.netProfit)}. Your history stays within these rules.
          </p>
        </div>
      )}

      {/* rule-by-rule status */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Status
          title="Daily loss"
          ok={res.dailyLossBreaches.length === 0}
          detail={
            rules.dailyLossLimit == null
              ? "off"
              : res.dailyLossBreaches.length === 0
                ? "no breach days"
                : `${res.dailyLossBreaches.length} breach day${res.dailyLossBreaches.length === 1 ? "" : "s"}`
          }
        />
        <Status
          title={`Drawdown (${rules.drawdownType})`}
          ok={!res.drawdown.breached}
          detail={
            rules.maxDrawdown == null
              ? "off"
              : `worst ${formatUsd(res.drawdown.maxObservedDD)} / ${formatUsd(rules.maxDrawdown)}`
          }
        />
        <Status
          title="Consistency"
          ok={!res.consistency.violated}
          detail={
            rules.consistencyPct == null || res.consistency.ratio == null
              ? "off"
              : `best day ${Math.round(res.consistency.ratio * 100)}% / ${rules.consistencyPct}%`
          }
        />
        <Status
          title="Position size"
          ok={res.oversized.count === 0}
          detail={
            rules.maxContracts == null
              ? "off"
              : res.oversized.count === 0
                ? `max ${res.oversized.maxQty} ≤ ${rules.maxContracts}`
                : `${res.oversized.count} oversized`
          }
        />
      </div>

      {/* daily-loss breach days */}
      {res.dailyLossBreaches.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-ink">Days that would have breached the daily loss limit</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 text-left">Date</th>
                  <th className="py-1 text-right">Worst intraday</th>
                  <th className="py-1 text-right">Day net</th>
                </tr>
              </thead>
              <tbody>
                {res.dailyLossBreaches.map((d) => (
                  <tr key={d.date} className="border-t border-line">
                    <td className="py-1.5 text-ink">{d.date}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-loss">{formatSignedUsd(d.worstIntraday)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-ink">{formatSignedUsd(d.dayPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="text-xs font-medium text-muted">
      {label}
      <input
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.trim() === "" ? null : Number(e.target.value))}
        className={field}
      />
    </label>
  );
}

function Status({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  const off = detail === "off";
  return (
    <div className="rounded-2xl border border-line bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: off ? "var(--muted)" : ok ? "var(--gain)" : "var(--loss)" }}
        />
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{title}</p>
      </div>
      <p className={`mt-1 text-sm font-semibold ${off ? "text-muted" : ok ? "text-gain" : "text-loss"}`}>
        {off ? "off" : ok ? "pass" : "breach"}
      </p>
      {!off && <p className="mt-0.5 font-mono text-[10px] text-muted tabular-nums">{detail}</p>}
    </div>
  );
}
