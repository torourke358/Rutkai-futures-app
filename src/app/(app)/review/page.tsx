export const dynamic = "force-dynamic";

export default function ReviewPage() {
  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-lg font-semibold text-slate-100">AI Review</h1>
      <div className="rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--border)] space-y-3">
        <p className="text-sm text-slate-300">
          Ask plain-English questions about your trading history. The chat
          panel + suggested-question chips ship in the next build pass.
        </p>
        <p className="text-xs text-slate-500">
          Backend (<code className="rounded bg-[var(--surface-2)] px-1 text-xs">/api/ask</code>{" "}
          server route + Anthropic wrapper) is already plumbed in{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 text-xs">
            src/lib/claude.ts
          </code>
          .
        </p>
      </div>
    </div>
  );
}
