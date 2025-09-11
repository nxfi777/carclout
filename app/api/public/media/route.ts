import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { r2, bucket } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

function hmac(input: string): string {
  const secret = process.env.MEDIA_LINK_SECRET || process.env.NEXTAUTH_SECRET || process.env.FAL_KEY || "dev-secret";
  return crypto.createHmac('sha256', secret).update(input).digest('hex');
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key') || '';
    const scope = (url.searchParams.get('scope') || 'user') as 'user' | 'admin';
    const expStr = url.searchParams.get('exp') || '';
    const sig = url.searchParams.get('sig') || '';
    const exp = parseInt(expStr);
    if (!key || !sig || !exp || Number.isNaN(exp)) {
      return new NextResponse('bad request', { status: 400 });
    }
    if (Math.floor(Date.now() / 1000) > exp) {
      return new NextResponse('link expired', { status: 410 });
    }
    const expected = hmac(`${key}|${scope}|${exp}`);
    if (expected !== sig) {
      return new NextResponse('invalid signature', { status: 403 });
    }
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await r2.send(cmd);
    const body = res.Body as unknown;
    const chunks: Uint8Array[] = [];
    const asyncIterable = body as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> } | undefined;
    if (asyncIterable && typeof asyncIterable[Symbol.asyncIterator] === 'function') {
      for await (const chunk of (asyncIterable as unknown as AsyncIterable<unknown>)) {
        if (typeof chunk === 'string') {
          chunks.push(new TextEncoder().encode(chunk));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(chunk);
        } else if (ArrayBuffer.isView(chunk)) {
          chunks.push(new Uint8Array((chunk as ArrayBufferView).buffer));
        } else if (chunk && typeof (chunk as ArrayBuffer).byteLength === 'number') {
          chunks.push(new Uint8Array(chunk as ArrayBuffer));
        } else {
          // best-effort stringify
          chunks.push(new TextEncoder().encode(String(chunk)));
        }
      }
    }
    const out = Buffer.concat(chunks);
    const ct = (res.ContentType as string) || 'application/octet-stream';
    return new NextResponse(out, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    try { console.error('/api/public/media error', e); } catch {}
    return new NextResponse('error', { status: 500 });
  }
}


