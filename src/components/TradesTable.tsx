"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTime, formatSignedUsd, pnlToneClass } from "@/lib/format";
import { saveTradeNote } from "@/app/(app)/trades/actions";

export interface TradeRowView {
  id: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  realized_pnl: number | null;
  status: "open" | "closed";
  setup_tag: string | null;
  notes: string | null;
  r: number | null;
}

type SortKey =
  | "symbol"
  | "direction"
  | "realized_pnl"
  | "r"
  | "entry_at"
  | "exit_at"
  | "setup_tag";

export default function TradesTable({ rows }: { rows: TradeRowView[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "exit_at",
    dir: -1,
  });

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        r.symbol.toLowerCase().includes(q) ||
        (r.setup_tag ?? "").toLowerCase().includes(q)
      );
    });
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, query, status, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by symbol or setup…"
          className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-sm text-slate-100 ring-1 ring-[var(--border)]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | "open" | "closed")}
          className="rounded-lg bg-[var(--surface-2)] px-2 py-1.5 text-sm text-slate-100 ring-1 ring-[var(--border)]"
        >
          <option value="all">All</option>
          <option value="closed">Closed</option>
          <option value="open">Open</option>
        </select>
        <span className="ml-auto text-xs text-slate-500">{view.length} trades</span>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <Th onClick={() => toggleSort("symbol")} active={sort.key === "symbol"} dir={sort.dir}>Symbol</Th>
              <Th onClick={() => toggleSort("direction")} active={sort.key === "direction"} dir={sort.dir}>Side</Th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <Th onClick={() => toggleSort("realized_pnl")} active={sort.key === "realized_pnl"} dir={sort.dir} className="text-right">P&amp;L</Th>
              <Th onClick={() => toggleSort("r")} active={sort.key === "r"} dir={sort.dir} className="text-right">R</Th>
              <Th onClick={() => toggleSort("exit_at")} active={sort.key === "exit_at"} dir={sort.dir}>Exit at</Th>
              <Th onClick={() => toggleSort("setup_tag")} active={sort.key === "setup_tag"} dir={sort.dir}>Setup</Th>
              <th className="px-3 py-2 text-left">Notes</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {view.map((r) => (
              <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                <td className="px-3 py-2 font-semibold text-slate-100">
                  <Link href={`/trades/${r.id}`} className="hover:text-indigo-300">
                    {r.symbol}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.direction}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.entry_price}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.exit_price ?? "—"}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${pnlToneClass(r.realized_pnl)}`}>
                  {formatSignedUsd(r.realized_pnl)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${pnlToneClass(r.r)}`}>
                  {r.r == null ? "—" : `${r.r.toFixed(2)}R`}
                </td>
                <td className="px-3 py-2 text-slate-400">{formatDateTime(r.exit_at)}</td>
                <td className="px-3 py-2 text-slate-400">{r.setup_tag ?? "—"}</td>
                <td className="px-3 py-2">
                  <NoteCell id={r.id} initial={r.notes} />
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                      r.status === "closed"
                        ? "bg-slate-500/20 text-slate-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: 1 | -1;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 text-left ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? "text-slate-100" : ""}`}
      >
        {children}
        {active && <span>{dir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function NoteCell({ id, initial }: { id: string; initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="max-w-[12rem] truncate text-left text-slate-400 hover:text-slate-200"
        title={value || "Add note"}
      >
        {value || <span className="text-slate-600">add note…</span>}
      </button>
    );
  }
  return (
    <textarea
      autoFocus
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        setSaving(true);
        await saveTradeNote(id, value);
        setSaving(false);
        setEditing(false);
      }}
      rows={2}
      className="w-48 rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs text-slate-100 ring-1 ring-[var(--border)]"
    />
  );
}
