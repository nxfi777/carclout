import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth().catch(() => null);
  const me = session?.user?.email as string | undefined;
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const other = searchParams.get("user") || "";
  if (!other) return NextResponse.json({ error: "Missing user" }, { status: 400 });

  const a = String(me).toLowerCase();
  const b = String(other).toLowerCase();
  const key = a <= b ? `${a}|${b}` : `${b}|${a}`;

  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: any;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await db.query(`LIVE SELECT * FROM dm_message WHERE dmKey = $key ORDER BY created_at`, { key });
        const id = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
        liveId = id;
        await db.subscribeLive(liveId, (...args: unknown[]) => {
          try {
            // Note: keep handler sync to satisfy types; filtering handled in GET list
            controller.enqueue(te.encode(`data: ${JSON.stringify(args[0])}\n\n`));
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


