// Unit tests for tier/feature gating. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { hasFeature, tierAtLeast, type Feature } from "./tiers.ts";

test("free unlocks journal + ai_review only", () => {
  assert.equal(hasFeature("free", "journal"), true);
  assert.equal(hasFeature("free", "ai_review"), true);
  assert.equal(hasFeature("free", "engine"), false);
  assert.equal(hasFeature("free", "byok"), false);
});

test("pro unlocks the engine, what-if, prop, bars — but not byok", () => {
  const proFeatures: Feature[] = ["engine", "whatif", "prop_rules", "bars_import"];
  for (const f of proFeatures) assert.equal(hasFeature("pro", f), true);
  assert.equal(hasFeature("pro", "byok"), false);
});

test("elite unlocks everything including byok", () => {
  assert.equal(hasFeature("elite", "byok"), true);
  assert.equal(hasFeature("elite", "engine"), true);
  assert.equal(hasFeature("elite", "journal"), true);
});

test("tierAtLeast respects ordering", () => {
  assert.equal(tierAtLeast("pro", "free"), true);
  assert.equal(tierAtLeast("free", "pro"), false);
  assert.equal(tierAtLeast("elite", "pro"), true);
  assert.equal(tierAtLeast("elite", "elite"), true);
});
