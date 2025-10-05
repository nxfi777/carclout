import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import type { Uuid } from "surrealdb";
import { verifyAdminLiveToken } from "@/lib/admin-live-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = String(searchParams.get("token") || "");
  const payload = verifyAdminLiveToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = String(searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(50, parseInt(String(searchParams.get("limit") || "50"))));

  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: Uuid | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Initial search snapshot
        try {
          const res = await db.query(
            q
              ? `SELECT name, displayName, email, credits_balance, plan, role FROM user WHERE displayName @@ $q OR name @@ $q OR email @@ $q LIMIT $limit;`
              : `SELECT name, displayName, email, credits_balance, plan, role FROM user ORDER BY string::lower(displayName ?? name) LIMIT $limit;`,
            { q, limit }
          );
          const rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ name?: string; displayName?: string; email?: string; credits_balance?: number; plan?: string | null; role?: string }>) : []).map((r) => ({
            name: r?.name || null,
            displayName: r?.displayName || null,
            email: String(r?.email || ""),
            credits: typeof r?.credits_balance === "number" ? Number(r.credits_balance) : 0,
            plan: r?.plan || null,
            role: r?.role || null,
          }));
          controller.enqueue(te.encode(`data: ${JSON.stringify({ users: rows })}\n\n`));
        } catch {}

        // Live subscription to user table; we'll filter in handler
        const res2 = await db.query("LIVE SELECT * FROM user");
        const id = Array.isArray(res2) && res2[0] ? (Array.isArray(res2[0]) ? res2[0][0] : res2[0]) : res2;
        liveId = id as unknown as Uuid;
        await db.subscribeLive(liveId as Uuid, async (..._args: unknown[]) => {
          try {
            const res = await db.query(
              q
                ? `SELECT name, displayName, email, credits_balance, plan, role FROM user WHERE displayName @@ $q OR name @@ $q OR email @@ $q LIMIT $limit;`
                : `SELECT name, displayName, email, credits_balance, plan, role FROM user ORDER BY string::lower(displayName ?? name) LIMIT $limit;`,
              { q, limit }
            );
            const rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ name?: string; displayName?: string; email?: string; credits_balance?: number; plan?: string | null; role?: string }>) : []).map((r) => ({
              name: r?.name || null,
              displayName: r?.displayName || null,
              email: String(r?.email || ""),
              credits: typeof r?.credits_balance === "number" ? Number(r.credits_balance) : 0,
              plan: r?.plan || null,
              role: r?.role || null,
            }));
            controller.enqueue(te.encode(`data: ${JSON.stringify({ users: rows })}\n\n`));
          } catch {}
        });
      } catch {
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: 'live_failed' })}\n\n`));
      }
    },
    async cancel() { try { if (liveId) await db.kill(liveId as Uuid); } catch {} },
  });

  const res = new NextResponse(stream as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

  const signal = (request as { signal?: AbortSignal }).signal;
  if (signal) {
    signal.addEventListener("abort", async () => { try { if (liveId) await db.kill(liveId as Uuid); } catch {} });
  }

  return res;
}


