import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensureInstrument } from "@/lib/instruments";
import { writeAudit } from "@/lib/audit";

// POST /api/bars/import — accept already-parsed OHLCV bars from the client
// (parsed in the trader's local tz), resolve/create the instrument, and UPSERT
// the bars. The unique (instrument_id, timeframe, ts) key makes re-importing
// the same export a no-op instead of duplicating bars. No live anything — this
// is read data the analysis + simulated fills run against.

const BarIn = z.object({
  ts: z.string().min(1),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  volume: z.number().nullable(),
});

const Body = z.object({
  symbol: z.string().min(1).max(20),
  timeframe: z.string().min(1).max(10).default("1m"),
  bars: z.array(BarIn).min(1).max(200000),
});

const CHUNK = 1000;

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

  let instrument;
  try {
    instrument = await ensureInstrument(admin, user.id, body.symbol);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not resolve instrument", detail: String(err) },
      { status: 500 },
    );
  }

  const rows = body.bars.map((b) => ({
    user_id: user.id,
    instrument_id: instrument.id,
    ts: b.ts,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    timeframe: body.timeframe,
  }));

  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await admin
      .from("bars")
      .upsert(slice, { onConflict: "instrument_id,timeframe,ts", ignoreDuplicates: false });
    if (error) {
      return NextResponse.json(
        { error: "Failed to save bars", detail: error.message, savedSoFar: upserted },
        { status: 500 },
      );
    }
    upserted += slice.length;
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "bars",
    entity_id: instrument.id,
    action: "import",
    after_state: {
      symbol: instrument.symbol,
      timeframe: body.timeframe,
      bars: upserted,
    },
  });

  return NextResponse.json({
    instrument: instrument.symbol,
    instrument_id: instrument.id,
    timeframe: body.timeframe,
    upserted,
  });
}
