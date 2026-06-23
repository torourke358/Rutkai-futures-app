import type { SweepParams, ExitRule } from "./whatif.ts";

// Deterministic keyword parser for what-if questions. Pure and dependency-free
// (type-only import) so it is the guaranteed offline fallback for the AI param
// mapping AND is unit-tested directly. The AI may refine these, but the human
// always sees/edits the resulting controls before a sweep runs.
export function parseParamsHeuristic(question: string): SweepParams {
  const q = question.toLowerCase();

  let stopPoints: number | null = null;
  const stopMatch =
    q.match(/(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:point|pt|tick)s?\s*stop/) ??
    q.match(/stop\s*(?:of|to|at)?\s*(\d+(?:\.\d+)?)/);
  if (stopMatch) stopPoints = Number(stopMatch[1]);

  let targetR: number | null = null;
  const targetMatch =
    q.match(/(\d+(?:\.\d+)?)\s*r\b/) ?? q.match(/target\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*r/);
  if (targetMatch) targetR = Number(targetMatch[1]);

  const eod =
    /end[\s-]*of[\s-]*(?:session|day)|\beod\b|(?:hold(?:ing)?|held) to (?:the )?close|session exit|close of (?:the )?(?:day|session)/.test(
      q,
    );

  let exitRule: ExitRule;
  if (eod) exitRule = "eod";
  else if (stopPoints != null && targetR == null) exitRule = "stop_eod";
  else exitRule = "stop_target";

  return { stopPoints, targetR, exitRule };
}
