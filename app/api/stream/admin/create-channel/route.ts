import { NextResponse } from "next/server";
import { StreamChat } from "stream-chat";
import { getSessionUser } from "@/lib/user";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'Missing name' }, { status: 400 });
  const apiKey = process.env.STREAM_API_KEY || "";
  const secret = process.env.STREAM_SECRET || "";
  const server = StreamChat.getInstance(apiKey, secret);
  const channel = server.channel("messaging", name);
  await channel.create();
  return NextResponse.json({ ok: true });
}


