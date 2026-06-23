import { createClient } from "@/lib/supabase/server";
import { listStrategies } from "@/lib/engine/registry";
import StrategyConfigForm, {
  type StrategyConfigValues,
} from "@/components/StrategyConfigForm";

export const dynamic = "force-dynamic";

const DEFAULTS: StrategyConfigValues = {
  id: null,
  name: "Default",
  entry_plugin_id: "example_ma_cross",
  risk_pct: 0.5,
  account_size_usd: null,
  stop_mode: "fixed_points",
  stop_value: 20,
  atr_period: 14,
  min_rr: 1.5,
  target_r: 2,
  daily_loss_limit_usd: null,
  max_trades_per_day: null,
  max_risk_per_trade_usd: null,
};

export default async function StrategyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: config } = await supabase
    .from("strategy_configs")
    .select(
      "id, name, entry_plugin_id, risk_pct, account_size_usd, stop_mode, stop_value, atr_period, min_rr, target_r, daily_loss_limit_usd, max_trades_per_day, max_risk_per_trade_usd",
    )
    .eq("user_id", user!.id)
    .eq("is_active", true)
    .maybeSingle<StrategyConfigValues>();

  const plugins = listStrategies().map((s) => ({
    id: s.id,
    label: s.label,
    isExample: !!s.exampleNotice,
  }));

  return (
    <div className="space-y-4 pb-8">
      <h1 className="font-display text-lg font-semibold text-ink">Strategy settings</h1>
      <StrategyConfigForm config={config ?? DEFAULTS} plugins={plugins} />
    </div>
  );
}
