import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const role = (session as any)?.user?.role || (session as any)?.user?.plan || null;
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(50, parseInt(String(searchParams.get("limit") || "50"))));

  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: any;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Initial search snapshot
        try {
          const res = await db.query(
            q
              ? `SELECT name, email, credits_balance FROM user WHERE name @@ $q OR email @@ $q LIMIT $limit;`
              : `SELECT name, email, credits_balance FROM user ORDER BY string::lower(name) LIMIT $limit;`,
            { q, limit }
          );
          const rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : []).map((r) => ({
            name: r?.name || null,
            email: String(r?.email || ""),
            credits: typeof r?.credits_balance === "number" ? Number(r.credits_balance) : 0,
          }));
          controller.enqueue(te.encode(`data: ${JSON.stringify({ users: rows })}\n\n`));
        } catch {}

        // Live subscription to user table; we'll filter in handler
        const res2 = await db.query("LIVE SELECT * FROM user");
        const id = Array.isArray(res2) && res2[0] ? (Array.isArray(res2[0]) ? res2[0][0] : res2[0]) : res2;
        liveId = id;
        await db.subscribeLive(liveId, async (..._args: unknown[]) => {
          try {
            const res = await db.query(
              q
                ? `SELECT name, email, credits_balance FROM user WHERE name @@ $q OR email @@ $q LIMIT $limit;`
                : `SELECT name, email, credits_balance FROM user ORDER BY string::lower(name) LIMIT $limit;`,
              { q, limit }
            );
            const rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : []).map((r) => ({
              name: r?.name || null,
              email: String(r?.email || ""),
              credits: typeof r?.credits_balance === "number" ? Number(r.credits_balance) : 0,
            }));
            controller.enqueue(te.encode(`data: ${JSON.stringify({ users: rows })}\n\n`));
          } catch {}
        });
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


