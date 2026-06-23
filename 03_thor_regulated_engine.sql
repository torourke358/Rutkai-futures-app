-- ============================================
-- Thor (Trade Journal) — Phase 3: regulated recommendation engine
--
-- DO NOT AUTO-RUN. Additive migration. Apply MANUALLY in the Supabase SQL
-- Editor AFTER 01_trade_journal_schema.sql and 02_trade_journal_phase2.sql,
-- in the same project. Idempotent — safe to re-run.
--
-- Adds the paper-only, human-gated engine surface:
--   instruments      per-user contract specs (point value, tick, timezone)
--   bars             user-imported OHLCV used for MAE/MFE + simulated fills
--   trades (cols)    planned stop/target + MAE/MFE/R-multiple analysis fields
--   strategy_configs owner-defined risk template + which entry plugin is active
--   trade_candidates engine output, status proposed|approved|rejected|expired
--   trade_decisions  the human approve/reject record
--   paper_trades     SIMULATED fills (is_simulated = true), kept separate from
--                    imported real `trades`
-- Plus: widens audit_log.action so propose/approve/reject/fill are recordable,
-- and lets a user read their OWN audit rows (in addition to admin read-all).
--
-- NOTE on instruments vs. the existing global `instrument_specs`: this file
-- intentionally adds a SEPARATE per-user `instruments` table (the engine FKs
-- bars/candidates to it and stores a per-user timezone). The four contracts
-- below are seeded per user with the same point values as instrument_specs.
-- ============================================

-- ---------- instruments (per-user contract specs) ----------
create table if not exists instruments (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  tick_size   numeric(18,8) not null,
  point_value numeric(18,6) not null,           -- USD per 1.00 point
  tz          text not null default 'America/Chicago',
  created_at  timestamptz not null default now(),
  unique (user_id, symbol)
);
create index if not exists idx_instruments_user on instruments(user_id);

-- ---------- bars (user-imported OHLCV) ----------
-- Per-user, per-instrument, per-timeframe. Timestamps are stored as timestamptz;
-- the importer parses NinjaTrader-style local timestamps in the instrument's tz
-- (never assumed UTC on Vercel), mirroring how executions are handled, so bars
-- and fills line up. The unique key makes re-importing the same export a no-op
-- (upsert) instead of duplicating bars.
create table if not exists bars (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  ts            timestamptz not null,
  open          numeric(18,6),
  high          numeric(18,6),
  low           numeric(18,6),
  close         numeric(18,6),
  volume        numeric(18,6),
  timeframe     text not null default '1m',
  created_at    timestamptz not null default now(),
  unique (instrument_id, timeframe, ts)
);
create index if not exists idx_bars_instr_tf_ts on bars(instrument_id, timeframe, ts);
create index if not exists idx_bars_user on bars(user_id);

-- ---------- trades: analysis additions ----------
-- planned_stop / planned_target stay OPTIONAL manual fields on imported trades.
-- MAE/MFE + r_multiple are filled by the excursion engine when bars exist.
alter table trades add column if not exists planned_stop_price   numeric(18,6);
alter table trades add column if not exists planned_target_price numeric(18,6);
alter table trades add column if not exists mae_points           numeric(18,6);
alter table trades add column if not exists mfe_points           numeric(18,6);
alter table trades add column if not exists mae_ts               timestamptz;
alter table trades add column if not exists mfe_ts               timestamptz;
alter table trades add column if not exists r_multiple           numeric(18,6);
alter table trades add column if not exists analysis_version     int not null default 1;

-- ---------- strategy_configs (owner risk template + active entry plugin) ----------
-- Generic, standard risk-management inputs owned by no one. One row may be
-- flagged is_active per user (enforced by the partial unique index below).
create table if not exists strategy_configs (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null default 'Default',
  entry_plugin_id       text not null default 'example_ma_cross',
  -- fixed-fractional sizing
  risk_pct              numeric(9,4)  not null default 0.5,   -- % of account per trade
  account_size_usd      numeric(18,6),
  -- defined-risk stop: 'fixed_points' uses stop_value as points;
  -- 'atr_multiple' uses stop_value as the ATR multiple over atr_period bars.
  stop_mode             text not null default 'fixed_points'
                          check (stop_mode in ('fixed_points','atr_multiple')),
  stop_value            numeric(18,6) not null default 20,
  atr_period            int not null default 14,
  -- required minimum reward:risk; target placed at target_r * stop distance
  min_rr                numeric(9,4)  not null default 1.5,
  target_r              numeric(9,4)  not null default 2,
  -- session guardrails (null = disabled)
  daily_loss_limit_usd  numeric(18,6),
  max_trades_per_day    int,
  max_risk_per_trade_usd numeric(18,6),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- At most one active config per user.
create unique index if not exists uq_strategy_active_per_user
  on strategy_configs(user_id) where is_active;

drop trigger if exists strategy_configs_updated_at on strategy_configs;
create trigger strategy_configs_updated_at before update on strategy_configs
  for each row execute procedure update_updated_at();

-- ---------- trade_candidates (engine output) ----------
create table if not exists trade_candidates (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  instrument_id      uuid references instruments(id) on delete set null,
  strategy_config_id uuid references strategy_configs(id) on delete set null,
  direction          text check (direction in ('long','short')),
  entry_price        numeric(18,6),
  stop_price         numeric(18,6),
  target_price       numeric(18,6),
  size               numeric(18,6),
  rr_ratio           numeric(9,4),
  risk_usd           numeric(18,6),
  entry_plugin_id    text,
  rationale_tag      text,
  -- The bar the entry signal fired on. Anchors the simulated-fill window at
  -- approval time (we walk bars AFTER this), since wall-clock "now" is past all
  -- imported historical bars.
  signal_bar_ts      timestamptz,
  timeframe          text not null default '1m',
  status             text not null default 'proposed'
                       check (status in ('proposed','approved','rejected','expired')),
  generated_at       timestamptz not null default now(),
  expires_at         timestamptz
);
create index if not exists idx_candidates_user_status
  on trade_candidates(user_id, status, generated_at desc);

-- ---------- trade_decisions (human approval record) ----------
create table if not exists trade_decisions (
  id           uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references trade_candidates(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  decision     text not null check (decision in ('approved','rejected')),
  decided_at   timestamptz not null default now()
);
create index if not exists idx_decisions_user on trade_decisions(user_id, decided_at desc);

-- ---------- paper_trades (SIMULATED fills only) ----------
-- Kept strictly separate from imported real `trades`. is_simulated is always
-- true in this build; there is no live path that could write is_simulated=false.
create table if not exists paper_trades (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  candidate_id  uuid references trade_candidates(id) on delete set null,
  instrument_id uuid references instruments(id) on delete set null,
  direction     text check (direction in ('long','short')),
  fill_price    numeric(18,6),
  size          numeric(18,6),
  stop_price    numeric(18,6),
  target_price  numeric(18,6),
  exit_price    numeric(18,6),
  exit_reason   text check (exit_reason in ('target','stop','eod','none')),
  risk_usd      numeric(18,6),
  point_value   numeric(18,6) not null default 1,
  pnl_usd       numeric(18,6),
  entry_ts      timestamptz,
  exit_ts       timestamptz,
  is_simulated  boolean not null default true,
  filled_at     timestamptz not null default now()
);
create index if not exists idx_paper_trades_user on paper_trades(user_id, filled_at desc);

-- ---------- audit_log: widen action set + allow own-row read ----------
-- The Phase 1 CHECK only allowed create|update|delete|import. The engine also
-- records propose|approve|reject|fill, so relax it.
alter table audit_log drop constraint if exists audit_log_action_check;
alter table audit_log add constraint audit_log_action_check
  check (action in ('create','update','delete','import','propose','approve','reject','fill'));

-- ---------- new-user seed: instruments + a default strategy_config ----------
-- Redefine the handler so every new auth user also gets the four common
-- contracts and one active default strategy. SECURITY DEFINER with empty
-- search_path => all object refs MUST be schema-qualified (Supabase's auth
-- service runs this with a search_path that excludes `public`).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'trader')
  on conflict (id) do nothing;

  insert into public.risk_settings (user_id, method, default_risk_dollars, configured)
  values (new.id, 'flat', 200, false)
  on conflict (user_id) do nothing;

  insert into public.instruments (user_id, symbol, tick_size, point_value, tz) values
    (new.id, 'NQ', 0.25, 20,   'America/Chicago'),
    (new.id, 'ES', 0.25, 50,   'America/Chicago'),
    (new.id, 'YM', 1,    5,    'America/Chicago'),
    (new.id, 'CL', 0.01, 1000, 'America/Chicago')
  on conflict (user_id, symbol) do nothing;

  insert into public.strategy_configs (user_id, name, entry_plugin_id)
  values (new.id, 'Default', 'example_ma_cross')
  on conflict do nothing;

  return new;
end;
$$;

-- Backfill for any pre-existing users.
insert into instruments (user_id, symbol, tick_size, point_value, tz)
select u.id, v.symbol, v.tick_size, v.point_value, 'America/Chicago'
from auth.users u
cross join (values
  ('NQ', 0.25::numeric, 20::numeric),
  ('ES', 0.25,          50),
  ('YM', 1,             5),
  ('CL', 0.01,          1000)
) as v(symbol, tick_size, point_value)
on conflict (user_id, symbol) do nothing;

-- One active default strategy for any user who has none.
insert into strategy_configs (user_id, name, entry_plugin_id)
select u.id, 'Default', 'example_ma_cross'
from auth.users u
where not exists (
  select 1 from strategy_configs s where s.user_id = u.id and s.is_active
)
on conflict do nothing;

-- ---------- RLS ----------
alter table instruments      enable row level security;
alter table bars             enable row level security;
alter table strategy_configs enable row level security;
alter table trade_candidates enable row level security;
alter table trade_decisions  enable row level security;
alter table paper_trades     enable row level security;

drop policy if exists "RW own instruments" on instruments;
create policy "RW own instruments" on instruments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RW own bars" on bars;
create policy "RW own bars" on bars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RW own strategy_configs" on strategy_configs;
create policy "RW own strategy_configs" on strategy_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RW own trade_candidates" on trade_candidates;
create policy "RW own trade_candidates" on trade_candidates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RW own trade_decisions" on trade_decisions;
create policy "RW own trade_decisions" on trade_decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RW own paper_trades" on paper_trades;
create policy "RW own paper_trades" on paper_trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- audit_log: keep admin read-all (from Phase 1) and add own-row read. Writes
-- still go through the service-role client in app code.
drop policy if exists "Read own audit" on audit_log;
create policy "Read own audit" on audit_log
  for select using (auth.uid() = user_id or is_admin());
