import type { NextRequest } from "next/server";

const ENV_BASE_URL_CANDIDATES = [
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_BASE_URL,
  process.env.NEXTAUTH_URL,
  process.env.AUTH_URL,
  process.env.APP_URL,
  "http://localhost:3000",
];

function pickEnvBaseUrl(): string {
  for (const candidate of ENV_BASE_URL_CANDIDATES) {
    if (candidate && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  return "http://localhost:3000";
}

type SupportedRequest = Request | NextRequest;

function hasNextUrl(req: SupportedRequest): req is NextRequest {
  return "nextUrl" in req;
}

export function getBaseUrl(request?: SupportedRequest): string {
  if (request) {
    try {
      const rawUrl = hasNextUrl(request) ? request.nextUrl.href : request.url;
      const url = new URL(rawUrl);
      const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
      const hostHeader = request.headers.get("host")?.split(",")[0]?.trim();

      const host = forwardedHost || hostHeader || url.host;
      if (host) {
        const protocol = (forwardedProto || url.protocol.replace(/:$/, "")).toLowerCase();
        return `${protocol}://${host}`;
      }
    } catch {
      // fall through to env base url
    }
  }

  return pickEnvBaseUrl();
}

export function getEnvBaseUrl(): string {
  return pickEnvBaseUrl();
}


