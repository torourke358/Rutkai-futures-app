"use client";

import { useState } from "react";
import { addManualTrade } from "@/app/(app)/trades/actions";

// Manual trade entry. Writes an entry (+ optional exit) execution and re-pairs,
// so manual trades flow through the same engine as imported CSV fills.
export default function ManualTradeForm() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-2xl bg-card border border-line shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink"
      >
        Add a trade manually
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <form
          action={async (fd) => {
            setBusy(true);
            await addManualTrade(fd);
            setBusy(false);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3 border-t border-line p-4 sm:grid-cols-3"
        >
          <Field label="Symbol" name="symbol" required uppercase />
          <label className="text-xs text-muted">
            Direction
            <select
              name="direction"
              className="mt-1 block w-full rounded-lg bg-white border border-line px-3 py-2 text-ink ring-1 ring-line focus:border-accent"
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <Field label="Quantity" name="quantity" type="number" step="any" required />
          <Field label="Entry price" name="entry_price" type="number" step="any" required />
          <Field label="Entry time" name="entry_at" type="datetime-local" required />
          <Field label="Fees ($, total)" name="fees" type="number" step="any" />
          <Field label="Exit price (optional)" name="exit_price" type="number" step="any" />
          <Field label="Exit time (optional)" name="exit_at" type="datetime-local" />
          <div className="col-span-2 flex items-end sm:col-span-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "Saving…" : "Add trade"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  step,
  required,
  uppercase,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  required?: boolean;
  uppercase?: boolean;
}) {
  return (
    <label className="text-xs text-muted">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className={`mt-1 block w-full rounded-lg bg-white border border-line px-3 py-2 text-ink ring-1 ring-line focus:border-accent ${
          uppercase ? "uppercase" : ""
        }`}
      />
    </label>
  );
}
