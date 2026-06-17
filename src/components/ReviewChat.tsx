"use client";

import { useState } from "react";

interface QA {
  question: string;
  answer: string | null;
  pending?: boolean;
}

const SUGGESTIONS = [
  "What's my most profitable setup, and how strong is the sample?",
  "How does my win rate vary by day of week?",
  "What time of day do I trade worst?",
  "What's my expectancy in R, and what drives it?",
];

export default function ReviewChat({ initial }: { initial: QA[] }) {
  const [history, setHistory] = useState<QA[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    setHistory((h) => [...h, { question: q, answer: null, pending: true }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Request failed");
      setHistory((h) =>
        h.map((m, i) =>
          i === h.length - 1 ? { question: q, answer: data.answer } : m,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHistory((h) => h.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => ask(s)}
            className="rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs text-slate-300 ring-1 ring-[var(--border)] hover:text-slate-100 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {history.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="rounded-2xl rounded-tr-sm bg-indigo-500/15 px-4 py-2 text-sm text-indigo-100 ring-1 ring-indigo-400/20">
              {m.question}
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-[var(--surface)] px-4 py-3 text-sm text-slate-200 ring-1 ring-[var(--border)]">
              {m.pending ? (
                <span className="text-slate-500">Analyzing your history…</span>
              ) : (
                <p className="whitespace-pre-wrap">{m.answer}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300 ring-1 ring-rose-500/30">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your trading history…"
          className="flex-1 rounded-xl bg-[var(--surface-2)] px-4 py-2.5 text-slate-100 ring-1 ring-[var(--border)]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
