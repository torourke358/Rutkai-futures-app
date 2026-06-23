"use client";

import { useState } from "react";
import type { RiskMethod, RiskSettings } from "@/lib/risk";
import { saveRiskSettings } from "@/app/(app)/account/settings/actions";

const METHODS: { value: RiskMethod; label: string; blurb: string }[] = [
  {
    value: "flat",
    label: "Flat dollar amount",
    blurb: "Risk the same dollar amount on every trade. Simplest.",
  },
  {
    value: "percent_static",
    label: "% of a balance you set",
    blurb: "Risk a percentage of an account balance you update manually.",
  },
  {
    value: "percent_equity",
    label: "% of auto-tracked equity",
    blurb:
      "Risk a percentage of equity that moves with your closed P&L and any deposits/withdrawals.",
  },
];

export default function RiskSettingsForm({
  initial,
}: {
  initial: RiskSettings | null;
}) {
  const [method, setMethod] = useState<RiskMethod>(initial?.method ?? "flat");
  const [saved, setSaved] = useState(false);

  const startingDate = initial?.starting_at
    ? initial.starting_at.slice(0, 10)
    : "";

  return (
    <form
      action={async (fd) => {
        setSaved(false);
        await saveRiskSettings(fd);
        setSaved(true);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="method" value={method} />

      <div className="space-y-2">
        {METHODS.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ${
              method === m.value
                ? "bg-surface-2 ring-accent"
                : "bg-surface-2 ring-line"
            }`}
          >
            <input
              type="radio"
              name="method-radio"
              checked={method === m.value}
              onChange={() => setMethod(m.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                {m.label}
              </span>
              <span className="block text-xs text-muted">{m.blurb}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Only the fields the chosen method needs are shown. */}
      {method === "flat" && (
        <Field
          name="default_risk_dollars"
          label="Risk per trade ($)"
          defaultValue={initial?.default_risk_dollars ?? 200}
          step="1"
        />
      )}

      {method === "percent_static" && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="account_balance"
            label="Account balance ($)"
            defaultValue={initial?.account_balance ?? ""}
            step="1"
          />
          <Field
            name="risk_percent"
            label="Risk per trade (%)"
            defaultValue={initial?.risk_percent ?? 1}
            step="0.05"
          />
        </div>
      )}

      {method === "percent_equity" && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="starting_balance"
            label="Starting balance ($)"
            defaultValue={initial?.starting_balance ?? ""}
            step="1"
          />
          <Field
            name="risk_percent"
            label="Risk per trade (%)"
            defaultValue={initial?.risk_percent ?? 1}
            step="0.05"
          />
          <label className="col-span-2 block text-xs text-muted">
            Start date
            <input
              type="date"
              name="starting_at"
              defaultValue={startingDate}
              className="mt-1 w-full rounded-lg bg-white px-3 py-2 text-ink border border-line focus:border-accent"
            />
          </label>
          <p className="col-span-2 text-xs text-muted">
            Log deposits and withdrawals below so equity stays accurate.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Save risk settings
        </button>
        {saved && <span className="text-xs text-gain">Saved ✓</span>}
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  step,
}: {
  name: string;
  label: string;
  defaultValue: number | string;
  step: string;
}) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        type="number"
        name={name}
        step={step}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg bg-white px-3 py-2 text-ink border border-line focus:border-accent"
      />
    </label>
  );
}
