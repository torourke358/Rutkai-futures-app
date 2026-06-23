import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { annotateRisk, type RiskSettings, type CashFlow } from "@/lib/risk";
import {
  computeExcursion,
  postExitExcursion,
  type ExcursionBar,
} from "@/lib/analytics/excursion";
import { resolveInstrument, type InstrumentLite } from "@/lib/analysis/persist";
import {
  formatDateTime,
  formatSignedUsd,
  formatUsd,
  pnlToneClass,
} from "@/lib/format";
import TradeEditForm from "@/components/TradeEditForm";
import CandleChart, {
  type Candle,
  type ChartMarker,
  type PriceLine,
} from "@/components/charts/CandleChart";

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
  planned_stop_price: number | null;
  planned_target_price: number | null;
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

interface BarFull {
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  timeframe: string;
}

const MS = (m: number) => m * 60_000;
const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

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
      "id, symbol, direction, quantity, entry_price, exit_price, entry_at, exit_at, fees, realized_pnl, status, point_value, setup_tag, tags, rating, notes, risk_amount, planned_stop_price, planned_target_price",
    )
    .eq("id", id)
    .maybeSingle<TradeFull>();

  if (!trade) notFound();

  // R for this trade (risk-model based): annotate over the full closed history,
  // then pick this one out by id.
  const [{ data: closed }, { data: settings }, { data: flows }, { data: execs }, { data: instruments }] =
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
      supabase
        .from("instruments")
        .select("id, symbol, point_value, tick_size")
        .eq("user_id", user!.id)
        .returns<InstrumentLite[]>(),
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

  // ---- Bars + excursion ----
  const inst = resolveInstrument(instruments ?? [], trade.symbol);
  const startIso = new Date(Date.parse(trade.entry_at) - MS(15)).toISOString();
  const endIso = new Date(
    Date.parse(trade.exit_at ?? trade.entry_at) + MS(30),
  ).toISOString();

  let candles: Candle[] = [];
  let exBars: ExcursionBar[] = [];
  if (inst) {
    let barRows: BarFull[] = [];
    const tf = await supabase
      .from("bars")
      .select("ts, open, high, low, close, timeframe")
      .eq("instrument_id", inst.id)
      .eq("timeframe", "1m")
      .gte("ts", startIso)
      .lte("ts", endIso)
      .order("ts", { ascending: true })
      .returns<BarFull[]>();
    barRows = tf.data ?? [];
    if (barRows.length === 0) {
      const any = await supabase
        .from("bars")
        .select("ts, open, high, low, close, timeframe")
        .eq("instrument_id", inst.id)
        .gte("ts", startIso)
        .lte("ts", endIso)
        .order("ts", { ascending: true })
        .returns<BarFull[]>();
      barRows = any.data ?? [];
    }
    candles = barRows
      .filter((b) => b.open != null && b.high != null && b.low != null && b.close != null)
      .map((b) => ({
        time: unix(b.ts),
        open: b.open as number,
        high: b.high as number,
        low: b.low as number,
        close: b.close as number,
      }));
    exBars = barRows.map((b) => ({ ts: b.ts, high: b.high, low: b.low, close: b.close }));
  }

  const ex = computeExcursion(
    {
      direction: trade.direction,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price,
      entry_at: trade.entry_at,
      exit_at: trade.exit_at,
      quantity: trade.quantity,
      point_value: trade.point_value || inst?.point_value || 1,
      tick_size: inst?.tick_size,
      planned_stop_price: trade.planned_stop_price,
    },
    exBars,
  );
  const post = postExitExcursion(
    {
      direction: trade.direction,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price,
      entry_at: trade.entry_at,
      exit_at: trade.exit_at,
      quantity: trade.quantity,
      point_value: trade.point_value || inst?.point_value || 1,
      tick_size: inst?.tick_size,
      planned_stop_price: trade.planned_stop_price,
    },
    exBars,
  );

  const isLong = trade.direction === "long";
  const candleTimes = candles.map((c) => c.time);
  const snap = (t: number) => nearest(t, candleTimes);

  const markers: ChartMarker[] = [];
  if (candles.length) {
    markers.push({
      time: snap(unix(trade.entry_at)),
      position: isLong ? "belowBar" : "aboveBar",
      color: isLong ? "#2563eb" : "#e08a1e",
      shape: isLong ? "arrowUp" : "arrowDown",
      text: "Entry",
    });
    if (trade.exit_at) {
      markers.push({
        time: snap(unix(trade.exit_at)),
        position: isLong ? "aboveBar" : "belowBar",
        color: "#0f1a2e",
        shape: "square",
        text: "Exit",
      });
    }
    if (ex.mae_ts) {
      markers.push({
        time: snap(unix(ex.mae_ts)),
        position: isLong ? "belowBar" : "aboveBar",
        color: "#e0413e",
        shape: "circle",
        text: `MAE ${ex.mae_points}`,
      });
    }
    if (ex.mfe_ts) {
      markers.push({
        time: snap(unix(ex.mfe_ts)),
        position: isLong ? "aboveBar" : "belowBar",
        color: "#15a66a",
        shape: "circle",
        text: `MFE ${ex.mfe_points}`,
      });
    }
    markers.sort((a, b) => a.time - b.time);
  }

  const priceLines: PriceLine[] = [];
  if (trade.planned_stop_price != null)
    priceLines.push({ price: trade.planned_stop_price, color: "#e0413e", title: "Stop" });
  if (trade.planned_target_price != null)
    priceLines.push({ price: trade.planned_target_price, color: "#15a66a", title: "Target" });
  priceLines.push({ price: trade.entry_price, color: "#5b6b82", title: "Entry" });

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <Link href="/trades" className="text-sm text-muted hover:text-ink">
          ← Trades
        </Link>
        <h1 className="font-display text-lg font-semibold text-ink">
          {trade.symbol}{" "}
          <span
            className="text-sm font-medium"
            style={{ color: isLong ? "var(--long)" : "var(--short)" }}
          >
            {trade.direction} · {trade.quantity}
          </span>
        </h1>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
            trade.status === "closed"
              ? "bg-surface-2 text-muted"
              : "bg-short/15 text-short"
          }`}
        >
          {trade.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Realized P&L" value={formatSignedUsd(trade.realized_pnl)} tone={pnlToneClass(trade.realized_pnl)} />
        <Stat label="R (risk model)" value={r == null ? "—" : `${r.toFixed(2)}R`} tone={pnlToneClass(r)} />
        <Stat label="R (planned stop)" value={ex.r_multiple == null ? "—" : `${ex.r_multiple.toFixed(2)}R`} tone={pnlToneClass(ex.r_multiple)} />
        <Stat label="Risk used" value={risk == null ? "—" : formatUsd(risk)} />
        <Stat label="MAE" value={ex.mae_points == null ? "—" : `${ex.mae_points} pt`} sub={ex.mae_usd == null ? undefined : formatUsd(ex.mae_usd)} tone="text-loss" />
        <Stat label="MFE" value={ex.mfe_points == null ? "—" : `${ex.mfe_points} pt`} sub={ex.mfe_usd == null ? undefined : formatUsd(ex.mfe_usd)} tone="text-gain" />
        <Stat label="Entry" value={`${trade.entry_price}`} />
        <Stat label="Exit" value={trade.exit_price == null ? "—" : `${trade.exit_price}`} />
      </div>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">Price &amp; excursion</h2>
          <p className="text-xs text-muted">
            {ex.bar_count > 0
              ? `${ex.bar_count} bars in window`
              : inst
                ? "No bars cover this window"
                : "No instrument matched — import bars to chart this"}
          </p>
        </div>
        <CandleChart candles={candles} markers={markers} priceLines={priceLines} />
        {post.furthest_favorable_points != null && post.furthest_favorable_points > 0 && (
          <p className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
            Retrospective &amp; hypothetical: after you exited, your data moved a
            further {post.furthest_favorable_points} pts in your favor
            {post.reached_r != null ? ` (${post.reached_r}R)` : ""}. This describes
            what your bars did, not what to do next time.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Journal</h2>
        <TradeEditForm
          trade={{
            id: trade.id,
            setup_tag: trade.setup_tag,
            tags: trade.tags,
            rating: trade.rating,
            notes: trade.notes,
            risk_amount: trade.risk_amount,
            planned_stop_price: trade.planned_stop_price,
            planned_target_price: trade.planned_target_price,
          }}
        />
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="mb-2 font-display text-sm font-semibold text-ink">
          Related executions
        </h2>
        <p className="mb-3 text-xs text-muted">
          Fills for {trade.symbol} within this trade&apos;s window
          {trade.point_value !== 1 ? ` · point value ${formatUsd(trade.point_value)}` : ""}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted">
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
                <tr key={e.id} className="border-t border-line">
                  <td className="py-1.5 text-muted">{formatDateTime(e.executed_at)}</td>
                  <td className="py-1.5 text-ink">{e.side}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">{e.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">{e.price}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">{formatUsd(e.fees)}</td>
                  <td className="py-1.5 text-muted">{e.source}</td>
                </tr>
              ))}
              {(execs ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-muted">
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

function nearest(t: number, times: number[]): number {
  if (times.length === 0) return t;
  let best = times[0];
  let bestD = Math.abs(times[0] - t);
  for (const x of times) {
    const d = Math.abs(x - t);
    if (d < bestD) {
      bestD = d;
      best = x;
    }
  }
  return best;
}

function Stat({
  label,
  value,
  sub,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[10px] text-muted tabular-nums">{sub}</p>}
    </div>
  );
}
