// Unit tests for broker-format auto-detection. Run with `npm test`.
import { strict as assert } from "node:assert";
import test from "node:test";
import { detectExecutionMapping, parseSide } from "./detect.ts";

test("detects NinjaTrader 8 Executions headers", () => {
  const d = detectExecutionMapping(["Instrument", "Action", "Quantity", "Price", "Time", "Commission"]);
  assert.equal(d.broker, "NinjaTrader 8");
  assert.equal(d.complete, true);
  assert.equal(d.mapping.symbol, "Instrument");
  assert.equal(d.mapping.side, "Action");
  assert.equal(d.mapping.executed_at, "Time");
  assert.equal(d.mapping.fees, "Commission");
});

test("detects a Tradovate-style fills export", () => {
  const d = detectExecutionMapping(["Fill Time", "Contract", "B/S", "Filled Qty", "Avg Price"]);
  assert.equal(d.broker, "Tradovate");
  assert.equal(d.complete, true);
  assert.equal(d.mapping.symbol, "Contract");
  assert.equal(d.mapping.side, "B/S");
  assert.equal(d.mapping.quantity, "Filled Qty");
  assert.equal(d.mapping.price, "Avg Price");
  assert.equal(d.mapping.executed_at, "Fill Time");
});

test("detects a generic export and reports incomplete when a field is missing", () => {
  const full = detectExecutionMapping(["Symbol", "Side", "Qty", "Price", "Timestamp"]);
  assert.equal(full.broker, "Generic CSV");
  assert.equal(full.complete, true);

  const missing = detectExecutionMapping(["Symbol", "Qty", "Price", "Timestamp"]); // no side
  assert.equal(missing.complete, false);
});

test("parseSide normalizes broker conventions", () => {
  for (const v of ["Buy", "BUY", "Bot", "BOT", "Long", "B"]) assert.equal(parseSide(v), "buy");
  for (const v of ["Sell", "SELL", "Sld", "SLD", "Short", "S"]) assert.equal(parseSide(v), "sell");
  assert.equal(parseSide(""), null);
  assert.equal(parseSide("xyz"), null);
});
