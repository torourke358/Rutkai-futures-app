-- ============================================
-- Thor — Phase 5: market-data summary helper
--
-- DO NOT AUTO-RUN. Apply MANUALLY in the Supabase SQL Editor AFTER 01–04.
-- Idempotent — safe to re-run.
--
-- Adds a tiny function the app calls to show "how many bars per instrument /
-- timeframe" at a glance, so a mis-targeted bar import (e.g. bars landing on CL
-- instead of NQ) is obvious immediately. The aggregation runs in the DB; the
-- app never pulls bar rows just to count them.
-- ============================================

create or replace function public.bars_summary()
returns table (
  symbol     text,
  timeframe  text,
  bar_count  bigint,
  first_ts   timestamptz,
  last_ts    timestamptz
)
language sql
stable
security invoker          -- runs as the caller; RLS on bars/instruments applies
set search_path = public
as $$
  select i.symbol,
         b.timeframe,
         count(*)::bigint as bar_count,
         min(b.ts)        as first_ts,
         max(b.ts)        as last_ts
  from public.bars b
  join public.instruments i on i.id = b.instrument_id
  where b.user_id = auth.uid()
  group by i.symbol, b.timeframe
  order by i.symbol, b.timeframe;
$$;

grant execute on function public.bars_summary() to authenticated;
