import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/billing/plan";
import PropRulesPanel from "@/components/PropRulesPanel";
import type { PropTrade } from "@/lib/analysis/propRules";
import SubTabs from "@/components/SubTabs";
import { ANALYSIS_SUBTABS } from "@/lib/nav";

export const dynamic = "force-dynamic";

interface Row {
  exit_at: string | null;
  realized_pnl: number | null;
  quantity: number;
}

export default async function PropPage() {
  await requireFeature("prop_rules");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from("trades")
    .select("exit_at, realized_pnl, quantity")
    .eq("user_id", user!.id)
    .eq("status", "closed")
    .order("exit_at", { ascending: true })
    .limit(20000)
    .returns<Row[]>();

  const trades: PropTrade[] = (rows ?? [])
    .filter((r) => r.exit_at != null && r.realized_pnl != null)
    .map((r) => ({
      exit_at: r.exit_at as string,
      realized_pnl: r.realized_pnl as number,
      quantity: r.quantity,
    }));

  return (
    <div className="space-y-4 pb-8">
      <h1 className="font-display text-lg font-semibold text-ink">Analysis</h1>
      <SubTabs tabs={ANALYSIS_SUBTABS} />
      <h2 className="font-display text-sm font-semibold text-ink">Prop-firm rules</h2>
      <p className="text-sm text-muted">
        Enter your firm&apos;s rules and see where your own history <em>would</em> have breached
        them — the day a daily-loss or drawdown limit would have failed the account, consistency
        issues, and oversized trades. Retrospective analysis of your trades; it does not watch or
        block live trading.
      </p>
      {trades.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm text-muted">
          No closed trades yet. Import your executions to run a prop-rules check.
        </p>
      ) : (
        <PropRulesPanel trades={trades} />
      )}
    </div>
  );
}
