import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: any;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Start a LIVE SELECT; returns UUID
        const res = await db.query("LIVE SELECT * FROM user;");
        const id = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
        liveId = id;
        await db.subscribeLive(liveId, (...args: unknown[]) => {
          try {
            const e = args[0] as any;
            const action = e?.action || e?.type || "update";
            const raw = e?.result || e?.record || e;
            const user = raw?.email ? raw : (raw?.after || raw?.data || raw);
            const payload = { op: String(action).toLowerCase(), user: { email: user?.email, name: user?.name, image: user?.image, presence_status: user?.presence_status, role: user?.role, plan: user?.plan } };
            controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {}
        });
      } catch (e) {
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: 'live_failed' })}\n\n`));
      }
    },
    async cancel() {
      try { if (liveId) await db.kill(liveId); } catch {}
    },
  });

  const signal = (request as any).signal as AbortSignal | undefined;
  if (signal) {
    signal.addEventListener("abort", async () => { try { if (liveId) await db.kill(liveId); } catch {} });
  }

  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}


