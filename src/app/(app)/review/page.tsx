import { createClient } from "@/lib/supabase/server";
import ReviewChat from "@/components/ReviewChat";

export const dynamic = "force-dynamic";

interface QARow {
  question: string;
  answer: string | null;
}

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: recent } = await supabase
    .from("ai_questions")
    .select("question, answer")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<QARow[]>();

  // Oldest first so the conversation reads top-to-bottom.
  const initial = (recent ?? []).reverse().map((r) => ({
    question: r.question,
    answer: r.answer,
  }));

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-lg font-semibold text-ink">AI Review</h1>
        <p className="mt-1 text-xs text-muted">
          Ask plain-English questions about your trading history. Answers come
          only from your own closed-trade data — this tool never predicts or
          recommends trades.
        </p>
      </div>
      <ReviewChat initial={initial} />
    </div>
  );
}
