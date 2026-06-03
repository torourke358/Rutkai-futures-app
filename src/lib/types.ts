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
  created_at: string;
  updated_at: string;
}

export interface AiQuestionRow {
  id: string;
  user_id: string;
  question: string;
  answer: string | null;
  created_at: string;
}
