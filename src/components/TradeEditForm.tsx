"use client";

import { useState } from "react";
import { updateTradeAnnotations } from "@/app/(app)/trades/actions";

export interface TradeEditValues {
  id: string;
  setup_tag: string | null;
  tags: string[] | null;
  rating: number | null;
  notes: string | null;
  risk_amount: number | null;
}

export default function TradeEditForm({ trade }: { trade: TradeEditValues }) {
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (fd) => {
        setSaved(false);
        await updateTradeAnnotations(fd);
        setSaved(true);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={trade.id} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-slate-400">
          Setup
          <input
            name="setup_tag"
            defaultValue={trade.setup_tag ?? ""}
            placeholder="e.g. breakout"
            className="mt-1 block w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-slate-100 ring-1 ring-[var(--border)]"
          />
        </label>
        <label className="text-xs text-slate-400">
          Rating (1–5)
          <input
            name="rating"
            type="number"
            min={1}
            max={5}
            defaultValue={trade.rating ?? ""}
            className="mt-1 block w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-slate-100 ring-1 ring-[var(--border)]"
          />
        </label>
        <label className="col-span-2 text-xs text-slate-400">
          Tags (comma-separated)
          <input
            name="tags"
            defaultValue={(trade.tags ?? []).join(", ")}
            placeholder="news, fomc, revenge"
            className="mt-1 block w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-slate-100 ring-1 ring-[var(--border)]"
          />
        </label>
        <label className="col-span-2 text-xs text-slate-400">
          Risk override ($) — leave blank to use your risk model
          <input
            name="risk_amount"
            type="number"
            step="any"
            defaultValue={trade.risk_amount ?? ""}
            className="mt-1 block w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-slate-100 ring-1 ring-[var(--border)]"
          />
        </label>
        <label className="col-span-2 text-xs text-slate-400">
          Notes
          <textarea
            name="notes"
            rows={4}
            defaultValue={trade.notes ?? ""}
            className="mt-1 block w-full rounded-lg bg-[var(--surface-2)] px-3 py-2 text-slate-100 ring-1 ring-[var(--border)]"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
        >
          Save
        </button>
        {saved && <span className="text-xs text-emerald-300">Saved ✓</span>}
      </div>
    </form>
  );
}
