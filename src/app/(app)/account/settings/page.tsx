import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatUsd, formatDate } from "@/lib/format";
import type { RiskSettings } from "@/lib/risk";
import RiskSettingsForm from "@/components/RiskSettingsForm";
import { addCashFlow, deleteCashFlow, saveInstrumentSpec } from "./actions";

export const dynamic = "force-dynamic";

interface CashFlowRow {
  id: string;
  amount: number;
  occurred_at: string;
  note: string | null;
}
interface SpecRow {
  symbol: string;
  point_value: number;
  description: string | null;
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: settings }, { data: flows }, { data: specs }, role] =
    await Promise.all([
      supabase
        .from("risk_settings")
        .select(
          "method, default_risk_dollars, account_balance, risk_percent, starting_balance, starting_at",
        )
        .eq("user_id", user!.id)
        .maybeSingle<RiskSettings>(),
      supabase
        .from("cash_flows")
        .select("id, amount, occurred_at, note")
        .order("occurred_at", { ascending: false })
        .returns<CashFlowRow[]>(),
      supabase
        .from("instrument_specs")
        .select("symbol, point_value, description")
        .order("symbol")
        .returns<SpecRow[]>(),
      getUserRole(),
    ]);

  const isAdmin = role === "admin";

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-lg font-semibold text-ink">Settings</h1>

      <Section
        title="Risk model"
        subtitle="Used to compute R-multiples. R = net P&L ÷ risk; every input here is editable."
      >
        <RiskSettingsForm initial={settings ?? null} />
      </Section>

      <Section
        title="Deposits & withdrawals"
        subtitle="Only affects the auto-tracked-equity risk method. Positive = deposit, negative = withdrawal."
      >
        <form action={addCashFlow} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            Amount ($)
            <input
              type="number"
              name="amount"
              step="0.01"
              required
              className="mt-1 block w-32 rounded-lg bg-white px-3 py-2 text-ink border border-line focus:border-accent"
            />
          </label>
          <label className="text-xs text-muted">
            Date
            <input
              type="date"
              name="occurred_at"
              required
              className="mt-1 block rounded-lg bg-white px-3 py-2 text-ink border border-line focus:border-accent"
            />
          </label>
          <label className="text-xs text-muted">
            Note
            <input
              type="text"
              name="note"
              className="mt-1 block rounded-lg bg-white px-3 py-2 text-ink border border-line focus:border-accent"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Add
          </button>
        </form>

        {(flows ?? []).length > 0 && (
          <ul className="mt-3 divide-y divide-line text-sm">
            {(flows ?? []).map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2">
                <span className="text-muted">
                  {formatDate(f.occurred_at)} · {formatUsd(f.amount)}
                  {f.note ? ` · ${f.note}` : ""}
                </span>
                <form action={deleteCashFlow}>
                  <input type="hidden" name="id" value={f.id} />
                  <button
                    type="submit"
                    className="text-xs text-muted hover:text-loss"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Instrument multipliers"
        subtitle="Dollars per 1.00 point of price for futures, so P&L is in real dollars. Applied on import."
      >
        {isAdmin && (
          <form
            action={saveInstrumentSpec}
            className="mb-3 flex flex-wrap items-end gap-2"
          >
            <label className="text-xs text-muted">
              Symbol
              <input
                name="symbol"
                required
                className="mt-1 block w-24 rounded-lg bg-white px-3 py-2 uppercase text-ink border border-line focus:border-accent"
              />
            </label>
            <label className="text-xs text-muted">
              Point value ($)
              <input
                type="number"
                name="point_value"
                step="0.01"
                required
                className="mt-1 block w-32 rounded-lg bg-white px-3 py-2 text-ink border border-line focus:border-accent"
              />
            </label>
            <label className="text-xs text-muted">
              Description
              <input
                name="description"
                className="mt-1 block rounded-lg bg-white px-3 py-2 text-ink border border-line focus:border-accent"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              Save
            </button>
          </form>
        )}
        {!isAdmin && (
          <p className="mb-2 text-xs text-muted">
            Read-only. Ask an admin to add a missing symbol (unknown symbols
            default to 1× until added).
          </p>
        )}
        <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-right">Point value</th>
                <th className="px-3 py-2 text-left">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(specs ?? []).map((s) => (
                <tr key={s.symbol}>
                  <td className="px-3 py-1.5 font-medium text-ink">
                    {s.symbol}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                    {formatUsd(s.point_value)}
                  </td>
                  <td className="px-3 py-1.5 text-muted">
                    {s.description ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-4 border border-line shadow-sm">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 mb-3 text-xs text-muted">{subtitle}</p>
      {children}
    </section>
  );
}
