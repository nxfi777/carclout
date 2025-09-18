"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import VehiclesEditor, { type Vehicle } from "@/components/vehicles-editor";
import CarPhotosUploader from "@/components/car-photos-uploader";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";

export default function WelcomeOnboarding() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carPhotos, setCarPhotos] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingVehicle, setPendingVehicle] = useState<Vehicle | null>(null);
  const isAuthRoute = !!(pathname && pathname.startsWith("/auth"));
  const isDashboardRoute = !!(pathname && pathname.startsWith("/dashboard"));

  useEffect(() => {
    (async () => {
      try {
        const seen = typeof window !== 'undefined' ? localStorage.getItem('ignition_welcome_seen') : '1';
        // Check server state to avoid showing for already onboarded users
        const profileResp = await fetch('/api/profile', { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
        const serverProfile = profileResp?.profile || null;
        const done = !!serverProfile?.onboardingCompleted;

        // Prefill from existing profile data if present
        if (serverProfile) {
          if (typeof serverProfile.name === 'string') setUsername((serverProfile.name || '').toString());
          if (typeof serverProfile.displayName === 'string') setDisplayName((serverProfile.displayName || '').toString());
          if (Array.isArray(serverProfile.vehicles)) setVehicles(serverProfile.vehicles as Vehicle[]);
          if (Array.isArray(serverProfile.carPhotos)) setCarPhotos((serverProfile.carPhotos as string[]).filter((x)=>typeof x === 'string'));
        }

        // Determine minimum completeness for bypassing welcome: require ≥1 vehicle and ≥1 car photo
        const hasVehicles = Array.isArray(serverProfile?.vehicles) && (serverProfile.vehicles as Vehicle[]).length > 0;
        const hasCarPhotos = Array.isArray(serverProfile?.carPhotos) && (serverProfile.carPhotos as string[]).length > 0;
        const hasMinimumProfile = hasVehicles && hasCarPhotos;

        // If onboarding is completed, never show welcome again. If new mandatory fields are missing, open edit profile instead.
        if (done) {
          try { if (typeof window !== 'undefined') localStorage.setItem('ignition_welcome_seen','1'); } catch {}
          // Detect missing mandatory fields post-onboarding
          if (!hasMinimumProfile && typeof window !== 'undefined' && isDashboardRoute) {
            try { window.dispatchEvent(new CustomEvent('require-profile', { detail: { required: ['vehicle'] } })); } catch {}
          }
          setOpen(false);
          return;
        }

        // If user already has the minimal profile data but flag wasn't set, set flag and do not show welcome
        if (!done && hasMinimumProfile) {
          try { await fetch('/api/profile', { method:'POST', body: JSON.stringify({ onboardingCompleted: true }) }); } catch {}
          try { if (typeof window !== 'undefined') localStorage.setItem('ignition_welcome_seen','1'); } catch {}
          setOpen(false);
          return;
        }

        // For true first-time users with no data, only show if not seen on this device
        if (!seen) setOpen(true);
      } catch {}
    })();
  }, [isDashboardRoute]);

  // Vehicle selection handled by VehiclesEditor

  function sanitizeInstagramHandle(input: string): string {
    const withoutAt = input.toLowerCase().replace(/^@+/, "");
    const filtered = withoutAt.replace(/[^a-z0-9._]/g, "");
    return filtered.slice(0, 30);
  }

  function hasVehicleDetailsFilled(list: Vehicle[]): boolean {
    if (!Array.isArray(list) || list.length === 0) return true; // allow no vehicles
    // Only require color/finish; accents are optional
    return list.every((v) => typeof v.colorFinish === 'string' && v.colorFinish.trim().length > 0);
  }

  async function submit() {
    // Require at least one vehicle and one image
    if (vehicles.length < 1) { toast.error('Add at least one vehicle.'); return; }
    if (!hasVehicleDetailsFilled(vehicles)) { toast.error('Please fill Body color/finish for each vehicle.'); return; }
    if (carPhotos.length < 1) { toast.error('Add at least one photo for your vehicle.'); return; }
    const payload = {
      name: sanitizeInstagramHandle(username),
      displayName: (displayName || '').trim() ? (displayName || '').replace(/\s+/g,' ').trim().slice(0,50) : null,
      vehicles,
      carPhotos,
      onboardingCompleted: true,
    };
    const res = await fetch('/api/profile', { method:'POST', body: JSON.stringify(payload) });
    if (!res.ok) {
      try {
        const data = await res.json();
        toast.error(data?.error || 'Failed to save profile');
      } catch {
        toast.error('Failed to save profile');
      }
      return;
    }
    localStorage.setItem('ignition_welcome_seen', '1');
    setOpen(false);
  }

  if (isAuthRoute) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Prevent closing the welcome until the user completes it
        if (!next) return;
        setOpen(true);
      }}
    >
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => { e.preventDefault(); }}
        onEscapeKeyDown={(e) => { e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Welcome — what’s your Instagram handle?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Instagram username</div>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">@</span>
              <Input
                className="pl-7"
                id="welcome-instagram-handle"
                aria-label="Instagram username"
                aria-describedby="welcome-instagram-handle-help"
                placeholder="your Instagram username"
                value={username}
                onChange={(e)=>setUsername(sanitizeInstagramHandle(e.target.value))}
                pattern="^[a-z0-9._]{1,30}$"
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
            </div>
            <div id="welcome-instagram-handle-help" className="text-xs text-muted-foreground">Your Instagram handle (username). The @ is shown for clarity and isn’t saved.</div>
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
            <div className="text-xs text-muted-foreground">If empty, we’ll show your Instagram username.</div>
          </div>
          <VehiclesEditor
            value={vehicles}
            onChange={setVehicles}
            onWillRemoveVehicle={async (_vehicle) => {
              // Welcome screen likely has no images yet, but keep UX consistent
              setPendingVehicle(_vehicle);
              setConfirmDeleteOpen(true);
              return false;
            }}
          />
          <div className="space-y-2">
            {vehicles.length > 0 ? (
              <CarPhotosUploader
                value={carPhotos}
                onChange={(next)=> setCarPhotos(next)}
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
          {/* Instagram connect removed for MVP */}
          <div className="flex">
            <Button onClick={submit} disabled={!username} className="w-full">Continue</Button>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            You can&apos;t close this until you finish. This is only shown once.
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              If this vehicle has any photos, they will be deleted. You can add vehicles again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={()=>{ setPendingVehicle(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={()=>{ const v = pendingVehicle; setConfirmDeleteOpen(false); if (!v) return; setVehicles(prev=>prev.filter((x)=>!(x.make===v.make && x.model===v.model && x.type===v.type))); setPendingVehicle(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

