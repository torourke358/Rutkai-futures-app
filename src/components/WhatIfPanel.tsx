"use client";

import { useState, useTransition } from "react";
import {
  runSweep,
  suggestParams,
  type SweepActionResult,
} from "@/app/(app)/whatif/actions";
import type { SweepParams, ExitRule, StopMode } from "@/lib/analysis/whatif";
import { formatSignedUsd } from "@/lib/format";
import Disclaimer from "@/components/Disclaimer";

const field =
  "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent";

export default function WhatIfPanel({ symbols }: { symbols: string[] }) {
  const [symbol, setSymbol] = useState(symbols[0] ?? "all");
  const [exitRule, setExitRule] = useState<ExitRule>("stop_target");
  const [stopMode, setStopMode] = useState<StopMode>("points");
  const [stopPoints, setStopPoints] = useState<string>("30");
  const [atrMultiple, setAtrMultiple] = useState<string>("2");
  const [targetR, setTargetR] = useState<string>("2");
  const [breakevenR, setBreakevenR] = useState<string>("1");
  const [timeMinutes, setTimeMinutes] = useState<string>("15");
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();
  const [mapping, startMapping] = useTransition();
  const [result, setResult] = useState<SweepActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyParams(p: SweepParams) {
    setExitRule(p.exitRule);
    if (p.stopMode) setStopMode(p.stopMode);
    if (p.stopPoints != null) setStopPoints(String(p.stopPoints));
    if (p.atrMultiple != null) setAtrMultiple(String(p.atrMultiple));
    if (p.targetR != null) setTargetR(String(p.targetR));
    if (p.breakevenR != null) setBreakevenR(String(p.breakevenR));
    if (p.timeMinutes != null) setTimeMinutes(String(p.timeMinutes));
  }

  function onSuggest() {
    if (!question.trim()) return;
    setError(null);
    startMapping(async () => {
      const p = await suggestParams(question.trim());
      applyParams(p);
    });
  }

  function onRun() {
    setError(null);
    setResult(null);
    const numOr = (s: string) => (s.trim() === "" ? null : Number(s));
    const params: SweepParams = {
      exitRule,
      stopMode,
      stopPoints: stopMode === "points" ? numOr(stopPoints) : null,
      atrMultiple: stopMode === "atr" ? numOr(atrMultiple) : null,
      targetR: exitRule === "stop_target" || exitRule === "breakeven" ? numOr(targetR) : null,
      breakevenR: exitRule === "breakeven" ? numOr(breakevenR) : null,
      timeMinutes: exitRule === "time" ? numOr(timeMinutes) : null,
    };
    startTransition(async () => {
      const res = await runSweep(symbol, params, question.trim() || undefined);
      if (res.ok) setResult(res);
      else setError(res.reason ?? "Sweep failed.");
    });
  }

  return (
    <div className="space-y-4">
      {/* NL → params (the AI only pre-fills the controls below) */}
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <label className="text-xs font-medium text-muted">
          Describe a change (optional)
          <div className="mt-1 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. what if my NQ trades used a 30-point stop?"
              className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent"
            />
            <button
              type="button"
              onClick={onSuggest}
              disabled={mapping || !question.trim()}
              className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-60"
            >
              {mapping ? "Reading…" : "Fill controls"}
            </button>
          </div>
        </label>
        <p className="mt-1 text-[11px] text-muted">
          The assistant only fills the controls below from your words — it never
          runs the math. Review and edit before you sweep.
        </p>
      </div>

      {/* deterministic controls */}
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="text-xs font-medium text-muted">
            Instrument
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={field}>
              <option value="all">All</option>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Exit rule
            <select
              value={exitRule}
              onChange={(e) => setExitRule(e.target.value as ExitRule)}
              className={field}
            >
              <option value="stop_target">Stop + target</option>
              <option value="stop_eod">Stop, else close</option>
              <option value="eod">Hold to close</option>
              <option value="trailing">Trailing stop</option>
              <option value="breakeven">Breakeven stop</option>
              <option value="time">Time exit</option>
            </select>
          </label>

          {exitRule !== "eod" && (
            <>
              <label className="text-xs font-medium text-muted">
                Stop sizing
                <select
                  value={stopMode}
                  onChange={(e) => setStopMode(e.target.value as StopMode)}
                  className={field}
                >
                  <option value="points">Points</option>
                  <option value="atr">ATR multiple</option>
                </select>
              </label>
              <label className="text-xs font-medium text-muted">
                {(exitRule === "trailing" ? "Trail" : "Stop") +
                  (stopMode === "atr" ? " (× ATR)" : " (pts)")}
                <input
                  type="number"
                  step="any"
                  value={stopMode === "atr" ? atrMultiple : stopPoints}
                  onChange={(e) =>
                    stopMode === "atr"
                      ? setAtrMultiple(e.target.value)
                      : setStopPoints(e.target.value)
                  }
                  className={`${field} font-mono tabular-nums`}
                />
              </label>
            </>
          )}

          {(exitRule === "stop_target" || exitRule === "breakeven") && (
            <label className="text-xs font-medium text-muted">
              Target (R)
              <input
                type="number"
                step="any"
                value={targetR}
                onChange={(e) => setTargetR(e.target.value)}
                className={`${field} font-mono tabular-nums`}
              />
            </label>
          )}

          {exitRule === "breakeven" && (
            <label className="text-xs font-medium text-muted">
              Breakeven trigger (R)
              <input
                type="number"
                step="any"
                value={breakevenR}
                onChange={(e) => setBreakevenR(e.target.value)}
                className={`${field} font-mono tabular-nums`}
              />
            </label>
          )}

          {exitRule === "time" && (
            <label className="text-xs font-medium text-muted">
              Hold (minutes)
              <input
                type="number"
                step="1"
                value={timeMinutes}
                onChange={(e) => setTimeMinutes(e.target.value)}
                className={`${field} font-mono tabular-nums`}
              />
            </label>
          )}
        </div>

        {stopMode === "atr" && symbol === "all" && (
          <p className="mt-2 text-[11px] text-muted">
            ATR sizing makes an &ldquo;All&rdquo; sweep apples-to-apples across instruments.
          </p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onRun}
            disabled={pending}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {pending ? "Re-running your trades…" : "Run what-if sweep"}
          </button>
          <span className="text-[11px] text-muted">
            Re-runs every selected trade against your imported bars — winners and
            losers alike.
          </span>
        </div>
        {error && <p className="mt-3 text-sm text-loss">{error}</p>}
      </div>

      {result?.ok && result.summary && <Results result={result} />}
    </div>
  );
}

function Results({ result }: { result: SweepActionResult }) {
  const s = result.summary!;
  const rows = result.perTrade ?? [];
  const improved = rows.filter((r) => r.new_usd != null && r.delta_usd > 0);
  const worsened = rows.filter((r) => r.new_usd != null && r.delta_usd < 0);

  return (
    <div className="space-y-4">
      {/* AI narration of the deterministic result */}
      {result.narration && (
        <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Retrospective recomputation of your own trades
          </p>
          <p className="mt-2 text-sm text-ink">{result.narration}</p>
          <div className="mt-3">
            <Disclaimer />
          </div>
        </div>
      )}

      {/* headline */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Original net" value={formatSignedUsd(s.originalNetUsd)} />
        <Stat label="What-if net" value={formatSignedUsd(s.newNetUsd)} />
        <Stat
          label="Net delta"
          value={formatSignedUsd(s.netDeltaUsd)}
          tone={s.netDeltaUsd > 0 ? "text-gain" : s.netDeltaUsd < 0 ? "text-loss" : "text-ink"}
        />
      </div>

      {/* honest side-by-side: rescued vs deepened/given back */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Bucket
          title="Improved"
          tone="gain"
          lines={[
            `${s.rescued} losing trades ended better`,
            `${s.winnersExtended} winners extended`,
          ]}
          rows={improved}
        />
        <Bucket
          title="Worse"
          tone="loss"
          lines={[
            `${s.deepened} losing trades ran deeper`,
            `${s.winnersGaveback} winners gave back`,
          ]}
          rows={worsened}
        />
      </div>

      <p className="text-[11px] text-muted">
        {s.withBars} of {s.tradeCount} trades had bars covering the window
        {s.noBars > 0 ? `; ${s.noBars} could not be recomputed (left at their actual result)` : ""}.
        Figures are computed deterministically in integer cents and are reproducible.
      </p>
    </div>
  );
}

function Bucket({
  title,
  tone,
  lines,
  rows,
}: {
  title: string;
  tone: "gain" | "loss";
  lines: string[];
  rows: { trade_id: string; symbol: string; direction: "long" | "short"; delta_usd: number; new_exit_reason: string }[];
}) {
  const color = tone === "gain" ? "var(--gain)" : "var(--loss)";
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        <span className="ml-auto font-mono text-xs text-muted">{rows.length}</span>
      </div>
      <ul className="mt-1 text-xs text-muted">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="mt-3 max-h-56 overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>
            {rows.slice(0, 50).map((r) => (
              <tr key={r.trade_id} className="border-t border-line">
                <td className="py-1.5 font-mono text-ink">{r.symbol}</td>
                <td
                  className="py-1.5 text-[11px]"
                  style={{ color: r.direction === "short" ? "var(--short)" : "var(--long)" }}
                >
                  {r.direction}
                </td>
                <td className="py-1.5 text-muted">{r.new_exit_reason}</td>
                <td
                  className="py-1.5 text-right font-mono tabular-nums"
                  style={{ color }}
                >
                  {formatSignedUsd(r.delta_usd)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-2 text-center text-muted">None.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
