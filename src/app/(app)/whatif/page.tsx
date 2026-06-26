import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/billing/plan";
import WhatIfPanel from "@/components/WhatIfPanel";

export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  await requireFeature("whatif");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: instruments } = await supabase
    .from("instruments")
    .select("symbol")
    .eq("user_id", user!.id)
    .order("symbol")
    .returns<{ symbol: string }[]>();

  const symbols = (instruments ?? []).map((i) => i.symbol);

  return (
    <div className="space-y-4 pb-8">
      <h1 className="font-display text-lg font-semibold text-ink">What-if sweep</h1>
      <p className="text-sm text-muted">
        Re-run your own past trades under a different parameter to see what your
        history would have realized. This is a retrospective recomputation of
        trades you already took — not a suggestion to change anything going
        forward.
      </p>
      <WhatIfPanel symbols={symbols} />
    </div>
  );
}
