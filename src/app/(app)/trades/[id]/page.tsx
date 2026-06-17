import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { annotateRisk, type RiskSettings, type CashFlow } from "@/lib/risk";
import {
  formatDateTime,
  formatSignedUsd,
  formatUsd,
  pnlToneClass,
} from "@/lib/format";
import TradeEditForm from "@/components/TradeEditForm";

export const dynamic = "force-dynamic";

interface TradeFull {
  id: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  fees: number;
  realized_pnl: number | null;
  status: "open" | "closed";
  point_value: number;
  setup_tag: string | null;
  tags: string[] | null;
  rating: number | null;
  notes: string | null;
  risk_amount: number | null;
}

interface ExecRow {
  id: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  executed_at: string;
  source: string;
}

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trade } = await supabase
    .from("trades")
    .select(
      "id, symbol, direction, quantity, entry_price, exit_price, entry_at, exit_at, fees, realized_pnl, status, point_value, setup_tag, tags, rating, notes, risk_amount",
    )
    .eq("id", id)
    .maybeSingle<TradeFull>();

  if (!trade) notFound();

  // R for this trade: annotate over the full closed history (R depends on
  // equity ordering), then pick this one out by id.
  const [{ data: closed }, { data: settings }, { data: flows }, { data: execs }] =
    await Promise.all([
      supabase
        .from("trades")
        .select("id, realized_pnl, entry_at, exit_at, risk_amount")
        .eq("status", "closed"),
      supabase
        .from("risk_settings")
        .select(
          "method, default_risk_dollars, account_balance, risk_percent, starting_balance, starting_at",
        )
        .eq("user_id", user!.id)
        .maybeSingle<RiskSettings>(),
      supabase.from("cash_flows").select("amount, occurred_at").returns<CashFlow[]>(),
      supabase
        .from("executions")
        .select("id, side, quantity, price, fees, executed_at, source")
        .eq("symbol", trade.symbol)
        .gte("executed_at", trade.entry_at)
        .lte("executed_at", trade.exit_at ?? trade.entry_at)
        .order("executed_at")
        .returns<ExecRow[]>(),
    ]);

  const annotated = annotateRisk(
    (closed ?? []) as {
      id: string;
      realized_pnl: number | null;
      entry_at: string;
      exit_at: string | null;
      risk_amount: number | null;
    }[],
    settings ?? null,
    flows ?? [],
  );
  const thisR = annotated.find((t) => t.id === id);
  const r = thisR?.r ?? null;
  const risk = thisR?.risk ?? null;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <Link href="/trades" className="text-sm text-slate-400 hover:text-slate-100">
          ← Trades
        </Link>
        <h1 className="text-lg font-semibold text-slate-100">
          {trade.symbol}{" "}
          <span className="text-sm font-normal text-slate-400">
            {trade.direction} · {trade.quantity}
          </span>
        </h1>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
            trade.status === "closed"
              ? "bg-slate-500/20 text-slate-300"
              : "bg-amber-500/20 text-amber-300"
          }`}
        >
          {trade.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Realized P&L" value={formatSignedUsd(trade.realized_pnl)} tone={pnlToneClass(trade.realized_pnl)} />
        <Stat label="R-multiple" value={r == null ? "—" : `${r.toFixed(2)}R`} tone={pnlToneClass(r)} />
        <Stat label="Risk used" value={risk == null ? "—" : formatUsd(risk)} />
        <Stat label="Fees" value={formatUsd(trade.fees)} tone="text-slate-400" />
        <Stat label="Entry" value={`${trade.entry_price}`} />
        <Stat label="Exit" value={trade.exit_price == null ? "—" : `${trade.exit_price}`} />
        <Stat label="Entry at" value={formatDateTime(trade.entry_at)} />
        <Stat label="Exit at" value={formatDateTime(trade.exit_at)} />
      </div>

      <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Journal</h2>
        <TradeEditForm
          trade={{
            id: trade.id,
            setup_tag: trade.setup_tag,
            tags: trade.tags,
            rating: trade.rating,
            notes: trade.notes,
            risk_amount: trade.risk_amount,
          }}
        />
      </section>

      <section className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
        <h2 className="mb-2 text-sm font-semibold text-slate-100">
          Related executions
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Fills for {trade.symbol} within this trade&apos;s window
          {trade.point_value !== 1 ? ` · point value ${formatUsd(trade.point_value)}` : ""}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 text-left">Time</th>
                <th className="py-1 text-left">Side</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Price</th>
                <th className="py-1 text-right">Fees</th>
                <th className="py-1 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {(execs ?? []).map((e) => (
                <tr key={e.id} className="border-t border-[var(--border)]">
                  <td className="py-1.5 text-slate-400">{formatDateTime(e.executed_at)}</td>
                  <td className="py-1.5">{e.side}</td>
                  <td className="py-1.5 text-right tabular-nums">{e.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums">{e.price}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatUsd(e.fees)}</td>
                  <td className="py-1.5 text-slate-400">{e.source}</td>
                </tr>
              ))}
              {(execs ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-slate-500">
                    No matching executions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-slate-100",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
