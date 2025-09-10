import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

const CALL_ID = "ignite-global";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: any;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await db.query("LIVE SELECT * FROM livestream_status WHERE callId = $callId", { callId: CALL_ID });
        const id = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
        liveId = id;
        await db.subscribeLive(liveId, (...args: unknown[]) => {
          try {
            const event = args[0] as any;
            const raw = event?.result || event?.record || event?.data || event;
            const after = raw?.after || raw;
            const payload = {
              isLive: !!after?.isLive,
              sessionSlug: after?.sessionSlug || null,
              updated_at: after?.updated_at || null,
              started_at: after?.started_at || null,
              ended_at: after?.ended_at || null,
            };
            controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {}
        });
        // Emit current snapshot
        try {
          const r = await db.query("SELECT * FROM livestream_status WHERE callId = $callId LIMIT 1;", { callId: CALL_ID });
          const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as any) : null;
          const payload = {
            isLive: !!row?.isLive,
            sessionSlug: row?.sessionSlug || null,
            updated_at: row?.updated_at || null,
            started_at: row?.started_at || null,
            ended_at: row?.ended_at || null,
          };
          controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {}
      } catch (e) {
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: 'live_failed' })}\n\n`));
      }
    },
    async cancel() { try { if (liveId) await db.kill(liveId); } catch {} },
  });

  const res = new NextResponse(stream as any, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

  const signal = (request as any).signal as AbortSignal | undefined;
  if (signal) {
    signal.addEventListener("abort", async () => { try { if (liveId) await db.kill(liveId); } catch {} });
  }

  return res;
}


