import Link from "next/link";

// Shown when the user hasn't configured their risk model yet. Without it,
// R-multiples and expectancy-in-R can't be computed.
export default function FirstRunBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-500/10 p-4 ring-1 ring-indigo-400/30">
      <div>
        <p className="text-sm font-medium text-indigo-200">
          Finish setup: choose how you size risk
        </p>
        <p className="text-xs text-indigo-300/80">
          R-multiples and expectancy-in-R need a risk model. It takes about a
          minute.
        </p>
      </div>
      <Link
        href="/account/settings"
        className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400"
      >
        Set up risk
      </Link>
    </div>
  );
}
