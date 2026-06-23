"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getStrategy } from "@/lib/engine/registry";
import { generateCandidate } from "@/lib/engine/generate";
import { checkGuardrails, type RiskTemplateConfig } from "@/lib/engine/riskTemplate";
import { SimBrokerAdapter } from "@/lib/broker/SimBrokerAdapter";
import type { SimBar } from "@/lib/broker/BrokerAdapter";
import type { StrategyBar } from "@/lib/engine/strategy";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

interface StrategyConfigRow {
  id: string;
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

function toTemplate(c: StrategyConfigRow): RiskTemplateConfig {
  return {
    risk_pct: c.risk_pct,
    stop_mode: c.stop_mode,
    stop_value: c.stop_value,
    atr_period: c.atr_period,
    min_rr: c.min_rr,
    target_r: c.target_r,
    daily_loss_limit_usd: c.daily_loss_limit_usd,
    max_trades_per_day: c.max_trades_per_day,
    max_risk_per_trade_usd: c.max_risk_per_trade_usd,
  };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export interface GenerateActionResult {
  ok: boolean;
  candidateId?: string;
  reason?: string;
}

// Run ONE generation pass for the chosen instrument. Never automatic — a button
// calls this. Applies session guardrails first; if breached, generates nothing
// and says why. Writes at most one `proposed` candidate.
export async function generateCandidateAction(
  symbol: string,
): Promise<GenerateActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, reason: "Not authenticated." };

  const [{ data: config }, { data: risk }, { data: instrument }] = await Promise.all([
    supabase
      .from("strategy_configs")
      .select(
        "id, entry_plugin_id, risk_pct, account_size_usd, stop_mode, stop_value, atr_period, min_rr, target_r, daily_loss_limit_usd, max_trades_per_day, max_risk_per_trade_usd",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<StrategyConfigRow>(),
    supabase
      .from("risk_settings")
      .select("account_balance, starting_balance")
      .eq("user_id", user.id)
      .maybeSingle<{ account_balance: number | null; starting_balance: number | null }>(),
    supabase
      .from("instruments")
      .select("id, symbol, point_value, tick_size")
      .eq("user_id", user.id)
      .eq("symbol", symbol.trim().toUpperCase())
      .maybeSingle<{ id: string; symbol: string; point_value: number; tick_size: number }>(),
  ]);

  if (!config) return { ok: false, reason: "No active strategy is configured." };
  if (!instrument) return { ok: false, reason: `No instrument "${symbol}". Import bars for it first.` };

  const strategy = getStrategy(config.entry_plugin_id);
  if (!strategy) return { ok: false, reason: `Unknown entry plugin "${config.entry_plugin_id}".` };

  // Guardrails: halt generation for the session when a limit is hit.
  const { data: todays } = await supabase
    .from("paper_trades")
    .select("pnl_usd")
    .eq("user_id", user.id)
    .gte("filled_at", startOfTodayIso())
    .returns<{ pnl_usd: number | null }[]>();
  const sessionPnlUsd = (todays ?? []).reduce((s, t) => s + (t.pnl_usd ?? 0), 0);
  const guard = checkGuardrails(toTemplate(config), {
    sessionPnlUsd,
    tradesToday: (todays ?? []).length,
  });
  if (!guard.ok) return { ok: false, reason: guard.reason };

  // Recent bars (single timeframe, ascending).
  const bars = await loadRecentBars(supabase, instrument.id, "1m");
  if (bars.length < 25) {
    return { ok: false, reason: "Not enough imported bars for this instrument yet." };
  }

  const accountSizeUsd =
    config.account_size_usd ?? risk?.account_balance ?? risk?.starting_balance ?? null;

  const result = generateCandidate({
    strategy,
    config: toTemplate(config),
    instrument: { point_value: instrument.point_value, tick_size: instrument.tick_size },
    instrumentSymbol: instrument.symbol,
    bars,
    accountSizeUsd,
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  const c = result.candidate;
  const { data: inserted, error } = await supabase
    .from("trade_candidates")
    .insert({
      user_id: user.id,
      instrument_id: instrument.id,
      strategy_config_id: config.id,
      direction: c.direction,
      entry_price: c.entry_price,
      stop_price: c.stop_price,
      target_price: c.target_price,
      size: c.size,
      rr_ratio: c.rr_ratio,
      risk_usd: c.risk_usd,
      entry_plugin_id: config.entry_plugin_id,
      rationale_tag: result.rationaleTag,
      signal_bar_ts: result.signalBarTs,
      timeframe: "1m",
      status: "proposed",
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !inserted) {
    return { ok: false, reason: error?.message ?? "Failed to save candidate." };
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "trade_candidate",
    entity_id: inserted.id,
    action: "propose",
    after_state: { ...c, rationale_tag: result.rationaleTag, symbol: instrument.symbol },
  });

  revalidatePath("/engine");
  return { ok: true, candidateId: inserted.id };
}

interface CandidateRow {
  id: string;
  user_id: string;
  instrument_id: string | null;
  direction: "long" | "short";
  entry_price: number;
  stop_price: number;
  target_price: number;
  size: number;
  risk_usd: number | null;
  signal_bar_ts: string | null;
  timeframe: string;
  status: string;
}

// Approve → record the human decision, run the SIMULATED fill against imported
// bars, write a paper_trade (is_simulated=true). No live path is reachable.
export async function approveCandidateAction(candidateId: string): Promise<{ ok: boolean; reason?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, reason: "Not authenticated." };

  const { data: cand } = await supabase
    .from("trade_candidates")
    .select(
      "id, user_id, instrument_id, direction, entry_price, stop_price, target_price, size, risk_usd, signal_bar_ts, timeframe, status",
    )
    .eq("id", candidateId)
    .eq("user_id", user.id)
    .maybeSingle<CandidateRow>();

  if (!cand) return { ok: false, reason: "Candidate not found." };
  if (cand.status !== "proposed") return { ok: false, reason: `Candidate already ${cand.status}.` };

  const { data: inst } = await supabase
    .from("instruments")
    .select("point_value, tick_size")
    .eq("id", cand.instrument_id ?? "")
    .maybeSingle<{ point_value: number; tick_size: number }>();
  const pointValue = inst?.point_value ?? 1;
  const tickSize = inst?.tick_size ?? 0.25;

  // Simulated-fill window: bars AFTER the signal bar, same timeframe.
  const simBars = await loadBarsAfter(
    supabase,
    cand.instrument_id ?? "",
    cand.timeframe,
    cand.signal_bar_ts,
  );

  const adapter = new SimBrokerAdapter();
  const fill = await adapter.fill(
    {
      direction: cand.direction,
      size: cand.size,
      entry_price: cand.entry_price,
      stop_price: cand.stop_price,
      target_price: cand.target_price,
      point_value: pointValue,
      tickSize,
    },
    simBars,
  );

  // Record the human approval.
  await supabase.from("trade_decisions").insert({
    candidate_id: cand.id,
    user_id: user.id,
    decision: "approved",
  });
  await supabase
    .from("trade_candidates")
    .update({ status: "approved" })
    .eq("id", cand.id)
    .eq("user_id", user.id);

  // Write the SIMULATED fill.
  const { data: paper } = await supabase
    .from("paper_trades")
    .insert({
      user_id: user.id,
      candidate_id: cand.id,
      instrument_id: cand.instrument_id,
      direction: cand.direction,
      fill_price: fill.fill_price,
      size: fill.size,
      stop_price: cand.stop_price,
      target_price: cand.target_price,
      exit_price: fill.exit_price,
      exit_reason: fill.exit_reason,
      risk_usd: cand.risk_usd,
      point_value: pointValue,
      pnl_usd: fill.pnl_usd,
      entry_ts: fill.entry_ts,
      exit_ts: fill.exit_ts,
      is_simulated: true,
    })
    .select("id")
    .single<{ id: string }>();

  await writeAudit({
    user_id: user.id,
    entity_type: "trade_candidate",
    entity_id: cand.id,
    action: "approve",
    before_state: { status: "proposed" },
    after_state: { status: "approved" },
  });
  await writeAudit({
    user_id: user.id,
    entity_type: "paper_trade",
    entity_id: paper?.id ?? null,
    action: "fill",
    after_state: { ...fill, is_simulated: true },
  });

  revalidatePath("/engine");
  revalidatePath("/paper");
  return { ok: true };
}

export async function rejectCandidateAction(candidateId: string): Promise<{ ok: boolean; reason?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, reason: "Not authenticated." };

  const { data: cand } = await supabase
    .from("trade_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; status: string }>();
  if (!cand) return { ok: false, reason: "Candidate not found." };
  if (cand.status !== "proposed") return { ok: false, reason: `Candidate already ${cand.status}.` };

  await supabase.from("trade_decisions").insert({
    candidate_id: cand.id,
    user_id: user.id,
    decision: "rejected",
  });
  await supabase
    .from("trade_candidates")
    .update({ status: "rejected" })
    .eq("id", cand.id)
    .eq("user_id", user.id);

  await writeAudit({
    user_id: user.id,
    entity_type: "trade_candidate",
    entity_id: cand.id,
    action: "reject",
    before_state: { status: "proposed" },
    after_state: { status: "rejected" },
  });

  revalidatePath("/engine");
  return { ok: true };
}

// ---- bar loaders ----

type DbClient = Awaited<ReturnType<typeof createClient>>;

interface BarRowLite {
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  timeframe?: string;
}

async function loadRecentBars(
  supabase: DbClient,
  instrumentId: string,
  preferredTf: string,
): Promise<StrategyBar[]> {
  const pick = async (tf: string | null) => {
    let q = supabase
      .from("bars")
      .select("ts, open, high, low, close")
      .eq("instrument_id", instrumentId)
      .order("ts", { ascending: false })
      .limit(600);
    if (tf) q = q.eq("timeframe", tf);
    const { data } = await q.returns<BarRowLite[]>();
    return data ?? [];
  };
  let rows = await pick(preferredTf);
  if (rows.length === 0) rows = await pick(null);
  return rows
    .filter((b) => b.open != null && b.high != null && b.low != null && b.close != null)
    .map((b) => ({
      ts: b.ts,
      open: b.open as number,
      high: b.high as number,
      low: b.low as number,
      close: b.close as number,
    }))
    .reverse(); // ascending
}

async function loadBarsAfter(
  supabase: DbClient,
  instrumentId: string,
  timeframe: string,
  afterTs: string | null,
): Promise<SimBar[]> {
  if (!instrumentId || !afterTs) return [];
  const { data } = await supabase
    .from("bars")
    .select("ts, open, high, low, close")
    .eq("instrument_id", instrumentId)
    .eq("timeframe", timeframe)
    .gt("ts", afterTs)
    .order("ts", { ascending: true })
    .limit(5000)
    .returns<BarRowLite[]>();
  return (data ?? []).map((b) => ({
    ts: b.ts,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}
