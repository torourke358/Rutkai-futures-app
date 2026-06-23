import { z } from "zod";
import { getAnthropic, CLAUDE_MODEL, PARAM_MAPPING_SYSTEM_PROMPT } from "@/lib/claude";
import { parseParamsHeuristic } from "@/lib/analysis/whatifParams";
import type { SweepParams } from "@/lib/analysis/whatif";

// ROLE 1 of the two-role AI contract: map a natural-language question to a
// structured what-if parameter set. The AI ONLY suggests parameters (which the
// user sees and can edit in the controls before running) — it never computes a
// result. The deterministic parseParamsHeuristic (whatifParams.ts) is the
// baseline and the offline fallback, so this never depends on the model being
// reachable to produce sane params.

export const ParamSchema = z.object({
  stopPoints: z.number().positive().max(2000).nullable(),
  targetR: z.number().positive().max(50).nullable(),
  exitRule: z.enum(["stop_target", "stop_eod", "eod"]),
});

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// AI mapping with the heuristic as a guaranteed fallback. Server-only (reads the
// Anthropic key). The model returns JSON ONLY; we validate with zod and never
// trust it to compute anything.
export async function mapQuestionToParams(
  question: string,
): Promise<{ params: SweepParams; source: "ai" | "heuristic" }> {
  const heuristic = parseParamsHeuristic(question);
  try {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system: PARAM_MAPPING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const parsed = ParamSchema.safeParse(extractJson(text));
    if (parsed.success) {
      return { params: parsed.data, source: "ai" };
    }
  } catch {
    // fall through to the deterministic heuristic
  }
  return { params: heuristic, source: "heuristic" };
}
