import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasFeature, type Tier, type Feature } from "@/lib/billing/tiers";

export interface SubscriptionRow {
  user_id: string;
  tier: Tier;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_until: string | null;
  updated_at: string;
}

// Gating is STAGED but not enforced until billing is wired. While
// BILLING_ENABLED is off (the default), everyone gets full access so existing
// users aren't locked out of features they already use; the tier code + UI are
// all in place, ready to flip on once Stripe + tier assignment land (Phase 2).
const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

// Resolve a user's EFFECTIVE tier. With billing off → "elite" (all open). With
// billing on: reads the subscription row, defaults to "free" when there's none
// (or the table isn't migrated), and falls back to "free" when a subscription
// is canceled or past its grace window. The Stripe webhook keeps it current.
export async function getUserTier(): Promise<Tier> {
  if (!BILLING_ENABLED) return "elite";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "free";

  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, grace_until")
    .eq("user_id", user.id)
    .maybeSingle<Pick<SubscriptionRow, "tier" | "status" | "grace_until">>();

  if (!data) return "free";
  const live =
    data.status === "active" ||
    data.status === "trialing" ||
    (data.status === "past_due" &&
      data.grace_until != null &&
      new Date(data.grace_until) > new Date());
  return live ? data.tier : "free";
}

// Server guard for a page/route. Redirects to /upgrade when the user's tier
// doesn't include the feature. Call at the top of a gated server component.
export async function requireFeature(feature: Feature): Promise<void> {
  const tier = await getUserTier();
  if (!hasFeature(tier, feature)) redirect("/upgrade");
}
