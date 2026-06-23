import Link from "next/link";

// Shown when the user hasn't configured their risk model yet. Without it,
// R-multiples and expectancy-in-R can't be computed.
export default function FirstRunBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
      <div>
        <p className="text-sm font-medium text-ink">
          Finish setup: choose how you size risk
        </p>
        <p className="text-xs text-muted">
          R-multiples and expectancy-in-R need a risk model. It takes about a
          minute.
        </p>
      </div>
      <Link
        href="/account/settings"
        className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
      >
        Set up risk
      </Link>
    </div>
  );
}
