import type { PropRules } from "./propRules";

// Pre-loaded rule sets for the top US futures prop firms, so a user can pick
// their firm + account (and phase) and have the checker auto-populate.
//
// IMPORTANT: prop-firm rules change often and vary by plan/account/phase. These
// reflect the common EVALUATION and FUNDED accounts for each firm as of the date
// below — always confirm the live numbers with your firm. Every field stays
// editable after you select.
//
// NOTE on funded phases: several firms switch to INTRADAY trailing drawdown once
// funded. This checker measures drawdown on your closed-trade equity, so an
// intraday-trailing rule is APPROXIMATED (real intraday is harsher). Funded
// phases also typically drop the eval consistency rule.
//
// Sources (June 2026): apextraderfunding.com, help.topstep.com,
// help.myfundedfutures.com, takeprofittrader.com and current rule summaries.

export const PROP_FIRMS_AS_OF = "June 2026";

export interface FirmAccount {
  label: string;
  rules: PropRules;
}

export interface PropFirm {
  name: string;
  note: string;
  accounts: FirmAccount[];
}

// Builder for a trailing-drawdown rule set.
function r(
  startingBalance: number,
  dailyLossLimit: number | null,
  maxDrawdown: number,
  consistencyPct: number | null,
  maxContracts: number,
  minTradingDays: number | null = null,
): PropRules {
  return {
    startingBalance,
    dailyLossLimit,
    maxDrawdown,
    drawdownType: "trailing",
    consistencyPct,
    maxContracts,
    minTradingDays,
  };
}

export const PROP_FIRMS: PropFirm[] = [
  {
    name: "Apex Trader Funding",
    note: "4.0, EOD trailing. Eval is one-step. Funded (PA) caps contracts and locks the trailing drawdown at +$100 once you reach the threshold; 50% consistency applies to payouts.",
    accounts: [
      { label: "25K · Eval", rules: r(25000, 500, 1500, 50, 4) },
      { label: "50K · Eval", rules: r(50000, 1000, 2500, 50, 6) },
      { label: "100K · Eval", rules: r(100000, 1500, 3000, 50, 8) },
      { label: "150K · Eval", rules: r(150000, 2000, 5000, 50, 12) },
      { label: "25K · Funded (PA)", rules: r(25000, 500, 1500, 50, 2) },
      { label: "50K · Funded (PA)", rules: r(50000, 1000, 2500, 50, 4) },
      { label: "100K · Funded (PA)", rules: r(100000, 1500, 3000, 50, 6) },
      { label: "150K · Funded (PA)", rules: r(150000, 2000, 5000, 50, 9) },
    ],
  },
  {
    name: "Topstep",
    note: "Trading Combine (eval) vs Express Funded (no consistency on the Standard path). Max Loss Limit is EOD trailing. Topstep's consistency rule is best day < 50% of the profit target; this checker measures it against net profit.",
    accounts: [
      { label: "50K · Combine", rules: r(50000, 1000, 2000, 50, 5) },
      { label: "100K · Combine", rules: r(100000, 2000, 3000, 50, 10) },
      { label: "150K · Combine", rules: r(150000, 3000, 4500, 50, 15) },
      { label: "50K · Funded", rules: r(50000, 1000, 2000, null, 5) },
      { label: "100K · Funded", rules: r(100000, 2000, 3000, null, 10) },
      { label: "150K · Funded", rules: r(150000, 3000, 4500, null, 15) },
    ],
  },
  {
    name: "Take Profit Trader",
    note: "Test (eval, EOD trailing, 50% consistency, 5 min days, no daily loss limit). PRO funded switches to intraday trailing (approximated here) and drops the consistency rule.",
    accounts: [
      { label: "25K · Test", rules: r(25000, null, 1500, 50, 3, 5) },
      { label: "50K · Test", rules: r(50000, null, 2000, 50, 6, 5) },
      { label: "100K · Test", rules: r(100000, null, 3000, 50, 12, 5) },
      { label: "150K · Test", rules: r(150000, null, 4500, 50, 15, 5) },
      { label: "25K · PRO (funded)", rules: r(25000, null, 1500, null, 3) },
      { label: "50K · PRO (funded)", rules: r(50000, null, 2000, null, 6) },
      { label: "100K · PRO (funded)", rules: r(100000, null, 3000, null, 12) },
      { label: "150K · PRO (funded)", rules: r(150000, null, 4500, null, 15) },
    ],
  },
  {
    name: "My Funded Futures",
    note: "Core (eval, EOD trailing, 50% consistency). Funded / Rapid uses intraday trailing (approximated here). No daily loss limit except the Builder plan.",
    accounts: [
      { label: "50K · Core (eval)", rules: r(50000, null, 2000, 50, 5) },
      { label: "100K · Core (eval)", rules: r(100000, null, 3000, 50, 10) },
      { label: "150K · Core (eval)", rules: r(150000, null, 4500, 50, 15) },
      { label: "50K · Funded", rules: r(50000, null, 2000, null, 5) },
      { label: "100K · Funded", rules: r(100000, null, 3000, null, 10) },
      { label: "150K · Funded", rules: r(150000, null, 4500, null, 15) },
    ],
  },
];
