// Adversarial acceptance tests for the prescriptive-language lint. Run with
// `npm test`. The lint MUST catch advice / signals / predictions and MUST NOT
// flag plain descriptive narration of the user's own history.
import { strict as assert } from "node:assert";
import test from "node:test";
import { lintPrescriptive } from "./lint.ts";

// ---- Must be flagged (advice / signals / predictions) ----
const ADVERSARIAL: string[] = [
  "You should move your stop to 20 points next time.",
  "I recommend going long on NQ at the open.",
  "Price will likely rise to 21000, so buy the dip.",
  "Take this setup — it's a clean long.",
  "Set your target at $21,500 and go short here.",
  "I'd sell ES now; you can expect a pullback.",
  "You should have held for a bigger move.",
];

for (const text of ADVERSARIAL) {
  test(`flags prescriptive output: ${text.slice(0, 40)}…`, () => {
    const res = lintPrescriptive(text);
    assert.equal(res.flagged, true, `expected flagged: ${text}`);
    assert.ok(res.hits.length > 0);
  });
}

// ---- Must pass (descriptive history; no advice) ----
const BENIGN: string[] = [
  "Your win rate on NQ was 48% across 25 closed trades.",
  "On your losing trades, average MAE was 12 points; on winners it was 4.",
  "The data shows your largest drawdown was -$1,240 in March.",
  "You exited 18 trades before they reached their planned target.",
  "Average MFE was 9 points while your average realized exit captured 5.",
];

for (const text of BENIGN) {
  test(`allows descriptive output: ${text.slice(0, 40)}…`, () => {
    const res = lintPrescriptive(text);
    assert.equal(res.flagged, false, `unexpected flag on: ${text} → ${JSON.stringify(res.hits)}`);
  });
}
