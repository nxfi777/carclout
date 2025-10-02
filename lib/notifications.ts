"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Announcement = {
  id?: string;
  title: string;
  content: string;
  level?: "info" | "update" | "warning";
  created_at?: string;
};

type MissedItem = Announcement & { seenAt?: string };

const STORAGE_KEYS = {
  lastSeenAt: "carclout.notifications.lastSeenAnnouncementAt",
  missed: "carclout.notifications.missed",
  permissionPrompted: "carclout.notifications.permissionPrompted",
} as const;

export function getIsDocumentHidden(): boolean {
  try {
    return typeof document !== "undefined" && document.hidden === true;
  } catch {
    return false;
  }
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "denied";
  try {
    if (Notification.permission === "default") {
      const prompted = localStorage.getItem(STORAGE_KEYS.permissionPrompted) === "1";
      if (!prompted) {
        localStorage.setItem(STORAGE_KEYS.permissionPrompted, "1");
        return await Notification.requestPermission();
      }
    }
  } catch {}
  return Notification.permission;
}

export function showBrowserNotification(title: string, options?: NotificationOptions & { body?: string; tag?: string }) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  try {
    if (Notification.permission === "granted") {
      const n = new Notification(title, {
        ...options,
        silent: false,
      });
      // Auto-close after a while to avoid clutter
      try {
        setTimeout(() => n.close(), 8000);
      } catch {}
    }
  } catch {}
}

function parseIso(date?: string | null): number {
  if (!date) return 0;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : 0;
}

function loadMissed(): MissedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.missed);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as MissedItem[]) : [];
  } catch {
    return [];
  }
}

function saveMissed(items: MissedItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.missed, JSON.stringify(items.slice(0, 20)));
  } catch {}
}

function loadLastSeenAt(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lastSeenAt);
    if (!raw) return 0;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function saveLastSeenAt(ts: number) {
  try {
    const iso = new Date(ts).toISOString();
    localStorage.setItem(STORAGE_KEYS.lastSeenAt, iso);
  } catch {}
}

async function fetchAnnouncements(limit: number = 5): Promise<Announcement[]> {
  try {
    const res = await fetch(`/api/announcements?limit=${encodeURIComponent(String(limit))}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.announcements) ? (data.announcements as Announcement[]) : [];
    return list;
  } catch {
    return [];
  }
}

export type UseAnnouncementNotificationsResult = {
  dnd: boolean;
  permission: NotificationPermission | "unsupported";
  enableNotifications: () => Promise<void>;
  missed: MissedItem[];
  missedCount: number;
  latest: Announcement[];
  clearMissed: () => void;
  markAllRead: () => void;
  isDocumentHidden: boolean;
};

export function useAnnouncementNotifications(pollIntervalMs: number = 30000): UseAnnouncementNotificationsResult {
  const [dndState, setDndState] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [missed, setMissed] = useState<MissedItem[]>(() => loadMissed());
  const [latest, setLatest] = useState<Announcement[]>([]);
  const [hidden, setHidden] = useState<boolean>(() => getIsDocumentHidden());
  const lastSeenRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(false);

  // Initialize last-seen from storage on mount
  useEffect(() => {
    lastSeenRef.current = loadLastSeenAt();
  }, []);

  // Listen for visibility changes
  useEffect(() => {
    function onVis() {
      setHidden(getIsDocumentHidden());
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Poll presence to derive DND from user presence status
  useEffect(() => {
    let stop = false;
    async function fetchPresence() {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
        const users: Array<{ email?: string; status?: string }> = Array.isArray(res?.users) ? res.users : [];
        // backend GET does not identify self explicitly; we can request /api/me for email
        const me = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
        const myEmail: string | undefined = me?.email || me?.user?.email || me?.me?.email;
        const self = users.find((u) => u?.email && myEmail && u.email === myEmail);
        const isDnd = (self?.status || "") === "dnd";
        if (!stop) setDndState(isDnd);
      } catch {}
    }
    fetchPresence();
    const t = window.setInterval(fetchPresence, 60000);
    return () => { stop = true; window.clearInterval(t); };
  }, []);

  const missedCount = useMemo(() => missed.length, [missed]);

  const enableNotifications = useCallback(async () => {
    const p = await ensureNotificationPermission();
    setPermission(typeof Notification === "undefined" ? "unsupported" : p);
  }, []);

  const clearMissed = useCallback(() => {
    setMissed([]);
    saveMissed([]);
  }, []);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    saveLastSeenAt(now);
    lastSeenRef.current = now;
    clearMissed();
  }, [clearMissed]);

  // Poll for new announcements
  useEffect(() => {
    let aborted = false;

    async function tick(initial: boolean = false) {
      if (aborted) return;
      const list = await fetchAnnouncements(10);
      if (aborted) return;
      if (!list.length) return;
      setLatest(list);

      // Determine first-run behavior: set lastSeen to newest so we don't spam existing
      if (initial && lastSeenRef.current === 0) {
        const newest = Math.max(...list.map((a) => parseIso(a.created_at)));
        if (Number.isFinite(newest) && newest > 0) {
          lastSeenRef.current = newest;
          saveLastSeenAt(newest);
        }
        return; // do not treat initial load as "new"
      }

      const since = lastSeenRef.current;
      const fresh = list
        .filter((a) => parseIso(a.created_at) > since)
        // newest first for coherent notifications
        .sort((a, b) => parseIso(a.created_at) - parseIso(b.created_at));

      if (fresh.length) {
        // Update lastSeen to latest
        const latest = Math.max(since, ...fresh.map((a) => parseIso(a.created_at)));
        if (Number.isFinite(latest) && latest > 0) {
          lastSeenRef.current = latest;
          saveLastSeenAt(latest);
        }

        // Queue as missed
        const nextMissed: MissedItem[] = [
          ...fresh.map((f) => ({ ...f, seenAt: undefined })),
          ...missed,
        ]
          // de-dup by id
          .filter((item, idx, arr) => (item.id ? arr.findIndex((x) => x.id === item.id) === idx : true))
          .slice(0, 20);
        setMissed(nextMissed);
        saveMissed(nextMissed);

        // If tab hidden and not DND, attempt to notify
        if (getIsDocumentHidden() && !dndState && typeof Notification !== "undefined") {
          if (Notification.permission === "granted") {
            for (const a of fresh) {
              const title = a.title || "New announcement";
              const body = (a.content || "").slice(0, 160);
              showBrowserNotification(title, { body, tag: a.id || a.title });
            }
          }
        }
      }
    }

    // initial load (do not notify)
    tick(true);

    const intervalId = window.setInterval(() => tick(false), Math.max(10000, pollIntervalMs));
    return () => {
      aborted = true;
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, dndState, missed]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    dnd: dndState,
    permission,
    enableNotifications,
    missed,
    missedCount,
    latest,
    clearMissed,
    markAllRead,
    isDocumentHidden: hidden,
  };
}


