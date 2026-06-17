import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { repairAndPersist } from "@/lib/trades/repair";
import { writeAudit } from "@/lib/audit";

// POST /api/import — accept already-parsed executions from the client wizard,
// insert them as a batch, re-pair the whole history, and persist the column
// mapping for next time. Returns a summary the wizard shows (and a batch id it
// can hand to /api/import/undo).

const ExecIn = z.object({
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  fees: z.number(),
  executed_at: z.string().min(1),
  raw: z.record(z.string(), z.unknown()).optional(),
});

const Body = z.object({
  rows: z.array(ExecIn).min(1).max(50000),
  mapping: z.record(z.string(), z.unknown()).optional(),
});

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

  const batch = crypto.randomUUID();
  const admin = createServiceClient();

  const execRows = body.rows.map((r) => ({
    user_id: user.id,
    symbol: r.symbol,
    side: r.side,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    executed_at: r.executed_at,
    source: "csv",
    import_batch: batch,
    raw: r.raw ?? null,
  }));

  const { error: insErr } = await admin.from("executions").insert(execRows);
  if (insErr) {
    return NextResponse.json(
      { error: "Failed to save executions", detail: insErr.message },
      { status: 500 },
    );
  }

  // Persist the column mapping (RLS-scoped to the user) so the next import is
  // zero-click. Best-effort — don't fail the import on a mapping write error.
  if (body.mapping) {
    await supabase
      .from("import_mappings")
      .upsert({ user_id: user.id, mapping: body.mapping });
  }

  let summary;
  try {
    summary = await repairAndPersist(user.id);
  } catch (err) {
    return NextResponse.json(
      { error: "Pairing failed", detail: String(err) },
      { status: 500 },
    );
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "import",
    entity_id: batch,
    action: "import",
    after_state: { batch, executions: execRows.length, ...summary },
  });

  return NextResponse.json({ batch, executions: execRows.length, ...summary });
}
