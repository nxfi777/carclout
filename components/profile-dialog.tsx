"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";

import VehiclesEditor, { type Vehicle } from "@/components/vehicles-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2Icon } from "lucide-react";
import CarPhotosUploader from "@/components/car-photos-uploader";
// import { Checkbox } from "@/components/ui/checkbox";

export default function ProfileDialog() {
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  // const [hasFacebook, setHasFacebook] = useState<boolean>(false);
  // const [igLinked, setIgLinked] = useState<boolean>(false);
  const [image, setImage] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [isRequired, setIsRequired] = useState(false);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carPhotos, setCarPhotos] = useState<string[]>([]);
  const [chatProfilePhotos, setChatProfilePhotos] = useState<string[]>([]);
  const [bio, setBio] = useState<string>("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteVehicle, setPendingDeleteVehicle] = useState<Vehicle | null>(null);
  const [confirmSkipVehiclesOpen, setConfirmSkipVehiclesOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await fetch('/api/profile').then(r=>r.json());
      setName(data?.profile?.name || "");
      setDisplayName(data?.profile?.displayName || "");
      if (typeof data?.profile?.image === "string" && data.profile.image.length > 0) {
        setImagePreviewUrl(data.profile.image);
      }
      if (Array.isArray(data?.profile?.carPhotos)) setCarPhotos(data.profile.carPhotos);
      if (Array.isArray(data?.profile?.chatProfilePhotos)) setChatProfilePhotos(data.profile.chatProfilePhotos);
      if (typeof data?.profile?.bio === 'string') setBio(data.profile.bio);
      if (Array.isArray(data?.profile?.vehicles)) setVehicles(data.profile.vehicles);
      else if (Array.isArray(data?.profile?.cars)) {
        type CarLike = { make: string; model: string; type?: string; kitted?: unknown };
        setVehicles((data.profile.cars as CarLike[]).map((c) => ({
          make: c.make,
          model: c.model,
          type: (c.type === "bike" ? "bike" : "car"),
          kitted: Boolean(c.kitted),
        })));
      }
      // Instagram connect is disabled for MVP
    })();
  }, []);

  function hasVehicleDetailsFilled(list: Vehicle[]): boolean {
    if (!Array.isArray(list) || list.length === 0) return true; // allow no vehicles
    // Only require color/finish; accents optional
    return list.every((v) => typeof v.colorFinish === 'string' && v.colorFinish.trim().length > 0);
  }

  useEffect(() => {
    function onOpenProfile() { setOpen(true); }
    function onRequireProfile(e: Event) {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const fields = Array.isArray(detail?.required) ? (detail.required as string[]) : [];
        setRequiredFields(fields);
      } catch {
        setRequiredFields([]);
      }
      setIsRequired(true);
      setOpen(true);
    }
    window.addEventListener('open-profile', onOpenProfile as EventListener);
    window.addEventListener('require-profile', onRequireProfile as EventListener);
    return () => {
      window.removeEventListener('open-profile', onOpenProfile as EventListener);
      window.removeEventListener('require-profile', onRequireProfile as EventListener);
    };
  }, []);

  function areRequiredFieldsSatisfied(): boolean {
    if (isRequired) {
      if (requiredFields.includes('name')) {
        const hasName = typeof name === 'string' && name.trim().length > 0;
        if (!hasName) return false;
      }
      if (requiredFields.includes('vehicle')) {
        const hasVehicle = Array.isArray(vehicles) && vehicles.length > 0;
        if (!hasVehicle) return false;
        const hasPhoto = Array.isArray(carPhotos) && carPhotos.length > 0;
        if (!hasPhoto) return false;
      }
    }
    return true;
  }

  async function save(options?: { allowVehicleSkip?: boolean }) {
    const allowVehicleSkip = options?.allowVehicleSkip ?? false;
    // Enforce at least one vehicle and one car photo unless explicitly skipped
    const hasVehicle = Array.isArray(vehicles) && vehicles.length > 0;
    const hasPhoto = Array.isArray(carPhotos) && carPhotos.length > 0;
    const mustEnforceVehicle = isRequired && requiredFields.includes('vehicle');
    if (!allowVehicleSkip && (!hasVehicle || !hasPhoto)) {
      if (mustEnforceVehicle) {
        toast.error(!hasVehicle ? 'Add at least one vehicle.' : 'Add at least one car photo.');
        return;
      }
      setConfirmSkipVehiclesOpen(true);
      return;
    }
    // Block save if other required fields are missing (when forced-open)
    if (!areRequiredFieldsSatisfied()) {
      toast.error('Please fill the required fields before continuing.');
      return;
    }
    setIsSaving(true);
    try {
      let imageUrl: string | undefined;
      if (image) {
        const form = new FormData();
        let uploadBlob: Blob = image;
        if (croppedAreaPixels && imagePreviewUrl) {
          try {
            const blob = await getCroppedImage(imagePreviewUrl, croppedAreaPixels, image.type || "image/jpeg");
            if (blob) uploadBlob = blob;
          } catch {}
        }
        form.append("file", uploadBlob, image.name || "avatar.jpg");
        const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
        const data = await res.json();
        imageUrl = data?.url;
      }
      // Require vehicle details to be filled if any vehicles exist
      if (Array.isArray(vehicles) && vehicles.length > 0 && !hasVehicleDetailsFilled(vehicles)) {
        toast.error('Please fill Body color/finish for each vehicle. Accents are optional.');
        return;
      }
      const res = await fetch("/api/profile", { method: "POST", body: JSON.stringify({ name, displayName: (displayName || '').replace(/\s+/g,' ').trim() || null, image: imageUrl, vehicles, carPhotos, chatProfilePhotos, bio }) });
      if (!res.ok) {
        try {
          const data = await res.json();
          toast.error(data?.error || 'Failed to save profile');
        } catch {
          toast.error('Failed to save profile');
        }
        return;
      }
      // Notify UI pieces (header, chat) to refresh live without full reload
      try {
        const effectiveName = (displayName && displayName.trim()) ? displayName.trim() : name;
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: { name: effectiveName, image: imageUrl } }));
      } catch {}
      // Close only if not in required mode or requirements are satisfied
      if (!isRequired || areRequiredFieldsSatisfied()) {
        setOpen(false);
        setIsRequired(false);
        setRequiredFields([]);
        // After completing required profile, re-prompt daily bonus if needed
        try { window.dispatchEvent(new CustomEvent('prompt-daily-bonus')); } catch {}
      }
    } finally {
      setIsSaving(false);
    }
  }

  function onAvatarClick() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setImage(file);
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setImagePreviewUrl(objectUrl);
      setIsCropping(true);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
      setCroppedAreaPixels(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isCropping || !imagePreviewUrl || !croppedAreaPixels) return;
      const blob = await getCroppedImage(imagePreviewUrl, croppedAreaPixels, (image?.type || "image/jpeg"), { width: 128, height: 128 });
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      setAvatarPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    })();
    return () => { cancelled = true; };
  }, [isCropping, imagePreviewUrl, croppedAreaPixels, image]);

  

  function getCroppedImage(
    imageSrc: string,
    crop: Area,
    mime: string,
    resize?: { width: number; height: number }
  ): Promise<Blob | null> {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const outW = resize?.width ? Math.max(1, Math.round(resize.width)) : Math.max(1, Math.round(crop.width));
        const outH = resize?.height ? Math.max(1, Math.round(resize.height)) : Math.max(1, Math.round(crop.height));
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(
          image,
          Math.max(0, Math.round(crop.x)),
          Math.max(0, Math.round(crop.y)),
          Math.max(1, Math.round(crop.width)),
          Math.max(1, Math.round(crop.height)),
          0,
          0,
          canvas.width,
          canvas.height
        );
        canvas.toBlob((blob) => resolve(blob), mime || "image/jpeg", 0.95);
      };
      image.onerror = () => resolve(null);
      image.src = imageSrc;
    });
  }

  function sanitizeInstagramHandle(input: string): string {
    const withoutAt = input.toLowerCase().replace(/^@+/, "");
    const filtered = withoutAt.replace(/[^a-z0-9._]/g, "");
    return filtered.slice(0, 30);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isRequired && !areRequiredFieldsSatisfied()) {
          // Prevent closing while required fields missing
          return;
        }
        setOpen(next);
        if (!next) {
          setIsRequired(false);
          setRequiredFields([]);
        }
      }}
    >
      {/* Trigger is programmatic via header dropdown now */}
      <DialogContent
        showCloseButton={!isRequired || areRequiredFieldsSatisfied()}
        onInteractOutside={(e)=>{ if (isRequired && !areRequiredFieldsSatisfied()) e.preventDefault(); }}
        onEscapeKeyDown={(e)=>{ if (isRequired && !areRequiredFieldsSatisfied()) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>
            {isRequired && !areRequiredFieldsSatisfied() ? 'Complete your profile' : 'Edit profile'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Input
              type="email"
              value={session?.user?.email || ""}
              placeholder="you@example.com"
              readOnly
              aria-label="Email address"
            />
            <div className="text-xs text-muted-foreground">Email address (cannot be changed)</div>
          </div>
          {/* Instagram connect removed for MVP */}
          <div className="space-y-1">
            <div className="text-sm font-medium">Instagram username</div>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">@</span>
              <Input
                className="pl-7"
                id="profile-instagram-handle"
                aria-label="Instagram username"
                aria-describedby="profile-instagram-handle-help"
                placeholder="your Instagram username"
                value={name}
                onChange={(e)=>setName(sanitizeInstagramHandle(e.target.value))}
                pattern="^[a-z0-9._]{1,30}$"
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div id="profile-instagram-handle-help" className="text-xs text-muted-foreground">Your Instagram handle (username). The @ is shown for clarity and isn’t saved.{isRequired && requiredFields.includes('name') && (!name || !name.trim()) ? (
              <span className="ml-2 text-red-500">Required</span>
            ) : null}</div>
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
          <div className="space-y-2">
            <div className="text-sm font-medium">Avatar</div>
            <div className="inline-flex items-center gap-3">
              <div
                role="button"
                aria-label="Change avatar"
                onClick={onAvatarClick}
                className="cursor-pointer select-none"
              >
                <div className="bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] p-[2px] rounded-full">
                  <div className="bg-background rounded-full p-[2px]">
                    <Avatar className="size-20">
                      <AvatarImage src={isCropping ? (avatarPreviewUrl || imagePreviewUrl) : imagePreviewUrl} />
                      <AvatarFallback className="text-sm">
                        {(() => {
                          const cleaned = (name || "").replace(/^@+/, "");
                          return cleaned.split(" ").map((n) => n[0]).filter(Boolean).slice(0,2).join("") || "?";
                        })()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">Click the photo to upload</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
            {isCropping && imagePreviewUrl ? (
              <div className="mt-3">
                <div className="relative w-full max-w-sm h-64 bg-black/40 rounded-md overflow-hidden">
                  <Cropper
                    image={imagePreviewUrl}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-48"
                  />
                  <Button type="button" variant="outline" onClick={() => { setIsCropping(false); }}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!imagePreviewUrl || !croppedAreaPixels || !image) return setIsCropping(false);
                      try {
                        const blob = await getCroppedImage(imagePreviewUrl, croppedAreaPixels, image.type || "image/jpeg");
                        if (blob) {
                          const url = URL.createObjectURL(blob);
                          setImagePreviewUrl(url);
                        }
                      } finally {
                        setIsCropping(false);
                      }
                    }}
                  >
                    Apply crop
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Vehicles</div>
            <VehiclesEditor
              value={vehicles}
              onChange={setVehicles}
              onWillRemoveVehicle={async (vehicle, index) => {
                // Detect if there are any photos in /vehicles/<slug>/
                function baseSlug(v: Vehicle){ return `${v.make} ${v.model}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
                const same = vehicles.filter(v => v.make===vehicle.make && v.model===vehicle.model && v.type===vehicle.type);
                const position = same.findIndex(v => v === vehicles[index]);
                const suffix = position > 0 ? `-${position+1}` : '';
                const folder = `${baseSlug(vehicle)}${suffix}`;
                try {
                  const res = await fetch(`/api/storage/list?path=${encodeURIComponent(`vehicles/${folder}`)}`);
                  const data: unknown = await res.json();
                  const items = Array.isArray((data as { items?: Array<{ type?: string }> } | null | undefined)?.items)
                    ? ((data as { items?: Array<{ type?: string }> }).items as Array<{ type?: string }>)
                    : [];
                  const hasImages = items.some((it) => it?.type === 'file');
                  if (hasImages) {
                    setPendingDeleteVehicle(vehicle);
                    setConfirmDeleteOpen(true);
                    return false;
                  }
                } catch {}
                // Also remove any matching carPhotos keys for cleanliness
                const prefix = `/vehicles/${folder}/`;
                setCarPhotos((prev)=> (prev || []).filter((k)=>{
                  const i = (k || '').indexOf('/vehicles/');
                  if (i === -1) return true;
                  const sub = (k || '').slice(i);
                  return !sub.startsWith(prefix);
                }));
                return true;
              }}
            />
          </div>
          <div className="space-y-2">
            {vehicles.length > 0 ? (
              <CarPhotosUploader
                value={carPhotos}
                onChange={(next)=>{
                  setCarPhotos(next);
                }}
                vehicles={vehicles}
                onVehiclesChange={(next)=>{
                  setVehicles(next);
                  // Keep global carPhotos as a flattened view for compatibility
                  const flat = ([] as string[]).concat(...next.map(v=> Array.isArray((v as { photos?: string[] }).photos) ? (v as { photos?: string[] }).photos as string[] : []));
                  setCarPhotos(flat);
                  // Clean chatProfilePhotos if items were removed
                  const setFlat = new Set(flat);
                  setChatProfilePhotos((prev)=> (prev||[]).filter(k=> setFlat.has(k)));
                }}
                chatSelected={chatProfilePhotos}
                onChatSelectedChange={setChatProfilePhotos}
                chatMax={6}
              />
            ) : (
              <div className="text-xs text-muted-foreground">Add a vehicle above to enable photo uploads.</div>
            )}
          </div>
          {/* Bio */}
          <div className="space-y-1">
            <div className="text-sm font-medium">Bio (optional)</div>
            <textarea
              value={bio}
              onChange={(e)=> setBio(e.target.value.slice(0, 500))}
              placeholder="Tell others a bit about you or your build (max 500 chars)"
              className="w-full rounded bg-white/5 px-3 py-2 text-sm min-h-[6rem]"
            />
            <div className="text-xs text-muted-foreground">{bio.length}/500</div>
          </div>
          {/* Chat profile selection now integrated into Vehicle Photos above */}
          <Button onClick={() => save()} disabled={isSaving} className="w-full">
            {isSaving ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </DialogContent>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This vehicle has photos in your workspace. Deleting the vehicle will remove all images in its folder. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={()=>{ setPendingDeleteVehicle(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async()=>{
                const v = pendingDeleteVehicle;
                setConfirmDeleteOpen(false);
                if (!v) return;
                function slug(vh: Vehicle){ return `${vh.make} ${vh.model}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
                const folder = slug(v);
                try {
                  await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key: `vehicles/${folder}/`, isFolder: true }) });
                } catch {}
                setVehicles((prev)=>prev.filter((x)=>!(x.make===v.make && x.model===v.model && x.type===v.type)));
                setPendingDeleteVehicle(null);
              }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmSkipVehiclesOpen} onOpenChange={setConfirmSkipVehiclesOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save without a vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const missingVehicle = vehicles.length === 0;
                const missingPhotos = carPhotos.length === 0;
                if (missingVehicle && missingPhotos) {
                  return 'You haven’t added any vehicles or car photos yet. Saving now keeps your profile empty until you add them later.';
                }
                if (missingVehicle) {
                  return 'You removed all vehicles. Saving now means people won’t see what you drive until you add one again.';
                }
                return 'Your vehicles don’t have any photos yet. Saving now keeps your profile imagery blank until you upload some.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmSkipVehiclesOpen(false)}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSkipVehiclesOpen(false);
                void save({ allowVehicleSkip: true });
              }}
            >
              Save without vehicle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

 
