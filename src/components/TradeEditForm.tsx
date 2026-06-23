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
  planned_stop_price: number | null;
  planned_target_price: number | null;
}

const fieldClass =
  "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-ink ring-0 focus:border-accent";

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
        <label className="text-xs text-muted">
          Setup
          <input
            name="setup_tag"
            defaultValue={trade.setup_tag ?? ""}
            placeholder="e.g. breakout"
            className={fieldClass}
          />
        </label>
        <label className="text-xs text-muted">
          Rating (1–5)
          <input
            name="rating"
            type="number"
            min={1}
            max={5}
            defaultValue={trade.rating ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="text-xs text-muted">
          Planned stop price
          <input
            name="planned_stop_price"
            type="number"
            step="any"
            defaultValue={trade.planned_stop_price ?? ""}
            placeholder="for R-multiple"
            className={`${fieldClass} font-mono tabular-nums`}
          />
        </label>
        <label className="text-xs text-muted">
          Planned target price
          <input
            name="planned_target_price"
            type="number"
            step="any"
            defaultValue={trade.planned_target_price ?? ""}
            className={`${fieldClass} font-mono tabular-nums`}
          />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Tags (comma-separated)
          <input
            name="tags"
            defaultValue={(trade.tags ?? []).join(", ")}
            placeholder="news, fomc, revenge"
            className={fieldClass}
          />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Risk override ($) — leave blank to use your risk model
          <input
            name="risk_amount"
            type="number"
            step="any"
            defaultValue={trade.risk_amount ?? ""}
            className={`${fieldClass} font-mono tabular-nums`}
          />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Notes
          <textarea
            name="notes"
            rows={4}
            defaultValue={trade.notes ?? ""}
            className={fieldClass}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Save
        </button>
        {saved && <span className="text-xs text-gain">Saved ✓</span>}
      </div>
    </form>
  );
}
