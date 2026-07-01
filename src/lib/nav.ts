import type { Feature } from "@/lib/billing/tiers";

// Single source of truth for navigation. The top bar shows six PRIMARY_TABS;
// two of them (Recs, Analysis) are groups whose sub-pages share one slot and
// are switched with a SubTabs bar inside the page. `match` lists every route
// prefix that should light up the primary tab (so /strategy + /paper still
// highlight "Recs"). Routes + feature keys are intentionally left at their
// original values — only the user-facing labels changed.

export interface PrimaryTab {
  href: string;
  label: string;
  feature: Feature;
  match: string[];
}

export const PRIMARY_TABS: PrimaryTab[] = [
  { href: "/dashboard", label: "Dashboard", feature: "journal", match: ["/dashboard"] },
  { href: "/trades", label: "Trades", feature: "journal", match: ["/trades"] },
  { href: "/import", label: "Import", feature: "journal", match: ["/import"] },
  // "Recs" = the recommendation engine (Generate) plus its Strategy config and
  // Paper log, grouped under one tab.
  { href: "/engine", label: "Recs", feature: "engine", match: ["/engine", "/strategy", "/paper"] },
  // "Analysis" = retrospective tools: the what-if sweep and the prop-firm check.
  { href: "/whatif", label: "Analysis", feature: "whatif", match: ["/whatif", "/prop"] },
  { href: "/review", label: "Review", feature: "ai_review", match: ["/review"] },
];

export interface SubTab {
  href: string;
  label: string;
}

// Sub-tabs for the "Recs" group. The page heading reads "Recommendations"; the
// nav is abbreviated to "Recs" to fit the bar.
export const ENGINE_SUBTABS: SubTab[] = [
  { href: "/engine", label: "Generate" },
  { href: "/strategy", label: "Strategy" },
  { href: "/paper", label: "Paper" },
];

// Sub-tabs for the "Analysis" group.
export const ANALYSIS_SUBTABS: SubTab[] = [
  { href: "/whatif", label: "What-if" },
  { href: "/prop", label: "Prop rules" },
];
