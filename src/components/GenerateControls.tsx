"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateCandidateAction } from "@/app/(app)/engine/actions";

// Explicit, user-triggered candidate generation. The engine NEVER runs on its
// own — this button is the only way to ask for a candidate.
export default function GenerateControls({ symbols }: { symbols: string[] }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(symbols[0] ?? "NQ");
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<string | null>(null);

  function generate() {
    setReason(null);
    startTransition(async () => {
      const res = await generateCandidateAction(symbol);
      if (res.ok) {
        router.refresh();
      } else {
        setReason(res.reason ?? "Nothing to propose.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-muted">
          Instrument
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="mt-1 block rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm text-ink"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Scanning bars…" : "Generate candidate"}
        </button>
      </div>
      {reason && (
        <p className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
          {reason}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Runs your active strategy over imported bars once, on demand. It proposes;
        it never executes.
      </p>
    </div>
  );
}
