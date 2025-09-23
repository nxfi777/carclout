"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import VehiclesEditor, { type Vehicle } from "@/components/vehicles-editor";
import CarPhotosUploader from "@/components/car-photos-uploader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function sanitizeInstagramHandle(input: string): string {
  const withoutAt = input.toLowerCase().replace(/^@+/, "");
  const filtered = withoutAt.replace(/[^a-z0-9._]/g, "");
  return filtered.slice(0, 30);
}

function OnboardingPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carPhotos, setCarPhotos] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.status === 401) {
          router.replace("/auth/signin");
          return;
        }
        const me = await meRes.json();
        const plan = ("plan" in (me as Record<string, unknown>) ? (me as Record<string, unknown>).plan : null) as string | null | undefined;

        const profileRes = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const profile = profileRes?.profile || null;
        if (profile) {
          if (typeof profile.name === "string") setUsername(profile.name || "");
          if (typeof profile.displayName === "string") setDisplayName(profile.displayName || "");
          if (Array.isArray(profile.vehicles)) setVehicles(profile.vehicles as Vehicle[]);
          if (Array.isArray(profile.carPhotos)) setCarPhotos((profile.carPhotos as string[]).filter((x) => typeof x === "string"));
          // If already completed onboarding, skip straight to plan
          if (profile.onboardingCompleted) {
            router.replace("/plan" + (params.get("plan") ? `?plan=${encodeURIComponent(params.get("plan") as string)}` : ""));
            return;
          }
        }
        // If already subscribed, go to dashboard
        const isSubscribed = plan === "minimum" || plan === "basic" || plan === "pro";
        if (isSubscribed) {
          router.replace("/dashboard/home");
          return;
        }
        // Prefill handle from query if provided
        const handle = params.get("name") || params.get("handle") || "";
        if (handle && !profile?.name) setUsername(sanitizeInstagramHandle(handle));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router, params]);

  const hasMinimum = useMemo(() => Array.isArray(vehicles) && vehicles.length > 0 && Array.isArray(carPhotos) && carPhotos.length > 0, [vehicles, carPhotos]);

  async function continueToPlan() {
    if (!username) { toast.error("Add your Instagram username."); return; }
    if (!hasMinimum) { toast.error("Add at least one vehicle and one photo."); return; }
    setLoading(true);
    try {
      const payload = {
        name: sanitizeInstagramHandle(username),
        displayName: (displayName || "").trim() ? (displayName || "").replace(/\s+/g, " ").trim().slice(0, 50) : null,
        vehicles,
        carPhotos,
        onboardingCompleted: true,
      };
      const res = await fetch("/api/profile", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        try { const data = await res.json(); toast.error(data?.error || "Failed to save profile"); } catch { toast.error("Failed to save profile"); }
        return;
      }
      const chosenPlan = params.get("plan");
      router.replace(chosenPlan ? `/plan?plan=${encodeURIComponent(chosenPlan)}` : "/plan");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;

  return (
    <main className="container mx-auto px-[1rem] py-[2rem]">
      <section className="max-w-3xl mx-auto space-y-3 mb-[2rem]">
        <h1 className="text-2xl md:text-3xl font-semibold">Let’s get you set up</h1>
        <p className="text-sm md:text-base text-white/70">Add your Instagram and car. You can edit later.</p>
      </section>
      <section className="max-w-3xl mx-auto space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-medium">Instagram username</div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">@</span>
            <Input
              className="pl-7"
              placeholder="your Instagram username"
              value={username}
              onChange={(e)=> setUsername(sanitizeInstagramHandle(e.target.value))}
              pattern="^[a-z0-9._]{1,30}$"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">Display name (optional)</div>
          <Input
            placeholder="How should we show your name?"
            value={displayName}
            onChange={(e)=> setDisplayName(e.target.value.slice(0,50))}
            aria-label="Display name"
            maxLength={50}
          />
        </div>
        <VehiclesEditor value={vehicles} onChange={setVehicles} />
        <div className="space-y-2">
          {vehicles.length > 0 ? (
            <CarPhotosUploader
              value={carPhotos}
              onChange={setCarPhotos}
              vehicles={vehicles}
              onVehiclesChange={(next)=>{
                setVehicles(next);
                const flat = ([] as string[]).concat(...next.map(v=> Array.isArray((v as { photos?: string[] }).photos) ? (v as { photos?: string[] }).photos as string[] : []));
                setCarPhotos(flat);
              }}
            />
          ) : (
            <div className="text-xs text-muted-foreground">Add a vehicle above to enable photo uploads.</div>
          )}
        </div>
        <div className="flex">
          <Button className="w-full" onClick={continueToPlan} disabled={loading}>Continue</Button>
        </div>
        <div className="text-xs text-white/60 text-center">You must add at least one vehicle and one photo to continue.</div>
      </section>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}> 
      <OnboardingPageInner />
    </Suspense>
  );
}


