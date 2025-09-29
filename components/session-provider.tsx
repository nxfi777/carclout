"use client";

import { SessionProvider } from "next-auth/react";
import React, { useEffect, useMemo } from "react";
import PresenceController from "./presence-controller";

type SessionUser = {
  email?: string | null;
  presenceStatus?: "online" | "idle" | "dnd" | "invisible";
};

type SessionValue = {
  user?: SessionUser | null;
};

export default function SessionProviderWrapper({ children, session }: { children: React.ReactNode; session?: SessionValue | null }) {
  const email = useMemo(() => {
    const raw = session?.user?.email;
    return typeof raw === "string" && raw.length ? raw : undefined;
  }, [session?.user?.email]);

  useEffect(() => {
    if (!session) return;
    try {
      (window as typeof window & { __igniteSessionEmail?: string | null }).__igniteSessionEmail = email ?? null;
    } catch {}
  }, [email, session]);

  return (
    <SessionProvider session={session as never}>
      <PresenceController email={email} />
      {children}
    </SessionProvider>
  );
}


