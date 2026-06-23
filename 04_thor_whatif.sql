-- ============================================
-- Thor — Phase 4: What-if sweep persistence
--
-- DO NOT AUTO-RUN. Additive migration. Apply MANUALLY in the Supabase SQL
-- Editor AFTER 01/02/03. Idempotent — safe to re-run.
--
-- Persists each what-if run's parameter set + per-trade counterfactual results
-- so any figure can be re-derived/audited. Monetary aggregates are stored as
-- integer CENTS (e.g. net_pnl_cents) to match the money-math refactor; the UI
-- formats to dollars only at the edge.
-- ============================================

create table if not exists whatif_runs (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  params         jsonb not null,         -- { stopPoints, targetR, exitRule, instrument? }
  result_summary jsonb not null,         -- aggregate deltas (rescued, deepened, net_pnl_cents, …)
  per_trade      jsonb not null,         -- per-trade counterfactual rows, for reproducibility/audit
  narration      text,                   -- optional AI narration of the deterministic result
  created_at     timestamptz not null default now()
);
create index if not exists idx_whatif_user on whatif_runs(user_id, created_at desc);

alter table whatif_runs enable row level security;

drop policy if exists "RW own whatif_runs" on whatif_runs;
create policy "RW own whatif_runs" on whatif_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- audit_log already accepts the engine verbs; what-if runs are recorded with
-- action='create' (a what-if run is a saved analysis artifact, not an order).
