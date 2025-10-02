"use client";

import { getEnvBaseUrl } from "@/lib/base-url";

const DEFAULT_WEBSITE_ID = "0e2c9c29-d47e-438b-a98d-5ae80da99a63";
const DEFAULT_HOST = "https://umami-production-ddaa.up.railway.app";
const DEFAULT_SCRIPT_PATH = "/umami/script.js";
const DEFAULT_TAG = "carclout-app";

export interface UmamiClient {
  track: (eventName: string, data?: Record<string, unknown>) => void;
  trackEvent?: (eventName: string, data?: Record<string, unknown>) => void;
  trackView?: (url?: string, referrer?: string, data?: Record<string, unknown>) => void;
  trackLink?: (href: string, data?: Record<string, unknown>) => void;
  trackForm?: (eventName: string, data?: Record<string, unknown>) => void;
  identify?: (id: string, data?: Record<string, unknown>) => void;
  reset?: () => void;
  set?: (name: string, value: unknown) => void;
  q?: Array<unknown[]>;
}

export const UMAMI_CONFIG = {
  websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || DEFAULT_WEBSITE_ID,
  hostUrl: process.env.NEXT_PUBLIC_UMAMI_HOST || DEFAULT_HOST,
  scriptPath: process.env.NEXT_PUBLIC_UMAMI_SCRIPT_PATH || DEFAULT_SCRIPT_PATH,
  tag: process.env.NEXT_PUBLIC_UMAMI_TAG || DEFAULT_TAG,
};

export function getUmamiDomains(): string | undefined {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (!env) return undefined;
  try {
    const url = new URL(env);
    return url.hostname;
  } catch {
    return undefined;
  }
}

export function getUmamiScriptUrl(): string {
  return UMAMI_CONFIG.scriptPath.startsWith("http")
    ? UMAMI_CONFIG.scriptPath
    : `${getEnvBaseUrl().replace(/\/$/, "")}${UMAMI_CONFIG.scriptPath}`;
}

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export async function waitForUmami(timeoutMs = 5000): Promise<UmamiClient | undefined> {
  if (!isBrowser()) return undefined;
  const start = performance.now();
  if (window.umami && typeof window.umami.track === "function") return window.umami;

  return new Promise((resolve) => {
    const interval = window.setInterval(() => {
      if (window.umami && typeof window.umami.track === "function") {
        window.clearInterval(interval);
        resolve(window.umami);
      } else if (performance.now() - start > timeoutMs) {
        window.clearInterval(interval);
        resolve(undefined);
      }
    }, 50);
  });
}

export async function trackEvent(eventName: string, data?: Record<string, unknown>) {
  const client = await waitForUmami();
  client?.track?.(eventName, data);
}

export async function identifyUser(distinctId: string, data?: Record<string, unknown>) {
  const client = await waitForUmami();
  if (!client?.identify) return;
  client.identify(distinctId, data);
}

export async function resetIdentity() {
  const client = await waitForUmami();
  client?.reset?.();
}

export async function setUmamiValue(name: string, value: unknown) {
  const client = await waitForUmami();
  client?.set?.(name, value);
}

export async function createDeterministicHash(input: string): Promise<string> {
  if (!isBrowser()) return input;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  if (window.crypto?.subtle?.digest) {
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  let hash = 0;
  for (let i = 0; i < data.length; i += 1) {
    hash = (hash << 5) - hash + data[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export interface IdentifyPayload {
  id?: string | null;
  email?: string | null;
  plan?: string | null;
  role?: string | null;
}

export async function identifyFromSession(payload: IdentifyPayload) {
  if (!payload) return;
  const { id, email, plan, role } = payload;
  const base = id || email;
  if (!base) return;
  const distinctId = await createDeterministicHash(base);
  const data: Record<string, unknown> = {
    role: role || undefined,
    plan: plan || undefined,
  };
  if (email) data.emailHash = await createDeterministicHash(email);
  await identifyUser(distinctId, data);
  await setUmamiValue("plan", plan || "unknown");
  await setUmamiValue("role", role || "user");
}

export function parseDatasetProps<T = Record<string, unknown>>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return { value } as unknown as T;
  }
}


