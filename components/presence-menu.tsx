"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export default function PresenceMenu({ email, variant = "button" }: { email: string; variant?: "button" | "dot" }) {
  const [status, setStatus] = useState<PresenceStatus>("online");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const usersRaw: unknown[] = Array.isArray(res?.users) ? (res.users as unknown[]) : [];
        let meStatus: PresenceStatus | undefined;
        for (const u of usersRaw) {
          const obj = u as Record<string, unknown>;
          if (typeof obj.email === 'string' && obj.email === email) {
            const s = obj.status;
            if (s === 'online' || s === 'idle' || s === 'dnd' || s === 'invisible') meStatus = s;
            break;
          }
        }
        if (mounted && meStatus) setStatus(meStatus);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [email]);

  // Listen to presence-updated-local events from PresenceController to stay in sync
  useEffect(() => {
    const handlePresenceUpdate = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { email?: string; status?: string } | undefined;
        if (detail?.email === email && detail?.status) {
          const s = detail.status;
          if (s === 'online' || s === 'idle' || s === 'dnd' || s === 'invisible') {
            setStatus(s as PresenceStatus);
          }
        }
      } catch {}
    };
    window.addEventListener('presence-updated-local', handlePresenceUpdate as EventListener);
    return () => {
      window.removeEventListener('presence-updated-local', handlePresenceUpdate as EventListener);
    };
  }, [email]);

  async function setPresence(next: PresenceStatus) {
    const prev = status;
    setStatus(next); // optimistic
    try {
      // notify local listeners immediately for optimistic sidebar updates
      window.dispatchEvent(new CustomEvent("presence-updated-local", { detail: { email, status: next, updatedAt: new Date().toISOString(), source: "manual" } }));
    } catch {}
    setLoading(true);
    try {
      await fetch("/api/presence/set", { method: "POST", body: JSON.stringify({ status: next }) });
      window.dispatchEvent(new Event("presence-updated"));
    } catch {
      // revert on failure
      setStatus(prev);
      try {
        window.dispatchEvent(new CustomEvent("presence-updated-local", { detail: { email, status: prev, updatedAt: new Date().toISOString(), source: "manual" } }));
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  function Dot({ c, withMargin = true, size = '0.5rem' }: { c: string; withMargin?: boolean; size?: string }) {
    return <span style={{ backgroundColor: c, width: size, height: size }} className={`inline-block rounded-full align-middle ${withMargin ? 'mr-2' : ''}`} />;
  }

  const color: Record<PresenceStatus, string> = {
    online: "#10b981",
    idle: "#f59e0b",
    dnd: "#ef4444",
    invisible: "#9ca3af",
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'dot' ? (
          <div
            aria-label={`Presence: ${status}`}
            title={`Presence: ${status}`}
            className="inline-flex items-center justify-center"
            onClick={(e)=>{ e.stopPropagation(); }}
            onPointerDown={(e)=>{ e.stopPropagation(); }}
            onKeyDown={(e)=>{ e.stopPropagation(); }}
          >
            <Dot c={color[status]} withMargin={false} size="0.9rem" />
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-9 px-4 text-sm gap-2 border-[color:var(--border)] bg-[color:var(--popover)]/70">
            <Dot c={color[status]} />
            <span className="capitalize">{status}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem className="cursor-pointer" disabled={loading} onClick={() => setPresence("online")}>
          <Dot c={color.online} /> Online
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" disabled={loading} onClick={() => setPresence("idle")}>
          <Dot c={color.idle} /> Idle
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" disabled={loading} onClick={() => setPresence("dnd")}>
          <Dot c={color.dnd} /> Do Not Disturb
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" disabled={loading} onClick={() => setPresence("invisible")}>
          <Dot c={color.invisible} /> Invisible
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


