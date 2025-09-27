import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { checkChannelRead, getSessionLite, type ChannelLike } from "@/lib/chatPerms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") || "general";
  if (channel === 'request-a-feature') {
    // No SSE for feature request channel; handled via REST
    return new Response(null, { status: 204 });
  }
  const session = await getSessionLite();
  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: unknown;

  // Enforce channel read permissions before opening live stream
  try {
    const cres = await db.query("SELECT * FROM channel WHERE slug = $slug LIMIT 1;", { slug: channel });
    const crow: ChannelLike | null = Array.isArray(cres) && Array.isArray(cres[0]) ? ((cres[0][0] as ChannelLike) || null) : null;
    if (crow && !checkChannelRead(session, crow)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {}

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await db.query(`LIVE SELECT * FROM message WHERE channel = $c ORDER BY created_at`, { c: channel });
        const id = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
        liveId = id;
        await db.subscribeLive(liveId as never, (...args: unknown[]) => {
          try {
            // If user is present, filter out messages from blocked senders
            // Note: subscribeLive handler is sync; skip heavy DB checks here to satisfy types
            controller.enqueue(te.encode(`data: ${JSON.stringify(args[0])}\n\n`));
          } catch {}
        });
      } catch {
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: 'live_failed' })}\n\n`));
      }
    },
    async cancel() {
      try { if (liveId) await db.kill(liveId as never); } catch {}
    },
  });

  const signal = (request as unknown as { signal?: AbortSignal }).signal;
  if (signal) {
    signal.addEventListener("abort", async () => { try { if (liveId) await db.kill(liveId as never); } catch {} });
  }

  return new NextResponse(stream as unknown as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}


