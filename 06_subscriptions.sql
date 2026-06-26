-- ============================================
-- Thor — Phase 1 (SaaS): per-user subscription / plan state
--
-- DO NOT AUTO-RUN. Apply MANUALLY in the Supabase SQL Editor AFTER 01–05.
-- Idempotent — safe to re-run.
--
-- One row per user holding their tier (free|pro|elite) and Stripe linkage. The
-- app defaults a user to "free" when no row exists, so this is safe to apply
-- before billing is wired. The Stripe webhook (Phase 2) updates tier/status via
-- the service-role client.
-- ============================================

create table if not exists subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  tier                   text not null default 'free' check (tier in ('free','pro','elite')),
  status                 text not null default 'active'
                           check (status in ('active','trialing','past_due','canceled','incomplete')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  grace_until            timestamptz,
  updated_at             timestamptz not null default now()
);
create index if not exists idx_subscriptions_customer
  on subscriptions(stripe_customer_id) where stripe_customer_id is not null;

drop trigger if exists subscriptions_updated_at on subscriptions;
create trigger subscriptions_updated_at before update on subscriptions
  for each row execute procedure update_updated_at();

-- Backfill a free row for existing users (the app also defaults to free in code,
-- so this is just to make the rows explicit).
insert into subscriptions (user_id, tier, status)
select id, 'free', 'active' from auth.users
on conflict (user_id) do nothing;

-- ---------- RLS ----------
alter table subscriptions enable row level security;

drop policy if exists "Read own subscription" on subscriptions;
create policy "Read own subscription" on subscriptions
  for select using (auth.uid() = user_id);
-- No own-row WRITE policy on purpose: subscription changes come from the Stripe
-- webhook via the service-role client (bypasses RLS), never the browser.
