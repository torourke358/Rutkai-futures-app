import { getUserTier } from "@/lib/billing/plan";
import { TIERS, TIER_LABELS, TIER_SUMMARY, TIER_RANK, type Tier } from "@/lib/billing/tiers";

export const dynamic = "force-dynamic";

export default async function UpgradePage() {
  const current = await getUserTier();

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="font-display text-lg font-semibold text-ink">Plans</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;re on the <span className="font-semibold text-ink">{TIER_LABELS[current]}</span> plan.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {TIERS.map((tier) => (
          <PlanCard key={tier} tier={tier} current={current} />
        ))}
      </div>

      <p className="text-xs text-muted">
        Checkout isn&apos;t live yet — paid plans are being wired up. For now, every feature is open
        while the engine is in build/paper mode.
      </p>
    </div>
  );
}

function PlanCard({ tier, current }: { tier: Tier; current: Tier }) {
  const s = TIER_SUMMARY[tier];
  const isCurrent = tier === current;
  const isUpgrade = TIER_RANK[tier] > TIER_RANK[current];
  const highlight = tier === "pro";

  return (
    <section
      className={`flex flex-col rounded-2xl border bg-card p-5 shadow-sm ${
        highlight ? "border-accent ring-1 ring-accent/30" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-ink">{TIER_LABELS[tier]}</h2>
        {highlight && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Popular
          </span>
        )}
      </div>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink">{s.price}</p>
      <p className="mt-1 text-sm text-muted">{s.blurb}</p>

      <ul className="mt-4 flex-1 space-y-2 text-sm text-ink">
        {s.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="text-muted">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {isCurrent ? (
          <span className="block rounded-xl border border-line bg-surface px-4 py-2 text-center text-sm font-medium text-muted">
            Current plan
          </span>
        ) : tier === "free" ? (
          <span className="block rounded-xl border border-line px-4 py-2 text-center text-sm text-muted">
            Included
          </span>
        ) : (
          <button
            type="button"
            disabled
            title="Checkout coming soon"
            className="w-full cursor-not-allowed rounded-xl bg-accent/60 px-4 py-2 text-sm font-semibold text-white"
          >
            {isUpgrade ? `Choose ${TIER_LABELS[tier]}` : `Switch to ${TIER_LABELS[tier]}`} · coming soon
          </button>
        )}
      </div>
    </section>
  );
}
