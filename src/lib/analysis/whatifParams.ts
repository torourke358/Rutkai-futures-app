import type { SweepParams, ExitRule, StopMode } from "./whatif.ts";

// Deterministic keyword parser for what-if questions. Pure and dependency-free
// (type-only import) so it is the guaranteed offline fallback for the AI param
// mapping AND is unit-tested directly. The AI may refine these, but the human
// always sees/edits the resulting controls before a sweep runs.
export function parseParamsHeuristic(question: string): SweepParams {
  const q = question.toLowerCase();
  const num = (re: RegExp): number | null => {
    const m = q.match(re);
    return m ? Number(m[1]) : null;
  };

  const stopPoints =
    num(/(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:point|pt|tick)s?\s*(?:stop|trail)/) ?? // "30 point stop"
    num(/(?:stop|trail)\w*\s*(?:of|to|at|by)?\s*(\d+(?:\.\d+)?)/) ?? // "stop by 20", "trail to 15"
    num(/(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:point|pt|tick)s?\b/); // bare "20 points"
  const targetR =
    num(/(\d+(?:\.\d+)?)\s*r\b/) ?? num(/target\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*r/);

  // ATR-sized stop: "2 ATR", "1.5x ATR", or a bare "atr" (default 1×).
  const atrMultiple = num(/(\d+(?:\.\d+)?)\s*(?:x|×|\*)?\s*atr/) ?? (/\batr\b/.test(q) ? 1 : null);
  const stopMode: StopMode = atrMultiple != null ? "atr" : "points";

  const timeMinutes = num(/(\d+)\s*-?\s*min(?:ute)?s?/);
  const wantsBreakeven = /(break\s*-?\s*even|risk[\s-]*free)/.test(q);
  const wantsTrailing = /\btrail/.test(q);
  const wantsTime =
    (timeMinutes != null && /(hold|held|keep|after|exit|close|time)/.test(q)) ||
    /\btime\s*(stop|exit)\b/.test(q);
  const wantsEod =
    /end[\s-]*of[\s-]*(?:session|day)|\beod\b|(?:hold(?:ing)?|held) to (?:the )?close|session exit|close of (?:the )?(?:day|session)/.test(
      q,
    );

  let exitRule: ExitRule;
  if (wantsTrailing) exitRule = "trailing";
  else if (wantsBreakeven) exitRule = "breakeven";
  else if (wantsTime) exitRule = "time";
  else if (wantsEod) exitRule = "eod";
  else if (stopPoints != null && targetR == null && stopMode === "points") exitRule = "stop_eod";
  else exitRule = "stop_target";

  return {
    exitRule,
    stopMode,
    stopPoints,
    atrMultiple,
    targetR,
    breakevenR: exitRule === "breakeven" ? (num(/after\s*(\d+(?:\.\d+)?)\s*r/) ?? 1) : null,
    timeMinutes: exitRule === "time" ? timeMinutes : null,
  };
}
