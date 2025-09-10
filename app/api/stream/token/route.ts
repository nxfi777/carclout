import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { StreamClient } from "@stream-io/node-sdk";

export async function GET() {
  const apiKey = process.env.STREAM_API_KEY || "";
  const secret = process.env.STREAM_SECRET || process.env.STREAM_API_SECRET || "";
  if (!apiKey || !secret) return NextResponse.json({ error: "Stream not configured", missing: { STREAM_API_KEY: !apiKey, STREAM_SECRET_or_STREAM_API_SECRET: !secret } }, { status: 500 });

  // Use Stream Video server client to sign a user token for video calls
  const serverClient = new StreamClient(apiKey, secret);
  const user = await getSessionUser();
  const userId = user?.email ? user.email.replace(/[^a-zA-Z0-9_-]/g, "_") : "anon";
  try {
    const token = serverClient.createToken(userId);
    return NextResponse.json({ token, apiKey, userId });
  } catch (e: any) {
    return NextResponse.json({ error: 'Token creation failed', message: e?.message || 'unknown' }, { status: 500 });
  }
}


