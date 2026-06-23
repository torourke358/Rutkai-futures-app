// Prescriptive-language lint.
//
// The AI layer is allowed to DESCRIBE the user's own historical trades and
// narrate precomputed numbers. It is NOT allowed to give advice, signals, or
// predictions. This lint scans model output BEFORE it is shown and flags
// forward-looking / imperative / recommendation language so the caller can
// regenerate once and then fall back to raw metrics with no prose.
//
// Pure and deterministic so it is fully unit-tested (see lint.test.ts) — the
// adversarial-prompt acceptance test asserts these rules catch advice.

export interface LintHit {
  rule: string;
  match: string;
}

export interface LintResult {
  flagged: boolean;
  hits: LintHit[];
}

// Each rule pairs a human label with a regex. Rules target the THREE banned
// behaviors: second-person imperatives ("you should…"), first-person
// recommendations ("I recommend…"), and future-tense market predictions
// ("price will…"). They are intentionally specific to avoid flagging benign
// descriptive phrasing like "the data shows" or "you exited".
const RULES: { rule: string; re: RegExp }[] = [
  { rule: "imperative-advice", re: /\byou\s+(should|need to|ought to|must|have to)\b/i },
  { rule: "hindsight-advice", re: /\bshould\s+have\s+(bought|sold|held|entered|exited|waited|stayed)\b/i },
  { rule: "recommendation", re: /\b(i|we)\s+(recommend|suggest|advise)\b/i },
  { rule: "recommendation", re: /\b(i'?d|i\s+would|we'?d)\s+(buy|sell|short|go\s+long|go\s+short|enter|take|recommend)\b/i },
  { rule: "next-time", re: /\bnext\s+time\b/i },
  { rule: "directive-entry", re: /\bgo\s+(long|short)\b/i },
  { rule: "directive-entry", re: /\b(buy|sell|short|enter|long)\s+(it|the|this|here|now|at|a\b|the\s+dip)\b/i },
  { rule: "directive-stop", re: /\b(set|place|move|widen|tighten)\s+(your|a|the)\s+(stop|target|order)\b/i },
  { rule: "take-the-trade", re: /\btake\s+(the|this|that)\s+(trade|setup|entry|long|short)\b/i },
  { rule: "future-target", re: /\btarget\s+(of|at|price\s+of)\s*\$?\d/i },
  { rule: "prediction", re: /\b(price|it|market|nq|es|ym|cl|the\s+\w+)\s+(will|is\s+going\s+to|should|'ll)\s+(rise|fall|drop|climb|reach|hit|break|go|move|rally|sell\s*off|bounce|continue)\b/i },
  { rule: "prediction", re: /\b(i|we)\s+(expect|anticipate|predict|forecast)\b/i },
  { rule: "prediction", re: /\byou\s+can\s+expect\b/i },
  { rule: "prediction", re: /\b(likely|probably)\s+(to\s+)?(rise|fall|drop|reach|hit|break|continue|reverse)\b/i },
];

export function lintPrescriptive(text: string): LintResult {
  const hits: LintHit[] = [];
  for (const { rule, re } of RULES) {
    const m = text.match(re);
    if (m) hits.push({ rule, match: m[0] });
  }
  return { flagged: hits.length > 0, hits };
}

// An explicit instruction appended on the single regeneration attempt, naming
// what tripped the lint so the model can rephrase descriptively.
export function regenerationHint(hits: LintHit[]): string {
  const phrases = [...new Set(hits.map((h) => `"${h.match}"`))].join(", ");
  return (
    `Your previous answer used forward-looking or advice language (${phrases}). ` +
    `Rewrite it as a purely descriptive statement about what the trader's OWN ` +
    `historical data shows. Do not recommend any action, do not predict prices, ` +
    `and do not use second-person imperatives.`
  );
}
