// Unit tests for the deterministic what-if param parser. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { parseParamsHeuristic } from "./whatifParams.ts";

test("parses a stop distance from natural language", () => {
  assert.deepEqual(parseParamsHeuristic("what if I used a 30 point stop?"), {
    stopPoints: 30,
    targetR: null,
    exitRule: "stop_eod",
  });
  assert.equal(parseParamsHeuristic("stop of 25 instead").stopPoints, 25);
});

test("parses a target R-multiple", () => {
  const p = parseParamsHeuristic("30 point stop with a 2R target");
  assert.equal(p.stopPoints, 30);
  assert.equal(p.targetR, 2);
  assert.equal(p.exitRule, "stop_target");
});

test("detects an end-of-session exit", () => {
  assert.equal(parseParamsHeuristic("what if I held to the close?").exitRule, "eod");
  assert.equal(parseParamsHeuristic("an end-of-session exit").exitRule, "eod");
  assert.equal(parseParamsHeuristic("exit at EOD").exitRule, "eod");
});

test("defaults to stop_target when nothing specific is found", () => {
  const p = parseParamsHeuristic("how would my trades look different?");
  assert.equal(p.stopPoints, null);
  assert.equal(p.targetR, null);
  assert.equal(p.exitRule, "stop_target");
});
