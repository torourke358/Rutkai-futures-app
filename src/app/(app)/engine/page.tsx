import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStrategy } from "@/lib/engine/registry";
import { formatSignedUsd, formatUsd } from "@/lib/format";
import GenerateControls from "@/components/GenerateControls";
import TradeTicket, { type TicketCandidate } from "@/components/TradeTicket";

export const dynamic = "force-dynamic";

interface ConfigRow {
  id: string;
  name: string;
  entry_plugin_id: string;
  risk_pct: number;
  stop_mode: string;
  stop_value: number;
  min_rr: number;
  target_r: number;
  daily_loss_limit_usd: number | null;
  max_trades_per_day: number | null;
  account_size_usd: number | null;
}

interface CandRow {
  id: string;
  direction: "long" | "short";
  entry_price: number;
  stop_price: number;
  target_price: number;
  size: number;
  rr_ratio: number | null;
  risk_usd: number | null;
  rationale_tag: string | null;
  entry_plugin_id: string | null;
  generated_at: string;
  status: string;
  instruments: { symbol: string } | { symbol: string }[] | null;
}

function symbolOf(c: { instruments: CandRow["instruments"] }): string {
  const i = c.instruments;
  if (!i) return "—";
  return Array.isArray(i) ? (i[0]?.symbol ?? "—") : i.symbol;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function EnginePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: config }, { data: instruments }, { data: proposed }, { data: todays }, { data: recent }] =
    await Promise.all([
      supabase
        .from("strategy_configs")
        .select(
          "id, name, entry_plugin_id, risk_pct, stop_mode, stop_value, min_rr, target_r, daily_loss_limit_usd, max_trades_per_day, account_size_usd",
        )
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .maybeSingle<ConfigRow>(),
      supabase
        .from("instruments")
        .select("symbol")
        .eq("user_id", user!.id)
        .order("symbol")
        .returns<{ symbol: string }[]>(),
      supabase
        .from("trade_candidates")
        .select(
          "id, direction, entry_price, stop_price, target_price, size, rr_ratio, risk_usd, rationale_tag, entry_plugin_id, generated_at, status, instruments(symbol)",
        )
        .eq("user_id", user!.id)
        .eq("status", "proposed")
        .order("generated_at", { ascending: false })
        .limit(1)
        .returns<CandRow[]>(),
      supabase
        .from("paper_trades")
        .select("pnl_usd")
        .eq("user_id", user!.id)
        .gte("filled_at", startOfTodayIso())
        .returns<{ pnl_usd: number | null }[]>(),
      supabase
        .from("trade_candidates")
        .select("id, direction, status, generated_at, rationale_tag, instruments(symbol)")
        .eq("user_id", user!.id)
        .order("generated_at", { ascending: false })
        .limit(6)
        .returns<CandRow[]>(),
    ]);

  const symbols = (instruments ?? []).map((i) => i.symbol);
  const strat = config ? getStrategy(config.entry_plugin_id) : null;
  const isExample = !!strat?.exampleNotice;

  const sessionPnl = (todays ?? []).reduce((s, t) => s + (t.pnl_usd ?? 0), 0);
  const tradesToday = (todays ?? []).length;

  const cand = proposed?.[0];
  const ticket: TicketCandidate | null = cand
    ? {
        id: cand.id,
        instrumentSymbol: symbolOf(cand),
        direction: cand.direction,
        entry_price: cand.entry_price,
        stop_price: cand.stop_price,
        target_price: cand.target_price,
        size: cand.size,
        rr_ratio: cand.rr_ratio,
        risk_usd: cand.risk_usd,
        rationale_tag: cand.rationale_tag,
        entry_plugin_id: cand.entry_plugin_id,
      }
    : null;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-ink">Engine</h1>
        <Link href="/strategy" className="text-sm text-muted hover:text-ink">
          Strategy settings →
        </Link>
      </div>

      {!config ? (
        <EmptyState />
      ) : (
        <>
          {/* active strategy summary */}
          <div className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">{config.name}</h2>
              <span className="font-mono text-[11px] text-muted">{config.entry_plugin_id}</span>
            </div>
            {isExample && (
              <p className="mt-2 rounded-lg border border-short/40 bg-short/10 px-3 py-2 text-xs font-medium text-short">
                {strat?.exampleNotice}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted sm:grid-cols-4">
              <Param label="Risk / trade" value={`${config.risk_pct}%`} />
              <Param label="Stop" value={config.stop_mode === "fixed_points" ? `${config.stop_value} pt` : `${config.stop_value}× ATR`} />
              <Param label="Target" value={`${config.target_r}R`} />
              <Param label="Min R:R" value={`${config.min_rr}`} />
            </div>
          </div>

          <GenerateControls symbols={symbols.length ? symbols : ["NQ", "ES", "YM", "CL"]} />

          {/* the signature approval moment */}
          {ticket ? (
            <TradeTicket candidate={ticket} isExample={isExample} notice={strat?.exampleNotice} />
          ) : (
            <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-6 text-center text-sm text-muted">
              No candidate proposed yet. Pick an instrument and generate one.
            </p>
          )}

          {/* guardrail status */}
          <div className="rounded-2xl border border-line bg-card p-4">
            <h2 className="mb-2 font-display text-sm font-semibold text-ink">Session guardrails</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <Param label="Sim P&L today" value={formatSignedUsd(sessionPnl)} />
              <Param label="Trades today" value={`${tradesToday}${config.max_trades_per_day ? ` / ${config.max_trades_per_day}` : ""}`} />
              <Param label="Daily loss limit" value={config.daily_loss_limit_usd == null ? "off" : formatUsd(config.daily_loss_limit_usd)} />
              <Param label="Account size" value={config.account_size_usd == null ? "from risk model" : formatUsd(config.account_size_usd)} />
            </div>
          </div>

          {/* recent activity */}
          {recent && recent.length > 0 && (
            <div className="rounded-2xl border border-line bg-card p-4">
              <h2 className="mb-2 font-display text-sm font-semibold text-ink">Recent candidates</h2>
              <ul className="divide-y divide-line text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2">
                    <span className="font-mono text-xs text-ink">{symbolOf(r)}</span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: r.direction === "long" ? "var(--long)" : "var(--short)" }}
                    >
                      {r.direction}
                    </span>
                    {r.rationale_tag && (
                      <span className="font-mono text-[10px] text-muted">{r.rationale_tag}</span>
                    )}
                    <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase text-muted">
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center">
      <p className="text-sm text-ink">No active strategy yet.</p>
      <p className="mt-1 text-sm text-muted">
        Set up your risk template and entry plugin to start proposing candidates.
      </p>
      <Link
        href="/strategy"
        className="mt-3 inline-block rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white"
      >
        Configure strategy
      </Link>
    </div>
  );
}
