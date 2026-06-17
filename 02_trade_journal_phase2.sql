-- ============================================
-- Thor (Trade Journal) — Phase 2 schema
-- Additive migration. Run AFTER 01_trade_journal_schema.sql in the same
-- Supabase project. Safe to re-run (idempotent).
--
-- Adds: risk_settings (per-user, 3 selectable R-models), cash_flows
-- (deposits/withdrawals for the auto-tracked-equity model), instrument_specs
-- (futures point multipliers so realized P&L is in true dollars), and extra
-- columns on trades (per-trade risk override, point_value snapshot, rating,
-- tags).
-- ============================================

-- ---------- risk_settings ----------
-- One row per user. The R-multiple formula (R = net P&L / risk) is the only
-- thing hardwired in code; every input below is user-editable. `method`
-- chooses which inputs are used:
--   'flat'           -> default_risk_dollars
--   'percent_static' -> risk_percent * account_balance
--   'percent_equity' -> risk_percent * (starting_balance + cash flows + realized P&L to date)
create table if not exists risk_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  method               text not null default 'flat'
                         check (method in ('flat','percent_static','percent_equity')),
  default_risk_dollars numeric(18,6),
  account_balance      numeric(18,6),
  risk_percent         numeric(9,4),
  starting_balance     numeric(18,6),
  starting_at          timestamptz,
  configured           boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists risk_settings_updated_at on risk_settings;
create trigger risk_settings_updated_at before update on risk_settings
  for each row execute procedure update_updated_at();

-- ---------- cash_flows (deposits / withdrawals) ----------
-- Only consumed by the 'percent_equity' model. Amount is signed:
-- positive = deposit, negative = withdrawal.
create table if not exists cash_flows (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      numeric(18,6) not null,
  occurred_at timestamptz not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cash_flows_user on cash_flows(user_id, occurred_at);

-- ---------- instrument_specs (futures point multipliers) ----------
-- Global lookup: symbol root -> dollars per 1.00 point of price movement.
-- Applied in pairing so realized P&L is in true dollars. Unknown symbols
-- fall back to 1x in code. Editable by admins; seeded with common contracts.
create table if not exists instrument_specs (
  symbol      text primary key,
  point_value numeric(18,6) not null default 1,
  tick_size   numeric(18,8),
  description text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists instrument_specs_updated_at on instrument_specs;
create trigger instrument_specs_updated_at before update on instrument_specs
  for each row execute procedure update_updated_at();

-- Seed common CME/CBOT/NYMEX/COMEX contracts. on conflict do nothing so
-- re-running never clobbers admin edits.
insert into instrument_specs (symbol, point_value, tick_size, description) values
  ('ES',  50,    0.25,    'E-mini S&P 500'),
  ('MES',  5,    0.25,    'Micro E-mini S&P 500'),
  ('NQ',  20,    0.25,    'E-mini Nasdaq-100'),
  ('MNQ',  2,    0.25,    'Micro E-mini Nasdaq-100'),
  ('RTY', 50,    0.10,    'E-mini Russell 2000'),
  ('M2K',  5,    0.10,    'Micro E-mini Russell 2000'),
  ('YM',   5,    1,       'E-mini Dow'),
  ('MYM',  0.5,  1,       'Micro E-mini Dow'),
  ('CL',   1000, 0.01,    'Crude Oil'),
  ('MCL',  100,  0.01,    'Micro Crude Oil'),
  ('NG',   10000,0.001,   'Natural Gas'),
  ('GC',   100,  0.10,    'Gold'),
  ('MGC',  10,   0.10,    'Micro Gold'),
  ('SI',   5000, 0.005,   'Silver'),
  ('SIL',  1000, 0.005,   'Micro Silver'),
  ('HG',   25000,0.0005,  'Copper'),
  ('ZB',   1000, 0.03125, '30-Year T-Bond'),
  ('ZN',   1000, 0.015625,'10-Year T-Note'),
  ('ZF',   1000, 0.0078125,'5-Year T-Note'),
  ('ZT',   2000, 0.0078125,'2-Year T-Note'),
  ('6E',   125000,0.00005,'Euro FX'),
  ('6B',   62500, 0.0001, 'British Pound'),
  ('6A',   100000,0.00005,'Australian Dollar'),
  ('6C',   100000,0.00005,'Canadian Dollar'),
  ('6J',   12500000,0.0000005,'Japanese Yen')
on conflict (symbol) do nothing;

-- ---------- trades additions ----------
alter table trades add column if not exists risk_amount numeric(18,6);
alter table trades add column if not exists point_value numeric(18,6) not null default 1;
alter table trades add column if not exists rating smallint;
alter table trades add column if not exists tags text[];

-- ---------- profile-create trigger: also seed a risk_settings row ----------
-- Redefine the new-user handler so every new auth user gets BOTH a profile
-- and a default (unconfigured) risk_settings row.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into user_profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'trader')
  on conflict (id) do nothing;

  insert into risk_settings (user_id, method, default_risk_dollars, configured)
  values (new.id, 'flat', 200, false)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Backfill a default risk_settings row for any pre-existing users.
insert into risk_settings (user_id, method, default_risk_dollars, configured)
select id, 'flat', 200, false from auth.users
on conflict (user_id) do nothing;

-- ---------- RLS ----------
alter table risk_settings    enable row level security;
alter table cash_flows       enable row level security;
alter table instrument_specs enable row level security;

drop policy if exists "RW own risk_settings" on risk_settings;
create policy "RW own risk_settings" on risk_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RW own cash_flows" on cash_flows;
create policy "RW own cash_flows" on cash_flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Instrument specs are shared reference data: everyone reads, admins write.
drop policy if exists "Read instrument_specs" on instrument_specs;
create policy "Read instrument_specs" on instrument_specs for select using (true);
drop policy if exists "Admin writes instrument_specs" on instrument_specs;
create policy "Admin writes instrument_specs" on instrument_specs
  for all using (is_admin()) with check (is_admin());
