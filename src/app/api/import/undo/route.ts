import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { repairAndPersist } from "@/lib/trades/repair";
import { writeAudit } from "@/lib/audit";

// POST /api/import/undo — delete a batch's executions and re-pair. Because
// trades are derived from the full execution set, removing the batch's fills
// and re-running repairAndPersist reconciles the trades table automatically.

const Body = z.object({ batch: z.string().uuid() });

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
    return NextResponse.json(
      { error: "Invalid payload", detail: String(err) },
      { status: 400 },
    );
  }

  const admin = createServiceClient();
  const { error: delErr, count } = await admin
    .from("executions")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .eq("import_batch", body.batch);
  if (delErr) {
    return NextResponse.json(
      { error: "Failed to remove executions", detail: delErr.message },
      { status: 500 },
    );
  }

  let summary;
  try {
    summary = await repairAndPersist(user.id);
  } catch (err) {
    return NextResponse.json(
      { error: "Re-pairing failed", detail: String(err) },
      { status: 500 },
    );
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "import",
    entity_id: body.batch,
    action: "delete",
    before_state: { batch: body.batch, executionsRemoved: count ?? null },
    after_state: summary,
  });

  return NextResponse.json({ batch: body.batch, executionsRemoved: count ?? 0, ...summary });
}
