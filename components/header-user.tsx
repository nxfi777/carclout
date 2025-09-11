"use client";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import HeaderCredits from "./header-credits";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, CarFront } from "lucide-react";
import PresenceMenu from "./presence-menu";

export default function HeaderUser({
  name,
  email,
  image,
  plan,
}: {
  name: string;
  email: string;
  image?: string;
  plan?: string | null;
}) {
  const [currentName, setCurrentName] = useState(name);
  const [currentImage, setCurrentImage] = useState<string | undefined>(image);
  const [level, setLevel] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [xpIntoLevel, setXpIntoLevel] = useState<number | null>(null);
  const [levelSpan, setLevelSpan] = useState<number | null>(null);

  useEffect(() => {
    function onProfileUpdated(e: Event) {
      const detail = (e as CustomEvent).detail as { name?: string; image?: string } | undefined;
      if (detail?.name !== undefined) setCurrentName(detail.name);
      if (detail?.image !== undefined) setCurrentImage(detail.image);
    }
    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    return () => window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/xp", { cache: "no-store" }).then((r) => r.json());
        if (!mounted) return;
        setLevel(r.level);
        setRemaining(r.remaining);
        setXpIntoLevel(r.xpIntoLevel ?? r.xp - (r.currentLevelBaseXp ?? 0));
        setLevelSpan(r.levelSpan ?? Math.max(1, (r.nextLevelXp ?? 0) - (r.currentLevelBaseXp ?? 0)));
        // prompt daily bonus dialog; it will decide eligibility
        try { window.dispatchEvent(new CustomEvent('prompt-daily-bonus')); } catch {}
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function refreshXp() {
      try {
        const r = await fetch("/api/xp", { cache: "no-store" }).then((r) => r.json());
        if (!mounted) return;
        setLevel(r.level);
        setRemaining(r.remaining);
        setXpIntoLevel(r.xpIntoLevel ?? r.xp - (r.currentLevelBaseXp ?? 0));
        setLevelSpan(r.levelSpan ?? Math.max(1, (r.nextLevelXp ?? 0) - (r.currentLevelBaseXp ?? 0)));
      } catch {}
    }
    function onXpRefresh() { refreshXp(); }
    window.addEventListener('xp-refresh', onXpRefresh as EventListener);
    return () => { mounted = false; window.removeEventListener('xp-refresh', onXpRefresh as EventListener); };
  }, []);

  const progressValue = useMemo(() => {
    if (xpIntoLevel == null || levelSpan == null) return 0;
    return Math.min(100, Math.max(0, Math.round((xpIntoLevel / levelSpan) * 100)));
  }, [xpIntoLevel, levelSpan]);

  // const shownInitials = (initials || currentName || email || "U").split(" ").map((s) => s[0]).join("")?.slice(0,2).toUpperCase() || "U";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="hidden md:block text-sm text-left">
              <div className="leading-none">{currentName || email}</div>
              <div className="text-muted-foreground flex items-center gap-2">
                <span>{plan ? String(plan).toUpperCase() : "FORGELESS"}</span>
                {level !== null && remaining !== null ? (
                  <span className="text-xs">Lv {level} · {remaining} XP to next</span>
                ) : null}
              </div>
              {levelSpan !== null && xpIntoLevel !== null ? (
                <div className="mt-1 w-40">
                  <Progress value={progressValue} />
                </div>
              ) : null}
            </div>
            <div className="relative inline-block">
              <Avatar className="size-10 md:size-11">
                <AvatarImage src={currentImage || undefined} />
                <AvatarFallback className="text-xs md:text-sm bg-[color:var(--primary)]/15 text-[color:var(--primary)]">
                  <CarFront className="size-5 md:size-6" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute right-0 bottom-0 translate-x-[20%] translate-y-[20%] z-10">
                <PresenceMenu email={email} variant="dot" />
              </div>
            </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          {/* Mobile/tablet full profile summary */}
          <div className="md:hidden px-3 pt-3 pb-2 text-sm">
            <div className="font-medium">{currentName || email}</div>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-2">
              <span>{plan ? String(plan).toUpperCase() : "FORGELESS"}</span>
              {level !== null && remaining !== null ? (
                <span className="text-xs">Lv {level} · {remaining} XP to next</span>
              ) : null}
            </div>
            {levelSpan !== null && xpIntoLevel !== null ? (
              <div className="mt-2">
                <Progress value={progressValue} />
              </div>
            ) : null}
            <div className="mt-2"><HeaderCredits /></div>
          </div>
          <DropdownMenuSeparator className="md:hidden" />
          <DropdownMenuItem className="cursor-pointer" asChild>
            <Link href="#" onClick={(e)=>{ e.preventDefault(); try { window.dispatchEvent(new CustomEvent('open-profile')); } catch {} }}>Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" asChild>
            <Link href="#" onClick={(e)=>{ e.preventDefault(); try { window.dispatchEvent(new CustomEvent('open-billing')); } catch {} }}>Billing</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            variant="destructive"
            onClick={async () => {
              try {
                await signOut({ callbackUrl: "/" });
              } catch {}
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}


