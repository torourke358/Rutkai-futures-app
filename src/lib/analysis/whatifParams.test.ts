// Unit tests for the deterministic what-if param parser. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { parseParamsHeuristic } from "./whatifParams.ts";

test("parses a stop distance from natural language", () => {
  const p = parseParamsHeuristic("what if I used a 30 point stop?");
  assert.equal(p.stopPoints, 30);
  assert.equal(p.targetR, null);
  assert.equal(p.exitRule, "stop_eod");
  assert.equal(p.stopMode, "points");
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

test("detects a trailing stop", () => {
  const p = parseParamsHeuristic("what if I trailed my stop by 20 points?");
  assert.equal(p.exitRule, "trailing");
  assert.equal(p.stopPoints, 20);
});

test("detects a breakeven / risk-free move", () => {
  assert.equal(parseParamsHeuristic("move to breakeven after 1R with a 25 pt stop").exitRule, "breakeven");
  assert.equal(parseParamsHeuristic("what if I went risk free?").exitRule, "breakeven");
});

test("detects a time exit with minutes", () => {
  const p = parseParamsHeuristic("what if I held for 15 minutes max?");
  assert.equal(p.exitRule, "time");
  assert.equal(p.timeMinutes, 15);
});

test("detects an ATR-sized stop", () => {
  const p = parseParamsHeuristic("use a 2x ATR stop");
  assert.equal(p.stopMode, "atr");
  assert.equal(p.atrMultiple, 2);
});

test("defaults to stop_target when nothing specific is found", () => {
  const p = parseParamsHeuristic("how would my trades look different?");
  assert.equal(p.stopPoints, null);
  assert.equal(p.targetR, null);
  assert.equal(p.exitRule, "stop_target");
});
