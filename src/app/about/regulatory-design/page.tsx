import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thor — Regulatory design notes",
  description:
    "A plain-language description of what the Thor software does, and a list of questions for counsel.",
};

// Public, plain-language page for the owner's futures/securities attorney. It
// states FACTS about the software and asks QUESTIONS. It deliberately makes no
// legal conclusions and does not assert the product is or isn't compliant —
// that is counsel's call.
export default function RegulatoryDesignPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-5 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Thor</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          Regulatory-design notes
        </h1>
        <p className="mt-2 text-sm text-muted">
          For review by counsel. This page describes what the software does and
          lists open questions. It is not legal advice and makes no claim about
          compliance.
        </p>
      </header>

      <Section title="What the software does (factual)">
        <ul className="space-y-2">
          <Fact>
            It generates individualized, per-trade futures recommendations —
            entry price, stop, target, and position size — from a strategy the
            owner configures.
          </Fact>
          <Fact>
            Every recommendation requires an explicit, per-trade human{" "}
            <strong className="font-semibold text-ink">approval</strong>. The
            engine proposes; it never auto-executes.
          </Fact>
          <Fact>
            Approved trades route only to an internal{" "}
            <strong className="font-semibold text-ink">simulated</strong> account
            that fills against the user&apos;s own imported bar data.
          </Fact>
          <Fact>
            There is <strong className="font-semibold text-ink">no live broker
            connection</strong> and no live-money routing anywhere in the build.
            A live adapter is left unimplemented behind a hardcoded disabled flag.
          </Fact>
          <Fact>
            It makes <strong className="font-semibold text-ink">no performance
            or profit claims</strong>. Any simulated figure is labeled
            hypothetical and carries a hypothetical-results disclaimer.
          </Fact>
          <Fact>
            The shipped entry logic is a clearly-labeled placeholder (a plain
            moving-average crossover) presented as an example, not an edge. No
            third party&apos;s trading method is encoded anywhere.
          </Fact>
          <Fact>
            Every generated candidate, every approve/reject decision, and every
            simulated fill is written to an append-only audit log with actor and
            timestamp.
          </Fact>
        </ul>
      </Section>

      <Section title="What the software does not do (factual)">
        <ul className="space-y-2">
          <Fact>It does not connect to, or place orders with, any broker.</Fact>
          <Fact>It does not move, hold, or have access to client money.</Fact>
          <Fact>It does not predict prices or market direction.</Fact>
          <Fact>
            It does not present simulated results as indicative of future
            results.
          </Fact>
        </ul>
      </Section>

      <Section title="Questions for counsel">
        <p className="mb-3 text-sm text-muted">
          These are stated as questions and software facts, not as legal
          conclusions, for counsel to assess:
        </p>
        <ul className="space-y-3">
          <Question>
            Given the software generates individualized per-trade futures
            recommendations, what CTA registration considerations apply under the
            CFTC and NFA — e.g., Form 7-R, the Series 3 requirement for
            principals/APs, and filing and NFA acceptance of a disclosure
            document?
          </Question>
          <Question>
            Is the intended offering an{" "}
            <strong className="font-semibold text-ink">advice-only</strong> tool
            (the owner&apos;s own use, or recommendations a user approves
            themselves) or a{" "}
            <strong className="font-semibold text-ink">managed-account</strong>{" "}
            service? Does that distinction change the registration or exemption
            analysis?
          </Question>
          <Question>
            What marketing and performance-advertising constraints apply to any
            figures shown — including simulated/hypothetical results — and is the
            current hypothetical-results disclaimer sufficient and correctly
            placed?
          </Question>
          <Question>
            What recordkeeping obligations apply (e.g., retention of
            recommendations, approvals, and communications), and does the
            append-only audit log meet them?
          </Question>
          <Question>
            If a third-party strategy is ever licensed into the entry-plugin
            slot, what should the scope agreement say about strategy ownership and
            allocation of loss liability before any live use is contemplated?
          </Question>
          <Question>
            What preconditions must be satisfied before any live-execution
            capability could be designed or enabled?
          </Question>
        </ul>
      </Section>

      <p className="mt-10 border-t border-line pt-6 text-xs text-muted">
        This document is a description of software behavior prepared to assist
        legal review. It is not legal advice and does not assert that the product
        is or is not compliant with any law or rule.
      </p>

      <Link
        href="/dashboard"
        className="mt-6 inline-block text-sm text-muted hover:text-ink"
      >
        ← Back to app
      </Link>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--gain)" }} />
      <span className="text-muted">{children}</span>
    </li>
  );
}

function Question({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
      <span className="text-muted">{children}</span>
    </li>
  );
}
