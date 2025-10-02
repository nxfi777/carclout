/*
Centralized client-side helper to fetch signed view URLs with:
- Auto-batching/coalescing within a short window
- In-memory and sessionStorage caching (TTL aligned with presign lifetime)
- Scope-aware (user/admin) resolution

Usage:
  const url = await getViewUrl(key);
  const map = await getViewUrls(keys);
*/

type Scope = 'user' | 'admin' | undefined;

const SESSION_PREFIX = 'carclout:viewurl:'; // per-key cache: SESSION_PREFIX + scope + ':' + key
const DEFAULT_TTL_MS = 9 * 60 * 1000; // 9 minutes to stay below 10m presign expiry
const BATCH_WINDOW_MS = 20; // coalesce calls arriving within this window
const MAX_CHUNK = 100; // chunk size when sending to server

type CacheEntry = { url: string; ts: number };

// In-memory cache (faster path than sessionStorage)
const memoryCache = new Map<string, CacheEntry>();

function cacheKeyFor(scope: Scope, key: string): string {
  const s = scope === 'admin' ? 'admin' : 'user';
  return `${s}:${key}`;
}

function readSession(scope: Scope, key: string): CacheEntry | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem(SESSION_PREFIX + cacheKeyFor(scope, key));
    if (!raw) return null;
    const obj = JSON.parse(raw) as CacheEntry;
    if (!obj || typeof obj.url !== 'string' || typeof obj.ts !== 'number') return null;
    return obj;
  } catch { return null; }
}

function writeSession(scope: Scope, key: string, entry: CacheEntry) {
  try {
    if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_PREFIX + cacheKeyFor(scope, key), JSON.stringify(entry));
  } catch {}
}

function readCache(scope: Scope, key: string, ttlMs: number): string | null {
  const now = Date.now();
  const mem = memoryCache.get(cacheKeyFor(scope, key));
  if (mem && now - mem.ts < ttlMs) return mem.url;
  const ses = readSession(scope, key);
  if (ses && now - ses.ts < ttlMs) {
    memoryCache.set(cacheKeyFor(scope, key), ses);
    return ses.url;
  }
  return null;
}

function writeCache(scope: Scope, key: string, url: string) {
  const entry: CacheEntry = { url, ts: Date.now() };
  memoryCache.set(cacheKeyFor(scope, key), entry);
  writeSession(scope, key, entry);
}

// Pending queue for auto-batching
type PendingRequest = { scope: Scope; key: string; resolve: (v: string | null) => void; reject: (e: unknown) => void };
let pending: PendingRequest[] = [];
let timer: number | null = null;

async function flushPending() {
  const toSend = pending;
  pending = [];
  timer = null;
  if (toSend.length === 0) return;

  // Group by scope
  const byScope = new Map<Scope, PendingRequest[]>();
  for (const p of toSend) {
    const arr = byScope.get(p.scope) || [];
    arr.push(p);
    byScope.set(p.scope, arr);
  }

  for (const [scope, list] of byScope.entries()) {
    // Dedupe keys
    const uniqueKeys = Array.from(new Set(list.map((r) => r.key))).filter(Boolean);
    // Chunk and fetch
    const updates: Record<string, string> = {};
    for (let i = 0; i < uniqueKeys.length; i += MAX_CHUNK) {
      const slice = uniqueKeys.slice(i, i + MAX_CHUNK);
      try {
        const body: Record<string, unknown> = { keys: slice };
        if (scope === 'admin') body.scope = 'admin';
        const res = await fetch('/api/storage/view-bulk', { method: 'POST', body: JSON.stringify(body) });
        const data = (await res.json().catch(() => ({}))) as { urls?: Record<string, string> };
        const urls = (data?.urls as Record<string, string>) || {};
        Object.assign(updates, urls);
      } catch {}
    }
    // Resolve all requests for this scope
    for (const req of list) {
      const u = updates[req.key] || null;
      if (u) writeCache(scope, req.key, u);
      try { req.resolve(u || null); } catch (e) { try { req.reject(e); } catch {} }
    }
  }
}

export async function getViewUrl(key: string, scope?: Scope, ttlMs: number = DEFAULT_TTL_MS): Promise<string | null> {
  const normKey = String(key || '').replace(/^\/+/, '');
  if (!normKey) return null;
  const cached = readCache(scope, normKey, ttlMs);
  if (cached) return cached;
  return new Promise<string | null>((resolve, reject) => {
    pending.push({ scope, key: normKey, resolve, reject });
    if (timer === null) {
      try { timer = (setTimeout(flushPending, BATCH_WINDOW_MS) as unknown as number); } catch { flushPending(); }
    }
  });
}

export async function getViewUrls(keys: string[], scope?: Scope, ttlMs: number = DEFAULT_TTL_MS): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const need: string[] = [];
  for (const k of Array.from(new Set(keys)).filter(Boolean)) {
    const norm = String(k).replace(/^\/+/, '');
    const cached = readCache(scope, norm, ttlMs);
    if (cached) out[norm] = cached; else need.push(norm);
  }
  if (need.length === 0) return out;
  // Use the same batching function but await individually for simplicity
  const waiters = need.map((k) => getViewUrl(k, scope, ttlMs).then((u) => ({ k, u })));
  const results = await Promise.all(waiters);
  for (const { k, u } of results) { if (u) out[k] = u; }
  return out;
}

export function clearViewUrlCache() {
  memoryCache.clear();
  try {
    if (typeof window !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const name = sessionStorage.key(i) || '';
        if (name.startsWith(SESSION_PREFIX)) keys.push(name);
      }
      for (const k of keys) sessionStorage.removeItem(k);
    }
  } catch {}
}

export function primeViewUrlCache(entries: Record<string, string>, scope?: Scope) {
  for (const [k, url] of Object.entries(entries || {})) {
    if (!k || !url) continue;
    writeCache(scope, k, url);
  }
}



