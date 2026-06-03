// Currency, signed P&L, and local-anchored date helpers. Local-noon anchor
// avoids the off-by-one DST drift that bit petty-cash.

const CURRENCY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return CURRENCY_FMT.format(n);
}

// Like formatUsd but prefixes "+" for non-negative values so a P&L column
// reads at a glance (-1234.50 vs +250.00).
export function formatSignedUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  const formatted = CURRENCY_FMT.format(Math.abs(n));
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `-${formatted}`;
  return formatted;
}

export function pnlToneClass(n: number | null | undefined): string {
  if (n == null) return "text-slate-400";
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-slate-400";
}

export function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // For date-only strings (YYYY-MM-DD) anchor at local noon to avoid DST drift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return DATE_FMT.format(new Date(y, m - 1, d, 12));
  }
  return DATE_FMT.format(new Date(iso));
}

const DATETIME_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATETIME_FMT.format(new Date(iso));
}
