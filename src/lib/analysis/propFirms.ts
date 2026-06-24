import type { PropRules } from "./propRules";

// Pre-loaded rule sets for the top US futures prop firms, so a user can pick
// their firm + account size and have the checker auto-populate.
//
// IMPORTANT: prop-firm rules change often and vary by plan/account/phase. These
// reflect the common one-step EVALUATION account for each firm as of the date
// below — always confirm the live numbers with your firm. Every field stays
// editable after you select.
//
// Sources (June 2026): apextraderfunding.com, help.topstep.com,
// help.myfundedfutures.com, takeprofittrader.com and current third-party
// rule summaries.

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

const trailing = "trailing" as const;

export const PROP_FIRMS: PropFirm[] = [
  {
    name: "Apex Trader Funding",
    note: "4.0 evaluation (EOD trailing). Consistency 50% applies to payouts.",
    accounts: [
      { label: "25K", rules: r(25000, 500, 1500, 50, 4) },
      { label: "50K", rules: r(50000, 1000, 2500, 50, 6) },
      { label: "100K", rules: r(100000, 1500, 3000, 50, 8) },
      { label: "150K", rules: r(150000, 2000, 5000, 50, 12) },
    ],
  },
  {
    name: "Topstep",
    note: "Trading Combine (EOD-trailing Max Loss Limit). Topstep's consistency rule is best day < 50% of the profit target; this checker measures it against net profit.",
    accounts: [
      { label: "50K", rules: r(50000, 1000, 2000, 50, 5) },
      { label: "100K", rules: r(100000, 2000, 3000, 50, 10) },
      { label: "150K", rules: r(150000, 3000, 4500, 50, 15) },
    ],
  },
  {
    name: "Take Profit Trader",
    note: "Test account (EOD trailing). No daily loss limit; 5 minimum trading days. PRO phase switches to intraday trailing — adjust if you're funded.",
    accounts: [
      { label: "25K", rules: r(25000, null, 1500, 50, 3, 5) },
      { label: "50K", rules: r(50000, null, 2000, 50, 6, 5) },
      { label: "100K", rules: r(100000, null, 3000, 50, 12, 5) },
      { label: "150K", rules: r(150000, null, 4500, 50, 15, 5) },
    ],
  },
  {
    name: "My Funded Futures",
    note: "Core evaluation (EOD trailing). No daily loss limit (except the Builder plan). Consistency 50% on the eval only. Rapid plan uses intraday trailing — adjust if applicable.",
    accounts: [
      { label: "50K", rules: r(50000, null, 2000, 50, 5) },
      { label: "100K", rules: r(100000, null, 3000, 50, 10) },
      { label: "150K", rules: r(150000, null, 4500, 50, 15) },
    ],
  },
];

// Builder for a standard trailing-drawdown evaluation rule set.
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
    drawdownType: trailing,
    consistencyPct,
    maxContracts,
    minTradingDays,
  };
}
