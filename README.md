# Thor — Futures Journal & Recommendation Engine

A trade-journal + analytics PWA for Craig Crutkai, plus a **paper-only,
human-gated** futures recommendation engine (Phase 3). Reads CSV exports
(NinjaTrader 8 Executions + OHLCV bars), pairs fills into closed round-trip
trades, and surfaces MAE/MFE analytics + Claude-powered descriptive Q&A over
the trader's own history.

The engine proposes per-trade candidates from the owner's configured strategy;
nothing reaches even the paper account without an explicit per-trade **Approve**.
There is **no live broker connection and no live-money routing** anywhere
(`LIVE_EXECUTION_ENABLED = false`). No performance/profit claims; simulated
figures carry a hypothetical-results disclaimer. See
`/about/regulatory-design`.

## Status

Phase 1 + the TradeZella-depth analytics build are complete. What works
end-to-end:

- Schema — `01_trade_journal_schema.sql` (core) + `02_trade_journal_phase2.sql`
  (risk model, cash flows, instrument multipliers, trade annotations)
- FIFO pairing with futures point multipliers + unit tests (`src/lib/trades/pairing.ts`)
- CSV import: drag/drop UI, column-mapping (NT8 defaults + remembered),
  preview, `/api/import` → pair → UPSERT, and undo-by-batch
  (`src/components/ImportWizard.tsx`, `src/lib/trades/repair.ts`)
- Manual trade entry (writes executions → re-pairs)
- Risk model: three user-selectable methods (flat $, % of static balance,
  % of auto-tracked equity); only `R = net P&L ÷ risk` is hardwired
  (`src/lib/risk.ts`, `/account/settings`)
- Analytics: expectancy ($ and R), profit factor, payoff, drawdown curve,
  streaks, R-distribution, and win-rate/expectancy/avg-R sliced by
  setup / instrument / day-of-week / hour (`src/lib/analytics/stats.ts`)
- Dashboard: recharts equity + drawdown curves, R histogram, P&L calendar
  heatmap, breakdown panels, global filters (date/symbol/setup/direction)
- Trades: dense sortable/filterable table, inline notes, trade detail page with
  setup/tags/rating/notes/risk-override editing
- AI review: `/api/ask` summarizes history server-side and calls Claude
  (`claude-sonnet-4-6`), with a prescriptive-language lint that regenerates once
  then falls back to raw metrics; chat panel with suggested questions
- PWA (manifest, SVG icons, conservative service worker) + admin audit viewer
- Auth (Supabase SSR, three-client split, proxy refresh)

### Phase 3 — regulated engine (paper-only, human-gated)

- Schema — `03_thor_regulated_engine.sql` (instruments, bars, strategy_configs,
  trade_candidates, trade_decisions, paper_trades; MAE/MFE columns on trades;
  widened `audit_log.action`). **Generate-only — apply it manually.**
- MAE/MFE/R-multiple engine over imported bars + candlestick drilldown with
  entry/exit/MAE/MFE markers and stop/target lines (`src/lib/analytics/excursion.ts`,
  `src/components/charts/CandleChart.tsx`)
- Generic risk/sizing/exit template + session guardrails (`src/lib/engine/riskTemplate.ts`)
- Pluggable `EntryStrategy` interface + one labeled placeholder
  (`example_ma_cross` — EXAMPLE ONLY, not an edge)
- `BrokerAdapter` with only `SimBrokerAdapter` implemented; `LiveBrokerAdapter`
  unimplemented behind `LIVE_EXECUTION_ENABLED = false`
- Engine page: generate → **trade ticket** (signature approval card with price
  ladder) → Approve → simulated `paper_trade`, all audited
  (`src/app/(app)/engine`, `src/components/TradeTicket.tsx`)
- Light "instrument panel" theme app-wide; `/about/regulatory-design` for counsel

### Phase 4 — what-if sweep + money-math refactor

- **Integer money math** (`src/lib/money.ts`): all P&L/price math is integer
  cents/ticks with one half-away-from-zero rounding rule — no raw-float drift.
  Applied to the MAE/MFE engine, the risk template, and the sim fill.
- **What-if sweep** (`src/lib/analysis/whatif.ts`): a pure, deterministic,
  bit-for-bit reproducible counterfactual that re-runs EVERY selected past trade
  under a different parameter (stop distance / exit rule / target R), modelling
  rescued winners AND deepened losers (no survivorship bias). UI at `/whatif`.
- **Two-role AI**: the model only maps a question → params (`src/lib/ai/params.ts`,
  with a deterministic offline fallback) and narrates already-computed results
  (`src/lib/ai/narrate.ts`), behind the prescriptive-language lint. It never
  originates a figure or computes P&L.
- Schema — `04_thor_whatif.sql` (`whatif_runs`, integer-cent aggregates).
  **Generate-only — apply it manually.**

Run `npm test` (pairing, risk, analytics, excursion, lint, risk template, sim
fill, money, what-if — 78 tests) and `npm run build` to verify.

## Set up

```bash
# 1. Install deps
npm install

# 2. Create a NEW Supabase project (separate from yacht-ops + petty-cash).
#    Run 01_trade_journal_schema.sql, then 02_trade_journal_phase2.sql,
#    then 03_thor_regulated_engine.sql, then 04_thor_whatif.sql, in the SQL Editor.

# 3. Copy .env.example → .env.local and fill in:
#    - NEXT_PUBLIC_SUPABASE_URL
#    - NEXT_PUBLIC_SUPABASE_ANON_KEY
#    - SUPABASE_SERVICE_ROLE_KEY  (server only — never commit)
#    - ANTHROPIC_API_KEY          (server only — never commit)
#    - CLAUDE_MODEL=claude-sonnet-4-6

# 4. Provision the first user via Supabase Auth dashboard (no public signup).
#    Sign-in form is at /login.

# 5. Dev
npm run dev

# 6. Run pairing unit tests
npm test
```

## Architecture notes

- **Single Supabase project per app.** The trade journal stores potentially
  sensitive financial data; isolate it from the yacht/cash app to keep the
  blast radius small.
- **Pairing is a pure function.** Same executions → same trades. Re-running
  after a new import UPSERTs by `pairing_key` so we never double-emit.
- **ImportSource interface** keeps the CSV path swappable for a future
  broker-API adapter (Alpaca / IBKR / Tradovate). Don't bake CSV assumptions
  into pages or routes.
- **Claude API is server-side only.** `/api/ask` will summarize the user's
  history server-side before calling Anthropic; the API key never reaches
  the browser.
- **Light "instrument panel" theme.** Quiet light surfaces; color is reserved
  to carry meaning — `--gain`/`--loss` for money, `--long`/`--short` for
  direction, and `--accent` (indigo) used ONLY for the Approve button. Min 16px
  inputs to stop iOS zoom; visible focus + reduced-motion respected.
- **Paper-only broker boundary.** `BrokerAdapter` defines the contract; only
  `SimBrokerAdapter` is implemented (fills approved candidates against imported
  bars). `LiveBrokerAdapter` is intentionally unimplemented behind
  `LIVE_EXECUTION_ENABLED = false` with its preconditions documented in code.
- **Engine proposes; the human approves.** Candidate generation is always
  user-triggered; the per-trade Approve gate is the one place `--accent` appears.

## Phase 1 acceptance checklist

See the build brief in `../thor_phase1_journal_prompt.md` for the full
14-item list.
