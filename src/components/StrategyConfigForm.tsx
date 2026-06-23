"use client";

import { useState } from "react";
import { saveStrategyConfig } from "@/app/(app)/strategy/actions";

export interface StrategyConfigValues {
  id: string | null;
  name: string;
  entry_plugin_id: string;
  risk_pct: number;
  account_size_usd: number | null;
  stop_mode: "fixed_points" | "atr_multiple";
  stop_value: number;
  atr_period: number;
  min_rr: number;
  target_r: number;
  daily_loss_limit_usd: number | null;
  max_trades_per_day: number | null;
  max_risk_per_trade_usd: number | null;
}

const field =
  "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent";
const fieldMono = `${field} font-mono tabular-nums`;

export default function StrategyConfigForm({
  config,
  plugins,
}: {
  config: StrategyConfigValues;
  plugins: { id: string; label: string; isExample: boolean }[];
}) {
  const [saved, setSaved] = useState(false);
  const [stopMode, setStopMode] = useState(config.stop_mode);

  return (
    <form
      action={async (fd) => {
        setSaved(false);
        await saveStrategyConfig(fd);
        setSaved(true);
      }}
      className="space-y-5"
    >
      {config.id && <input type="hidden" name="id" value={config.id} />}

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-ink">Strategy</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Name
            <input name="name" defaultValue={config.name} className={field} />
          </label>
          <label className="text-xs text-muted">
            Entry plugin
            <select name="entry_plugin_id" defaultValue={config.entry_plugin_id} className={field}>
              {plugins.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.isExample ? " (example)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          The entry plugin is a slot for your own logic. The shipped example is a
          plain MA crossover and is not a trading edge.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-ink">Risk &amp; sizing</h2>
        <p className="mt-1 text-[11px] text-muted">
          Standard, unattributed risk-management concepts.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted">
            Risk per trade (%)
            <input name="risk_pct" type="number" step="any" defaultValue={config.risk_pct} className={fieldMono} />
          </label>
          <label className="text-xs text-muted">
            Account size ($)
            <input
              name="account_size_usd"
              type="number"
              step="any"
              defaultValue={config.account_size_usd ?? ""}
              placeholder="blank → risk model"
              className={fieldMono}
            />
          </label>
          <label className="text-xs text-muted">
            Stop mode
            <select
              name="stop_mode"
              defaultValue={config.stop_mode}
              onChange={(e) => setStopMode(e.target.value as StrategyConfigValues["stop_mode"])}
              className={field}
            >
              <option value="fixed_points">Fixed points</option>
              <option value="atr_multiple">ATR multiple</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            {stopMode === "fixed_points" ? "Stop distance (pts)" : "Stop (× ATR)"}
            <input name="stop_value" type="number" step="any" defaultValue={config.stop_value} className={fieldMono} />
          </label>
          <label className="text-xs text-muted">
            ATR period
            <input name="atr_period" type="number" defaultValue={config.atr_period} className={fieldMono} />
          </label>
          <label className="text-xs text-muted">
            Target (R multiple)
            <input name="target_r" type="number" step="any" defaultValue={config.target_r} className={fieldMono} />
          </label>
          <label className="text-xs text-muted">
            Minimum R:R
            <input name="min_rr" type="number" step="any" defaultValue={config.min_rr} className={fieldMono} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-ink">Session guardrails</h2>
        <p className="mt-1 text-[11px] text-muted">Leave blank to disable a limit.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted">
            Daily loss limit ($)
            <input
              name="daily_loss_limit_usd"
              type="number"
              step="any"
              defaultValue={config.daily_loss_limit_usd ?? ""}
              className={fieldMono}
            />
          </label>
          <label className="text-xs text-muted">
            Max trades / day
            <input
              name="max_trades_per_day"
              type="number"
              defaultValue={config.max_trades_per_day ?? ""}
              className={fieldMono}
            />
          </label>
          <label className="text-xs text-muted">
            Max risk / trade ($)
            <input
              name="max_risk_per_trade_usd"
              type="number"
              step="any"
              defaultValue={config.max_risk_per_trade_usd ?? ""}
              className={fieldMono}
            />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
          Save strategy
        </button>
        {saved && <span className="text-xs text-gain">Saved ✓</span>}
      </div>
    </form>
  );
}
