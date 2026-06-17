# Thor — Trade Journal (Phase 1)

A trade-journal + analytics PWA for Craig Crutkai. Replaces TradeTracker Pro.
Reads CSV exports (NinjaTrader 8 Executions), pairs fills into closed
round-trip trades, and surfaces analytics + Claude-powered Q&A over the
trader's own history.

This app does NOT place, modify, or recommend trades. Read-only journal.

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
  (`claude-opus-4-8`), chat panel with suggested questions
- PWA (manifest, SVG icons, conservative service worker) + admin audit viewer
- Auth (Supabase SSR, three-client split, proxy refresh), dark app shell

Run `npm test` (pairing + risk + analytics) and `npm run build` to verify.

## Set up

```bash
# 1. Install deps
npm install

# 2. Create a NEW Supabase project (separate from yacht-ops + petty-cash).
#    Run 01_trade_journal_schema.sql, then 02_trade_journal_phase2.sql,
#    in the SQL Editor.

# 3. Copy .env.example → .env.local and fill in:
#    - NEXT_PUBLIC_SUPABASE_URL
#    - NEXT_PUBLIC_SUPABASE_ANON_KEY
#    - SUPABASE_SERVICE_ROLE_KEY  (server only — never commit)
#    - ANTHROPIC_API_KEY          (server only — never commit)
#    - CLAUDE_MODEL=claude-opus-4-8

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
- **Dark theme by default.** Calm slate background, indigo single accent,
  emerald/rose for P&L. Min 16px inputs to stop iOS zoom.

## Phase 1 acceptance checklist

See the build brief in `../thor_phase1_journal_prompt.md` for the full
14-item list.
