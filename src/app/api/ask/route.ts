import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL, ANALYST_SYSTEM_PROMPT } from "@/lib/claude";
import { lintPrescriptive, regenerationHint } from "@/lib/ai/lint";
import { annotateRisk, type RiskSettings, type CashFlow } from "@/lib/risk";
import {
  computeStats,
  sliceStats,
  sliceByDayOfWeek,
  sliceByHourOfDay,
  type TradeForStats,
} from "@/lib/analytics/stats";

const Body = z.object({ question: z.string().min(1).max(2000) });

interface ClosedRow {
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  realized_pnl: number | null;
  fees: number | null;
  entry_at: string;
  exit_at: string;
  setup_tag: string | null;
  tags: string[] | null;
  risk_amount: number | null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "Invalid payload", detail: String(err) }, { status: 400 });
  }

  const [{ data: closed }, { data: settings }, { data: flows }] =
    await Promise.all([
      supabase
        .from("trades")
        .select(
          "symbol, direction, quantity, realized_pnl, fees, entry_at, exit_at, setup_tag, tags, risk_amount",
        )
        .eq("status", "closed")
        .returns<ClosedRow[]>(),
      supabase
        .from("risk_settings")
        .select(
          "method, default_risk_dollars, account_balance, risk_percent, starting_balance, starting_at",
        )
        .eq("user_id", user.id)
        .maybeSingle<RiskSettings>(),
      supabase.from("cash_flows").select("amount, occurred_at").returns<CashFlow[]>(),
    ]);

  const annotated = annotateRisk(
    (closed ?? []).map((t) => ({
      ...t,
      realized_pnl: t.realized_pnl ?? 0,
      fees: t.fees ?? 0,
    })),
    settings ?? null,
    flows ?? [],
  );
  const trades: TradeForStats[] = annotated.map((t) => ({
    symbol: t.symbol,
    direction: t.direction,
    quantity: t.quantity,
    realized_pnl: t.realized_pnl,
    fees: t.fees,
    entry_at: t.entry_at,
    exit_at: t.exit_at,
    setup_tag: t.setup_tag,
    tags: t.tags,
    r: t.r,
  }));

  // Compact, server-side summary — raw trade rows never leave the server.
  const exits = trades.map((t) => t.exit_at).sort();
  const summary = {
    totalClosedTrades: trades.length,
    dateRange: trades.length
      ? { first: exits[0], last: exits[exits.length - 1] }
      : null,
    riskModel: settings?.method ?? "not configured",
    overall: computeStats(trades),
    bySetup: sliceStats(trades, (t) => [t.setup_tag ?? "(unset)"]).slice(0, 10),
    byInstrument: sliceStats(trades, (t) => [t.symbol]).slice(0, 10),
    byDayOfWeek: sliceByDayOfWeek(trades),
    byHourOfDay: sliceByHourOfDay(trades),
  };

  const baseContent = `Here is a JSON summary of my closed trades. Answer using ONLY this data.\n\nSUMMARY:\n${JSON.stringify(
    summary,
  )}\n\nQUESTION: ${body.question}`;

  let answer = "";
  let guarded = false; // true if the prescriptive-language lint intervened
  try {
    const client = getAnthropic();

    const ask = async (extraSystem?: string) => {
      const msg = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: extraSystem
          ? `${ANALYST_SYSTEM_PROMPT}\n\n${extraSystem}`
          : ANALYST_SYSTEM_PROMPT,
        messages: [{ role: "user", content: baseContent }],
      });
      return msg.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n")
        .trim();
    };

    answer = await ask();

    // Scan the output BEFORE returning it. On a hit, regenerate exactly once
    // with a targeted instruction; if it still trips the lint, withhold the
    // prose entirely and return the raw precomputed metrics instead.
    let lint = lintPrescriptive(answer);
    if (lint.flagged) {
      guarded = true;
      answer = await ask(regenerationHint(lint.hits));
      lint = lintPrescriptive(answer);
      if (lint.flagged) {
        answer = rawMetricsFallback(summary);
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: "AI request failed", detail: String(err) },
      { status: 502 },
    );
  }

  await supabase
    .from("ai_questions")
    .insert({ user_id: user.id, question: body.question, answer });

  return NextResponse.json({ answer, guarded });
}

// No-prose fallback: just the precomputed numbers, so a question that keeps
// steering the model toward advice degrades to a plain description of the
// user's own history rather than ever shipping a recommendation.
function rawMetricsFallback(summary: {
  totalClosedTrades: number;
  overall: {
    netPnl: number;
    winRate: number;
    expectancy: number;
    profitFactor: number | null;
    avgR: number | null;
    maxDrawdown: number;
    largestWin: number;
    largestLoss: number;
  };
}): string {
  const s = summary.overall;
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  return [
    "I can only describe your own historical data, so here are the raw numbers:",
    `• Closed trades: ${summary.totalClosedTrades}`,
    `• Net P&L: ${s.netPnl}`,
    `• Win rate: ${pct(s.winRate)}`,
    `• Expectancy: ${s.expectancy} per trade`,
    `• Profit factor: ${s.profitFactor ?? "n/a"}`,
    `• Average R: ${s.avgR ?? "n/a"}`,
    `• Max drawdown: ${s.maxDrawdown}`,
    `• Largest win / loss: ${s.largestWin} / ${s.largestLoss}`,
  ].join("\n");
}
