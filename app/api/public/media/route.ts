import { NextResponse } from "next/server";
import { headers } from "next/headers";
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
    const body = res.Body as any;
    const chunks: Uint8Array[] = [];
    if (body && typeof body[Symbol.asyncIterator] === 'function') {
      for await (const chunk of body) {
        chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
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


