import crypto from "node:crypto";

const SECRET = process.env.ADMIN_LIVE_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;

if (!SECRET) {
  throw new Error("ADMIN_LIVE_TOKEN_SECRET or NEXTAUTH_SECRET must be set to issue admin live tokens.");
}

export type AdminLiveTokenPayload = {
  email: string;
  role: "admin";
  exp: number;
  jti: string;
};

const DEFAULT_TTL_SECONDS = 60;

function resolveSecret(): crypto.BinaryLike | crypto.KeyObject {
  const secret = process.env.ADMIN_LIVE_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (typeof secret === 'string') return secret;
  if (secret && typeof secret === 'object' && 'byteLength' in secret) {
    return Buffer.from(secret as ArrayBufferLike);
  }
  return Buffer.from(String(secret ?? ""));
}

export function createAdminLiveToken(email: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): {
  token: string;
  expiresAt: string;
} {
  const safeTtl = Math.max(15, Math.min(300, Math.floor(ttlSeconds)) || DEFAULT_TTL_SECONDS);
  const payload: AdminLiveTokenPayload = {
    email: email.toLowerCase(),
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + safeTtl,
    jti: crypto.randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", resolveSecret()).update(body).digest("base64url");
  const token = `${body}.${signature}`;
  return { token, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export function verifyAdminLiveToken(token: string): AdminLiveTokenPayload | null {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = crypto.createHmac("sha256", resolveSecret()).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return null;
    }
    const payloadJson = Buffer.from(body, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as AdminLiveTokenPayload;
    if (!payload || payload.role !== "admin") return null;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}


