import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/billing/plan";
import { formatDateTime, formatSignedUsd, pnlToneClass } from "@/lib/format";
import Disclaimer from "@/components/Disclaimer";
import SubTabs from "@/components/SubTabs";
import { ENGINE_SUBTABS } from "@/lib/nav";

export const dynamic = "force-dynamic";

interface PaperRow {
  id: string;
  direction: "long" | "short" | null;
  size: number | null;
  fill_price: number | null;
  exit_price: number | null;
  exit_reason: string | null;
  pnl_usd: number | null;
  risk_usd: number | null;
  filled_at: string;
  instruments: { symbol: string } | { symbol: string }[] | null;
}

function symbolOf(r: PaperRow): string {
  const i = r.instruments;
  if (!i) return "—";
  return Array.isArray(i) ? (i[0]?.symbol ?? "—") : i.symbol;
}

export default async function PaperPage() {
  await requireFeature("engine");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trades } = await supabase
    .from("paper_trades")
    .select(
      "id, direction, size, fill_price, exit_price, exit_reason, pnl_usd, risk_usd, filled_at, instruments(symbol)",
    )
    .eq("user_id", user!.id)
    .order("filled_at", { ascending: false })
    .returns<PaperRow[]>();

  const rows = trades ?? [];
  const resolved = rows.filter((r) => r.pnl_usd != null);
  const net = resolved.reduce((s, r) => s + (r.pnl_usd ?? 0), 0);
  const wins = resolved.filter((r) => (r.pnl_usd ?? 0) > 0).length;
  const winRate = resolved.length ? Math.round((wins / resolved.length) * 100) : null;

  return (
    <div className="space-y-4 pb-8">
      <h1 className="font-display text-lg font-semibold text-ink">Recommendations</h1>
      <SubTabs tabs={ENGINE_SUBTABS} />
      <h2 className="font-display text-sm font-semibold text-ink">Simulations</h2>

      <Disclaimer />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center">
          <p className="text-sm text-ink">No simulated trades yet.</p>
          <p className="mt-1 text-sm text-muted">
            Approve a candidate under Generate to record one here.
          </p>
          <Link
            href="/engine"
            className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Generate a recommendation
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Summary label="Simulated net P&L" value={formatSignedUsd(net)} tone={pnlToneClass(net)} />
            <Summary label="Resolved fills" value={`${resolved.length} / ${rows.length}`} />
            <Summary label="Hypothetical win rate" value={winRate == null ? "—" : `${winRate}%`} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-left">Filled</th>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">Dir</th>
                  <th className="px-3 py-2 text-right">Size</th>
                  <th className="px-3 py-2 text-right">Fill</th>
                  <th className="px-3 py-2 text-right">Exit</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-right">Sim P&L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-muted">{formatDateTime(r.filled_at)}</td>
                    <td className="px-3 py-2 font-mono text-ink">{symbolOf(r)}</td>
                    <td
                      className="px-3 py-2 text-xs font-medium"
                      style={{ color: r.direction === "short" ? "var(--short)" : "var(--long)" }}
                    >
                      {r.direction ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{r.size ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{r.fill_price ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{r.exit_price ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.exit_reason ?? "—"}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlToneClass(r.pnl_usd)}`}>
                      {r.pnl_usd == null ? "open" : formatSignedUsd(r.pnl_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            Simulated fills are kept separate from your imported real trades and
            never affect your journal analytics.
          </p>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
