export type Role = "trader" | "admin";

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: Role;
  active: boolean;
}

export interface ExecutionRow {
  id: string;
  user_id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  executed_at: string;
  source: "csv" | "manual" | "broker_api";
  import_batch: string | null;
  raw: Record<string, unknown> | null;
  created_at: string;
}

export interface TradeRow {
  id: string;
  user_id: string;
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
  setup_tag: string | null;
  notes: string | null;
  // Per-trade dollar risk override. When set, wins over the risk-model
  // baseline for R-multiple. Null → use the user's risk_settings method.
  risk_amount: number | null;
  // Dollars per 1.00 point of price, snapshotted at pairing time so realized
  // P&L and re-pairing stay reproducible. 1 for unmultiplied instruments.
  point_value: number;
  rating: number | null;
  tags: string[] | null;
  // Phase 3 analysis additions. planned_stop/target stay optional manual
  // fields; the rest are filled by the excursion engine when bars exist.
  planned_stop_price: number | null;
  planned_target_price: number | null;
  mae_points: number | null;
  mfe_points: number | null;
  mae_ts: string | null;
  mfe_ts: string | null;
  r_multiple: number | null;
  analysis_version: number;
  created_at: string;
  updated_at: string;
}

// ---- Phase 3: regulated engine row types ----

export interface InstrumentRow {
  id: string;
  user_id: string;
  symbol: string;
  tick_size: number;
  point_value: number;
  tz: string;
  created_at: string;
}

export interface BarRow {
  id: string;
  user_id: string;
  instrument_id: string;
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  timeframe: string;
}

export type StopMode = "fixed_points" | "atr_multiple";

export interface StrategyConfigRow {
  id: string;
  user_id: string;
  name: string;
  entry_plugin_id: string;
  risk_pct: number;
  account_size_usd: number | null;
  stop_mode: StopMode;
  stop_value: number;
  atr_period: number;
  min_rr: number;
  target_r: number;
  daily_loss_limit_usd: number | null;
  max_trades_per_day: number | null;
  max_risk_per_trade_usd: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CandidateStatus = "proposed" | "approved" | "rejected" | "expired";

export interface TradeCandidateRow {
  id: string;
  user_id: string;
  instrument_id: string | null;
  strategy_config_id: string | null;
  direction: "long" | "short" | null;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  size: number | null;
  rr_ratio: number | null;
  risk_usd: number | null;
  entry_plugin_id: string | null;
  rationale_tag: string | null;
  signal_bar_ts: string | null;
  timeframe: string;
  status: CandidateStatus;
  generated_at: string;
  expires_at: string | null;
}

export interface TradeDecisionRow {
  id: string;
  candidate_id: string;
  user_id: string;
  decision: "approved" | "rejected";
  decided_at: string;
}

export interface WhatIfRunRow {
  id: string;
  user_id: string;
  params: Record<string, unknown>;
  result_summary: Record<string, unknown>;
  per_trade: unknown[];
  narration: string | null;
  created_at: string;
}

export type ExitReason = "target" | "stop" | "eod" | "none";

export interface PaperTradeRow {
  id: string;
  user_id: string;
  candidate_id: string | null;
  instrument_id: string | null;
  direction: "long" | "short" | null;
  fill_price: number | null;
  size: number | null;
  stop_price: number | null;
  target_price: number | null;
  exit_price: number | null;
  exit_reason: ExitReason | null;
  risk_usd: number | null;
  point_value: number;
  pnl_usd: number | null;
  entry_ts: string | null;
  exit_ts: string | null;
  is_simulated: boolean;
  filled_at: string;
}

export interface AiQuestionRow {
  id: string;
  user_id: string;
  question: string;
  answer: string | null;
  created_at: string;
}
