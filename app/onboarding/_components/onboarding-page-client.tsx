"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import VehiclesEditor, { type Vehicle } from "@/components/vehicles-editor";
import CarPhotosUploader from "@/components/car-photos-uploader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [confirmSkipVehiclesOpen, setConfirmSkipVehiclesOpen] = useState(false);
  const missingVehicle = vehicles.length === 0;
  const missingPhotos = carPhotos.length === 0;
  const skipWarning = missingVehicle && missingPhotos
    ? "Your profile has no vehicles or car photos yet. Continuing means your account will look empty until you add them later."
    : missingVehicle
      ? "You haven’t added a vehicle yet. People won’t know what you drive until you add one."
      : "You’ve added a vehicle but no photos. Upload at least one so your build stands out.";

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
          if (Array.isArray(profile.carPhotos)) setCarPhotos((profile.carPhotos as string[]).filter((value) => typeof value === "string"));
          if (profile.onboardingCompleted) {
            router.replace("/plan" + (params.get("plan") ? `?plan=${encodeURIComponent(params.get("plan") as string)}` : ""));
            return;
          }
        }
        const isSubscribed = plan === "minimum" || plan === "basic" || plan === "pro";
        if (isSubscribed) {
          router.replace("/dashboard/home");
          return;
        }
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

  const hasMinimum = useMemo(
    () => Array.isArray(vehicles) && vehicles.length > 0 && Array.isArray(carPhotos) && carPhotos.length > 0,
    [vehicles, carPhotos],
  );

  async function continueToPlan(options?: { allowVehicleSkip?: boolean }) {
    const allowVehicleSkip = options?.allowVehicleSkip ?? false;
    if (!username) {
      toast.error("Add your Instagram username.");
      return;
    }
    if (!allowVehicleSkip && !hasMinimum) {
      setConfirmSkipVehiclesOpen(true);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: sanitizeInstagramHandle(username),
        displayName: (displayName || "").trim() ? (displayName || "").replace(/\s+/g, " ").trim().slice(0, 50) : null,
        vehicles,
        carPhotos,
        onboardingCompleted: true,
      };
      const response = await fetch("/api/profile", { method: "POST", body: JSON.stringify(payload) });
      if (!response.ok) {
        try {
          const data = await response.json();
          toast.error(data?.error || "Failed to save profile");
        } catch {
          toast.error("Failed to save profile");
        }
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
              onChange={(event) => setUsername(sanitizeInstagramHandle(event.target.value))}
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
            onChange={(event) => setDisplayName(event.target.value.slice(0, 50))}
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
              onVehiclesChange={(next) => {
                setVehicles(next);
                const flat = ([] as string[]).concat(
                  ...next.map((vehicle) =>
                    Array.isArray((vehicle as { photos?: string[] }).photos)
                      ? ((vehicle as { photos?: string[] }).photos as string[])
                      : [],
                  ),
                );
                setCarPhotos(flat);
              }}
            />
          ) : (
            <div className="text-xs text-muted-foreground">Add a vehicle above to enable photo uploads.</div>
          )}
        </div>
        <div className="flex">
          <Button className="w-full" onClick={() => continueToPlan()} disabled={loading}>
            Continue
          </Button>
        </div>
        <div className="text-xs text-white/60 text-center">Adding a vehicle and photos helps your profile shine, but you can skip for now.</div>
      </section>
      <AlertDialog open={confirmSkipVehiclesOpen} onOpenChange={setConfirmSkipVehiclesOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Continue without a vehicle?</AlertDialogTitle>
            <AlertDialogDescription>{skipWarning}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmSkipVehiclesOpen(false)}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSkipVehiclesOpen(false);
                void continueToPlan({ allowVehicleSkip: true });
              }}
            >
              Continue without vehicle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function OnboardingPageSuspenseWrapper() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}>
      <OnboardingPageInner />
    </Suspense>
  );
}

export default function OnboardingPageClient() {
  return <OnboardingPageSuspenseWrapper />;
}
