-- ============================================
-- Thor (Trade Journal) — Phase 1 schema
-- Separate Supabase project from the yacht-ops + petty-cash one.
-- Create a NEW Supabase project, then run this in SQL Editor.
-- Safe to re-run.
-- ============================================

create extension if not exists "uuid-ossp";

-- ---------- profiles ----------
create table if not exists user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'trader' check (role in ('trader','admin')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth.users row is inserted.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into user_profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'trader')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from user_profiles
     where id = auth.uid() and role = 'admin' and active
  );
$$ language sql security definer stable;

-- ---------- executions (raw fills) ----------
create table if not exists executions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete restrict,
  symbol        text not null,
  side          text not null check (side in ('buy','sell')),
  quantity      numeric(18,6) not null check (quantity > 0),
  price         numeric(18,6) not null check (price >= 0),
  fees          numeric(18,6) not null default 0,
  executed_at   timestamptz not null,
  source        text not null default 'csv' check (source in ('csv','manual','broker_api')),
  import_batch  uuid,
  raw           jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_executions_user_time on executions(user_id, executed_at);
create index if not exists idx_executions_symbol    on executions(user_id, symbol);
create index if not exists idx_executions_batch     on executions(import_batch) where import_batch is not null;

-- ---------- trades (closed round-trips, derived) ----------
create table if not exists trades (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete restrict,
  symbol          text not null,
  direction       text not null check (direction in ('long','short')),
  quantity        numeric(18,6) not null check (quantity > 0),
  entry_price     numeric(18,6) not null,
  exit_price      numeric(18,6),
  entry_at        timestamptz not null,
  exit_at         timestamptz,
  fees            numeric(18,6) not null default 0,
  realized_pnl    numeric(18,6),
  status          text not null default 'open' check (status in ('open','closed')),
  setup_tag       text,
  notes           text,
  -- Natural key — used to make re-pairing idempotent. If the same trade
  -- re-emerges from pairing we UPSERT on this key. Maintained by the
  -- set_trade_pairing_key() trigger below (NOT a generated column: the
  -- timestamptz expressions are only STABLE, not IMMUTABLE, which a generated
  -- column rejects with 42P17).
  pairing_key     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists uq_trades_pairing_key on trades(pairing_key);
create index if not exists idx_trades_user_exit on trades(user_id, exit_at desc);
create index if not exists idx_trades_user_symbol on trades(user_id, symbol);
create index if not exists idx_trades_setup_tag   on trades(user_id, setup_tag) where setup_tag is not null;

create or replace function update_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trades_updated_at on trades;
create trigger trades_updated_at before update on trades
  for each row execute procedure update_updated_at();

-- Compute pairing_key on insert/update. Same formula the generated column
-- used; lives in a trigger so the STABLE timestamptz functions are allowed.
create or replace function set_trade_pairing_key() returns trigger as $$
begin
  new.pairing_key :=
    new.user_id || '|' || new.symbol || '|' || new.direction || '|' ||
    extract(epoch from new.entry_at)::text || '|' ||
    coalesce(extract(epoch from new.exit_at)::text, 'open') || '|' ||
    new.quantity::text;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trades_pairing_key on trades;
create trigger trades_pairing_key before insert or update on trades
  for each row execute procedure set_trade_pairing_key();

-- ---------- column-mapping memory ----------
-- Persist the user's last CSV column mapping so the second import is zero clicks.
create table if not exists import_mappings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  mapping    jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- AI Q&A session history ----------
create table if not exists ai_questions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete restrict,
  question   text not null,
  answer     text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_questions_user on ai_questions(user_id, created_at desc);

-- ---------- audit ----------
create table if not exists audit_log (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id),
  entity_type  text not null,
  entity_id    uuid,
  action       text not null check (action in ('create','update','delete','import')),
  before_state jsonb,
  after_state  jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_user on audit_log(user_id, created_at desc);

-- ---------- RLS ----------
alter table user_profiles   enable row level security;
alter table executions      enable row level security;
alter table trades          enable row level security;
alter table import_mappings enable row level security;
alter table ai_questions    enable row level security;
alter table audit_log       enable row level security;

drop policy if exists "Read all profiles" on user_profiles;
create policy "Read all profiles" on user_profiles for select using (true);
drop policy if exists "Update own profile" on user_profiles;
create policy "Update own profile" on user_profiles
  for update using (auth.uid() = id or is_admin());

drop policy if exists "RW own executions" on executions;
create policy "RW own executions" on executions
  for all using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id);

drop policy if exists "RW own trades" on trades;
create policy "RW own trades" on trades
  for all using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id);

drop policy if exists "RW own import_mappings" on import_mappings;
create policy "RW own import_mappings" on import_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "RW own ai_questions" on ai_questions;
create policy "RW own ai_questions" on ai_questions
  for all using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id);

drop policy if exists "Admin reads audit" on audit_log;
create policy "Admin reads audit" on audit_log for select using (is_admin());
