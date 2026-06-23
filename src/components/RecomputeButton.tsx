"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recomputeExcursions } from "@/app/(app)/trades/actions";

// Explicit, user-triggered MAE/MFE recompute across closed trades that have
// imported bars. Stores the results so the aggregate views have data.
export default function RecomputeButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      const s = await recomputeExcursions();
      if (s) {
        setMsg(
          `Analyzed ${s.processed} closed trades — ${s.withBars} had bars` +
            (s.noInstrument ? `, ${s.noInstrument} had no matching instrument` : "") +
            ".",
        );
        router.refresh();
      } else {
        setMsg("Could not run analysis.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink disabled:opacity-60"
      >
        {pending ? "Analyzing…" : "Recompute MAE/MFE"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
