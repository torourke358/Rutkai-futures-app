import { HYPOTHETICAL_DISCLAIMER, HYPOTHETICAL_SHORT } from "@/lib/disclaimers";

// The hypothetical-results disclaimer. Render this anywhere a simulated or
// backtested figure appears.
export default function Disclaimer({ short = false }: { short?: boolean }) {
  return (
    <p className="rounded-lg border border-line bg-surface px-3 py-2 text-[11px] leading-relaxed text-muted">
      {short ? HYPOTHETICAL_SHORT : HYPOTHETICAL_DISCLAIMER}
    </p>
  );
}
