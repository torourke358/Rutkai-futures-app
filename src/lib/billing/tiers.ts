// Subscription tiers + the feature → minimum-tier map. The single source of
// truth for what each plan unlocks. Pure (no imports) so it runs on client and
// server and is unit-tested directly. Billing/Stripe is wired to these in a
// later phase; until then everything resolves to "free" unless a subscription
// row says otherwise.

export type Tier = "free" | "pro" | "elite";
export const TIERS: Tier[] = ["free", "pro", "elite"];
export const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2 };
export const TIER_LABELS: Record<Tier, string> = { free: "Free", pro: "Pro", elite: "Elite" };

export type Feature =
  | "journal" // dashboard, trades, executions import
  | "ai_review" // descriptive AI Q&A
  | "engine" // recommendation engine, strategy, paper
  | "whatif" // what-if sweep
  | "prop_rules" // prop-firm rules checker
  | "bars_import" // OHLCV bar import + charts
  | "byok"; // bring-your-own LLM key

export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  journal: "free",
  ai_review: "free",
  engine: "pro",
  whatif: "pro",
  prop_rules: "pro",
  bars_import: "pro",
  byok: "elite",
};

export function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return tierAtLeast(tier, FEATURE_MIN_TIER[feature]);
}

// Pricing-page copy: what each tier adds. Prices are placeholders until Stripe
// products are created (Phase 2).
export const TIER_SUMMARY: Record<
  Tier,
  { price: string; blurb: string; features: string[] }
> = {
  free: {
    price: "$0",
    blurb: "Journal and analyze your futures trades.",
    features: [
      "Import + FIFO trade pairing",
      "Dashboard analytics — MAE/MFE, equity, drawdown, P&L calendar",
      "Descriptive AI review of your history",
    ],
  },
  pro: {
    price: "—",
    blurb: "The full regulated, paper-only engine.",
    features: [
      "Everything in Free",
      "Paper recommendation engine + human approval ticket",
      "What-if counterfactual sweep",
      "Prop-firm rules checker",
      "Bar-data import & candlestick charts",
    ],
  },
  elite: {
    price: "—",
    blurb: "Bring your own LLM key.",
    features: [
      "Everything in Pro",
      "Bring-your-own-key LLM (any provider)",
      "Priority support + advanced analytics",
    ],
  },
};
