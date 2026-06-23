"use client";

import { useState, useTransition } from "react";
import { approveCandidateAction, rejectCandidateAction } from "@/app/(app)/engine/actions";

export interface TicketCandidate {
  id: string;
  instrumentSymbol: string;
  direction: "long" | "short";
  entry_price: number;
  stop_price: number;
  target_price: number;
  size: number;
  rr_ratio: number | null;
  risk_usd: number | null;
  rationale_tag: string | null;
  entry_plugin_id: string | null;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// The trade ticket / approval card — the legally and operationally important
// moment in the app. A calm price ladder, the numbers stated plainly, and ONE
// confident control (Approve, in --accent) beside a quiet Reject.
export default function TradeTicket({
  candidate,
  isExample,
  notice,
}: {
  candidate: TicketCandidate;
  isExample?: boolean;
  notice?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<null | { kind: "approved" | "rejected"; msg: string }>(null);
  const [error, setError] = useState<string | null>(null);

  const isLong = candidate.direction === "long";
  const dirColor = isLong ? "var(--long)" : "var(--short)";
  const stopDist = Math.abs(candidate.entry_price - candidate.stop_price);
  const targetDist = Math.abs(candidate.target_price - candidate.entry_price);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveCandidateAction(candidate.id);
      if (res.ok) setDone({ kind: "approved", msg: "Trade approved (simulated)." });
      else setError(res.reason ?? "Could not approve.");
    });
  }
  function reject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectCandidateAction(candidate.id);
      if (res.ok) setDone({ kind: "rejected", msg: "Trade rejected." });
      else setError(res.reason ?? "Could not reject.");
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <p
          className="text-sm font-medium"
          style={{ color: done.kind === "approved" ? "var(--gain)" : "var(--muted)" }}
        >
          {done.msg}
        </p>
        {done.kind === "approved" && (
          <p className="mt-1 text-xs text-muted">
            Recorded to your paper account. No live order was placed.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      {/* header */}
      <div className="flex items-center gap-2">
        <span className="font-display text-base font-semibold text-ink">
          {candidate.instrumentSymbol}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: `${dirColor}1a`, color: dirColor }}
        >
          {candidate.direction}
        </span>
        {candidate.rationale_tag && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
            {candidate.rationale_tag}
          </span>
        )}
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase text-muted">
          Proposed
        </span>
      </div>

      {isExample && (
        <p className="mt-3 rounded-lg border border-short/40 bg-short/10 px-3 py-2 text-xs font-medium text-short">
          {notice ?? "EXAMPLE ONLY — not a trading edge. Replace with your own strategy."}
        </p>
      )}

      <div className="mt-4 grid gap-5 sm:grid-cols-[180px_1fr]">
        {/* price ladder */}
        <PriceLadder
          isLong={isLong}
          entry={candidate.entry_price}
          stop={candidate.stop_price}
          target={candidate.target_price}
        />

        {/* numbers */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 self-center">
          <Field label="Reward : risk" value={candidate.rr_ratio == null ? "—" : `${fmt(candidate.rr_ratio)} : 1`} />
          <Field label="Size" value={`${candidate.size} contract${candidate.size === 1 ? "" : "s"}`} />
          <Field label="$ risk" value={usd(candidate.risk_usd)} tone="text-loss" />
          <Field label="Stop / target dist" value={`${fmt(stopDist)} / ${fmt(targetDist)} pt`} />
        </div>
      </div>

      {/* actions */}
      <div className="mt-5 flex flex-col gap-2">
        <p className="text-center text-[11px] text-muted">
          Approving records a simulated fill only. No live order is placed.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {pending ? "Working…" : "Approve trade"}
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={pending}
            className="rounded-xl border border-line px-4 py-3 text-sm font-medium text-muted hover:text-ink disabled:opacity-60"
          >
            Reject
          </button>
        </div>
        {error && <p className="text-center text-xs text-loss">{error}</p>}
      </div>
    </div>
  );
}

function Field({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

// Vertical price ladder. For a long: target on top, entry, stop at bottom.
// Shorts invert. Rungs are positioned proportionally to the actual prices so
// the geometry reflects the trade.
function PriceLadder({
  isLong,
  entry,
  stop,
  target,
}: {
  isLong: boolean;
  entry: number;
  stop: number;
  target: number;
}) {
  const hi = Math.max(entry, stop, target);
  const lo = Math.min(entry, stop, target);
  const span = hi - lo || 1;
  const topPct = (price: number) => ((hi - price) / span) * 100;

  const rungs = [
    { price: target, label: "Target", color: "var(--gain)" },
    { price: entry, label: "Entry", color: "var(--ink)" },
    { price: stop, label: "Stop", color: "var(--loss)" },
  ];

  return (
    <div className="relative h-48 rounded-xl border border-line bg-surface">
      {/* inner area inset from the edges so the top/bottom rungs aren't clipped */}
      <div className="absolute inset-x-0 bottom-6 top-6">
        {/* rail */}
        <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-line" />
        {rungs.map((r) => (
          <div
            key={r.label}
            className="absolute inset-x-0 flex -translate-y-1/2 items-center justify-between px-3"
            style={{ top: `${topPct(r.price).toFixed(2)}%` }}
          >
            <span
              className="text-[10px] font-medium uppercase tracking-wide"
              style={{ color: r.color }}
            >
              {r.label}
            </span>
            <span className="h-2 w-2 rounded-full ring-2 ring-card" style={{ backgroundColor: r.color }} />
            <span className="font-mono text-xs font-semibold tabular-nums text-ink">
              {fmt(r.price)}
            </span>
          </div>
        ))}
      </div>
      <span
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-medium uppercase tracking-wider"
        style={{ color: isLong ? "var(--long)" : "var(--short)" }}
      >
        {isLong ? "long" : "short"}
      </span>
    </div>
  );
}
