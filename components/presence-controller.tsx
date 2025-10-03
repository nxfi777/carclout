"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 55_000; // 55s to avoid edge cases with 60s server rate limit
const HEARTBEAT_MIN_GAP_MS = 50_000; // 50s minimum gap to ensure rate limit compliance

type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

function nowIso(): string {
  return new Date().toISOString();
}

async function postJson(url: string, body: unknown, init?: RequestInit) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...init,
    });
  } catch (error) {
    console.error("presence POST failed", error);
    throw error;
  }
}

export default function PresenceController({ email }: { email?: string | null }) {
  const emailRef = useRef<string | undefined>(typeof email === "string" ? email : undefined);
  const latestStatusRef = useRef<PresenceStatus | "offline">("online");
  const latestVisibilityRef = useRef<"visible" | "hidden">(typeof document !== "undefined" && document.visibilityState === "hidden" ? "hidden" : "visible");
  const lastHeartbeatRef = useRef<number>(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const nextEmail = typeof email === "string" && email.length ? email : undefined;
    emailRef.current = nextEmail;
    if (!nextEmail) return;

    const dispatchPresenceLocal = (status: PresenceStatus, source: string, updatedAt?: string) => {
      const currentEmail = emailRef.current;
      if (!currentEmail) return;
      try {
        window.dispatchEvent(
          new CustomEvent("presence-updated-local", {
            detail: {
              email: currentEmail,
              status,
              updatedAt: updatedAt ?? nowIso(),
              source,
            },
          })
        );
      } catch (error) {
        console.error("presence local dispatch failed", error);
      }
    };

    const sendPresence = async (status: PresenceStatus) => {
      const now = Date.now();
      try {
        await postJson("/api/presence/set", { status });
        lastHeartbeatRef.current = now;
      } catch (error) {
        console.error("presence status update failed", error);
      }
    };

    const updateStatus = (status: PresenceStatus, source: string, force = false) => {
      const currentEmail = emailRef.current;
      if (!currentEmail) return;
      if (!force && latestStatusRef.current === status) return;
      latestStatusRef.current = status;
      dispatchPresenceLocal(status, source);
      sendPresence(status).catch(() => {});
    };

    const sendHeartbeat = async () => {
      try {
        const since = Date.now() - lastHeartbeatRef.current;
        if (since < HEARTBEAT_MIN_GAP_MS) return;
        const response = await fetch("/api/presence/heartbeat", { method: "POST" });
        if (response.ok) {
          lastHeartbeatRef.current = Date.now();
          return;
        }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          if (Number.isFinite(retryAfter) && retryAfter > 0) {
            lastHeartbeatRef.current = Date.now() - (HEARTBEAT_INTERVAL_MS - retryAfter * 1000);
          }
        }
      } catch (error) {
        console.error("presence heartbeat failed", error);
      }
    };

    // Only auto-update if current status is online/idle (respect manual dnd/invisible settings)
    const shouldAutoUpdate = () => {
      const current = latestStatusRef.current;
      return current === "online" || current === "idle";
    };

    const handleVisibility = () => {
      const currentEmail = emailRef.current;
      if (!currentEmail || !shouldAutoUpdate()) return;
      const state = document.visibilityState;
      const was = latestVisibilityRef.current;
      latestVisibilityRef.current = state === "hidden" ? "hidden" : "visible";
      if (state === "hidden" && was !== "hidden") {
        updateStatus("idle", "visibility:hidden");
      } else if (state === "visible" && was !== "visible") {
        updateStatus("online", "visibility:visible");
      }
    };

    const handleFocus = () => {
      if (!shouldAutoUpdate()) return;
      updateStatus("online", "focus");
    };

    const handleBlur = () => {
      if (!shouldAutoUpdate()) return;
      updateStatus("idle", "blur");
    };

    // Listen to manual status changes from PresenceMenu to sync latestStatusRef
    const handleManualPresenceUpdate = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { email?: string; status?: string; source?: string } | undefined;
        const currentEmail = emailRef.current;
        if (detail?.email === currentEmail && detail?.source === "manual" && detail?.status) {
          const s = detail.status;
          if (s === 'online' || s === 'idle' || s === 'dnd' || s === 'invisible') {
            latestStatusRef.current = s as PresenceStatus;
          }
        }
      } catch {}
    };

    const handleBeforeUnload = () => {
      try {
        const currentEmail = emailRef.current;
        if (!currentEmail) return;
        const payload = JSON.stringify({ status: "idle" });
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/presence/set", blob);
        } else {
          postJson("/api/presence/set", { status: "idle" }, { keepalive: true }).catch(() => {});
        }
        dispatchPresenceLocal("idle", "unload");
      } catch (error) {
        console.error("presence beforeunload failed", error);
      }
    };

    const startHeartbeat = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      heartbeatTimerRef.current = setInterval(() => {
        if (latestVisibilityRef.current === "visible") {
          sendHeartbeat();
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const init = () => {
      updateStatus(latestStatusRef.current as PresenceStatus, "auto", true);
      // Don't send immediate heartbeat - let the interval handle it
      startHeartbeat();
    };

    const destroy = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      window.removeEventListener("focus", handleFocus, true);
      window.removeEventListener("blur", handleBlur, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("presence-updated-local", handleManualPresenceUpdate as EventListener);
    };

    cleanupRef.current?.();
    cleanupRef.current = destroy;

    init();

    window.addEventListener("focus", handleFocus, true);
    window.addEventListener("blur", handleBlur, true);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("presence-updated-local", handleManualPresenceUpdate as EventListener);

    return () => {
      destroy();
      cleanupRef.current = null;
    };
  }, [email]);

  return null;
}


