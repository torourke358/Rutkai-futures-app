import { getAnthropic, CLAUDE_MODEL, NARRATION_SYSTEM_PROMPT } from "@/lib/claude";
import { lintPrescriptive, regenerationHint } from "@/lib/ai/lint";
import { formatSignedUsd, formatUsd } from "@/lib/format";

// ROLE 2 of the two-role AI contract: narrate ALREADY-COMPUTED what-if figures
// in plain language, behind the prescriptive-language lint. The numbers come in
// fully computed (deterministic, integer-cents -> dollars at the edge); the
// model only restates them. On a lint hit it regenerates once, then falls back
// to a deterministic sentence — so a narration is ALWAYS safe, even offline.

export interface NarrationInput {
  symbol: string; // instrument symbol or "all"
  tradeCount: number;
  withBars: number;
  rescued: number;
  deepened: number;
  winnersGaveback: number;
  winnersExtended: number;
  originalNetUsd: number;
  newNetUsd: number;
  netDeltaUsd: number;
  params: { stopPoints: number | null; targetR: number | null; exitRule: string };
}

export async function narrateSweep(
  input: NarrationInput,
): Promise<{ narration: string; guarded: boolean }> {
  const content =
    "These are ALREADY-COMPUTED results from re-running my OWN past trades under a " +
    "different parameter. Narrate them using ONLY these numbers.\n\n" +
    JSON.stringify(input);

  try {
    const client = getAnthropic();
    const ask = async (extra?: string) => {
      const msg = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        system: extra ? `${NARRATION_SYSTEM_PROMPT}\n\n${extra}` : NARRATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
      return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();
    };

    let text = await ask();
    let lint = lintPrescriptive(text);
    let guarded = false;
    if (lint.flagged) {
      guarded = true;
      text = await ask(regenerationHint(lint.hits));
      lint = lintPrescriptive(text);
      if (lint.flagged) text = deterministicNarration(input);
    }
    return { narration: text, guarded };
  } catch {
    // No model / error → the deterministic sentence is always safe to show.
    return { narration: deterministicNarration(input), guarded: true };
  }
}

// The guaranteed-safe, number-faithful fallback. Never advises adopting the
// parameter; always mentions both rescued and given-back/deepened sides.
export function deterministicNarration(i: NarrationInput): string {
  const dir = i.netDeltaUsd >= 0 ? "higher" : "lower";
  const label = i.symbol === "all" ? "your trades" : `your ${i.symbol} trades`;
  return (
    `Re-running ${i.withBars} of ${label} under this parameter: ` +
    `${i.rescued} losing trades would have ended better and ${i.deepened} would have run deeper; ` +
    `${i.winnersGaveback} winners gave back while ${i.winnersExtended} extended. ` +
    `Net realized P&L would have been ${formatUsd(Math.abs(i.netDeltaUsd))} ${dir} ` +
    `(from ${formatSignedUsd(i.originalNetUsd)} to ${formatSignedUsd(i.newNetUsd)}). ` +
    `This describes what your own history would have done — not what to do next.`
  );
}
