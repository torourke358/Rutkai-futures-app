import { createClient } from "@/lib/supabase/server";
import { annotateRisk, type RiskSettings, type CashFlow } from "@/lib/risk";
import type { TradeForStats } from "@/lib/analytics/stats";
import DashboardView from "@/components/dashboard/DashboardView";
import FirstRunBanner from "@/components/FirstRunBanner";

export const dynamic = "force-dynamic";

interface ClosedRow {
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  realized_pnl: number | null;
  fees: number | null;
  entry_at: string;
  exit_at: string;
  setup_tag: string | null;
  tags: string[] | null;
  risk_amount: number | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: closed }, { data: settings }, { data: flows }, { data: rsRow }] =
    await Promise.all([
      supabase
        .from("trades")
        .select(
          "symbol, direction, quantity, realized_pnl, fees, entry_at, exit_at, setup_tag, tags, risk_amount",
        )
        .eq("status", "closed")
        .order("exit_at", { ascending: false })
        .returns<ClosedRow[]>(),
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
      supabase
        .from("risk_settings")
        .select("configured")
        .eq("user_id", user!.id)
        .maybeSingle<{ configured: boolean }>(),
    ]);

  // Annotate every closed trade with its R-multiple over the FULL history (R
  // depends on equity ordering, not on dashboard filters), then hand the
  // enriched rows to the client view for filtering + charting.
  const base = (closed ?? []).map((t) => ({
    symbol: t.symbol,
    direction: t.direction,
    quantity: t.quantity,
    realized_pnl: t.realized_pnl ?? 0,
    fees: t.fees ?? 0,
    entry_at: t.entry_at,
    exit_at: t.exit_at,
    setup_tag: t.setup_tag,
    tags: t.tags,
    risk_amount: t.risk_amount,
  }));

  const annotated = annotateRisk(base, settings ?? null, flows ?? []);
  const trades: TradeForStats[] = annotated.map((t) => ({
    symbol: t.symbol,
    direction: t.direction,
    quantity: t.quantity,
    realized_pnl: t.realized_pnl,
    fees: t.fees,
    entry_at: t.entry_at,
    exit_at: t.exit_at,
    setup_tag: t.setup_tag,
    tags: t.tags,
    r: t.r,
  }));

  const configured = rsRow?.configured ?? false;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Dashboard</h1>
      </div>

      {!configured && <FirstRunBanner />}

      {trades.length === 0 ? (
        <div className="rounded-2xl bg-[var(--surface)] p-6 text-center text-sm text-slate-400 ring-1 ring-[var(--border)]">
          No closed trades yet. Import a NinjaTrader Executions CSV on the
          Import tab to get started.
        </div>
      ) : (
        <DashboardView trades={trades} />
      )}
    </div>
  );
}
