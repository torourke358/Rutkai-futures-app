import { createClient } from "@/lib/supabase/server";
import { annotateRisk, type RiskSettings, type CashFlow } from "@/lib/risk";
import TradesTable, { type TradeRowView } from "@/components/TradesTable";
import ManualTradeForm from "@/components/ManualTradeForm";
import RecomputeButton from "@/components/RecomputeButton";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  realized_pnl: number | null;
  status: "open" | "closed";
  setup_tag: string | null;
  notes: string | null;
  risk_amount: number | null;
}

export default async function TradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: rows }, { data: settings }, { data: flows }] =
    await Promise.all([
      supabase
        .from("trades")
        .select(
          "id, symbol, direction, quantity, entry_price, exit_price, entry_at, exit_at, realized_pnl, status, setup_tag, notes, risk_amount",
        )
        .order("exit_at", { ascending: false, nullsFirst: true })
        .limit(5000)
        .returns<Row[]>(),
      supabase
        .from("risk_settings")
        .select(
          "method, default_risk_dollars, account_balance, risk_percent, starting_balance, starting_at",
        )
        .eq("user_id", user!.id)
        .maybeSingle<RiskSettings>(),
      supabase
        .from("cash_flows")
        .select("amount, occurred_at")
        .returns<CashFlow[]>(),
    ]);

  const annotated = annotateRisk(rows ?? [], settings ?? null, flows ?? []);
  const view: TradeRowView[] = annotated.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    quantity: t.quantity,
    entry_price: t.entry_price,
    exit_price: t.exit_price,
    entry_at: t.entry_at,
    exit_at: t.exit_at,
    realized_pnl: t.realized_pnl,
    status: t.status,
    setup_tag: t.setup_tag,
    notes: t.notes,
    r: t.r,
  }));

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-lg font-semibold text-ink">Trades</h1>
        <RecomputeButton />
      </div>
      <ManualTradeForm />
      {view.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted ring-1 ring-line">
          No trades yet. Import a CSV or add one manually above.
        </p>
      ) : (
        <TradesTable rows={view} />
      )}
    </div>
  );
}
