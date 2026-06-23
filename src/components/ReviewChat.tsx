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
            className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted ring-1 ring-line hover:text-ink disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {history.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-2 text-sm text-ink ring-1 ring-line">
              {m.question}
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-card px-4 py-3 text-sm text-ink ring-1 ring-line">
              {m.pending ? (
                <span className="text-muted">Analyzing your history…</span>
              ) : (
                <p className="whitespace-pre-wrap">{m.answer}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-loss/10 p-3 text-sm text-loss ring-1 ring-loss/30">
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
          className="flex-1 rounded-xl bg-white border border-line px-4 py-2.5 text-ink ring-1 ring-line focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
