# Thor — Trade Journal (Phase 1)

A trade-journal + analytics PWA for Craig Crutkai. Replaces TradeTracker Pro.
Reads CSV exports (NinjaTrader 8 Executions), pairs fills into closed
round-trip trades, and surfaces analytics + Claude-powered Q&A over the
trader's own history.

This app does NOT place, modify, or recommend trades. Read-only journal.

## Status

This is the **foundation pass**. What works end-to-end:

- Schema (`01_trade_journal_schema.sql`) — tables, RLS, audit, profile-create trigger
- FIFO pairing algorithm with unit tests (`src/lib/trades/pairing.ts`)
- CSV import parser with NT8 defaults (`src/lib/import/CsvImportSource.ts`)
- Analytics computation (`src/lib/analytics/stats.ts`)
- Anthropic wrapper + analyst system prompt (`src/lib/claude.ts`)
- Auth (Supabase SSR, three-client split, proxy refresh)
- App shell (dark theme, active-tab pill, sign-out)
- Page placeholders: `/dashboard`, `/trades`, `/import`, `/review`

What's NOT yet built (next passes):

- CSV upload UI + column-mapping flow + preview + undo-by-batch
- Pairing pipeline wired to the import flow + UPSERT into `trades`
- Manual trade entry form
- Dashboard charts: recharts equity curve + P&L calendar heatmap + breakdowns
- Trade list dense / sortable / inline-notes + trade detail page
- `/api/ask` route + chat panel for AI review
- PWA service worker + icons
- Audit log viewer for admin

## Set up

```bash
# 1. Install deps
npm install

# 2. Create a NEW Supabase project (separate from yacht-ops + petty-cash).
#    Run 01_trade_journal_schema.sql in the SQL Editor.

# 3. Copy .env.example → .env.local and fill in:
#    - NEXT_PUBLIC_SUPABASE_URL
#    - NEXT_PUBLIC_SUPABASE_ANON_KEY
#    - SUPABASE_SERVICE_ROLE_KEY  (server only — never commit)
#    - ANTHROPIC_API_KEY          (server only — never commit)
#    - CLAUDE_MODEL=claude-opus-4-7

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
