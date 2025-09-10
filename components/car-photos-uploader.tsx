"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Vehicle } from "@/components/vehicles-editor";
import { Loader2Icon, UploadIcon, XIcon, ArrowLeftIcon, ArrowRightIcon, StarIcon } from "lucide-react";

interface CarPhotosUploaderProps {
  value: string[];
  onChange: (next: string[]) => void;
  vehicles?: Vehicle[];
  initialVehicleIndex?: number;
  max?: number; // max per vehicle
  className?: string;
}

type KeyPreview = { key: string; url: string };

export default function CarPhotosUploader({ value, onChange, vehicles = [], initialVehicleIndex = 0, max = 30, className }: CarPhotosUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<string | null>(null);
  const [selectedVehicleIndex, setSelectedVehicleIndex] = useState<number>(Math.min(Math.max(0, initialVehicleIndex), Math.max(0, (vehicles?.length || 1) - 1)));

  function baseSlug(v: Vehicle | undefined): string {
    if (!v) return "";
    const name = `${v.make} ${v.model}`.trim().toLowerCase();
    return name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function uniqueSlugForIndex(list: Vehicle[], index: number): string {
    const v = list[index];
    if (!v) return "";
    const base = baseSlug(v);
    let priorSame = 0;
    for (let i = 0; i < index; i++) {
      const u = list[i];
      if (u && u.make === v.make && u.model === v.model && u.type === v.type) priorSame += 1;
    }
    // For duplicates beyond the first, add -1, -2, etc.
    const suffix = priorSame > 0 ? `-${priorSame}` : "";
    return `${base}${suffix}`;
  }
  const selectedVehicle = vehicles[selectedVehicleIndex];
  const selectedSlug = vehicles.length ? uniqueSlugForIndex(vehicles, selectedVehicleIndex) : baseSlug(selectedVehicle);

  // Filter keys by selected vehicle folder when vehicles list provided
  const keysForSelected = useMemo(() => {
    if (!vehicles.length || !selectedSlug) return value || [];
    const prefix = `/vehicles/${selectedSlug}/`;
    return (value || []).filter((k) => {
      const idx = (k || "").indexOf("/vehicles/");
      if (idx === -1) return false;
      const sub = (k || "").slice(idx);
      return sub.startsWith(prefix);
    });
  }, [value, vehicles, selectedSlug]);

  const canAddCount = Math.max(0, max - (keysForSelected?.length || 0));

  function belongsToSelectedFolder(k: string): boolean {
    const idx = (k || "").indexOf('/vehicles/');
    if (idx === -1) return false;
    const sub = (k || "").slice(idx);
    return sub.startsWith(`/vehicles/${selectedSlug}/`);
  }

  function applyReorderForSelected(newOrder: string[]) {
    // Rebuild global value preserving non-folder keys' relative order
    const firstIdx = (value || []).findIndex(belongsToSelectedFolder);
    const prefix = (value || []).slice(0, Math.max(firstIdx, 0)).filter((k) => !belongsToSelectedFolder(k));
    const suffix = (value || []).slice(Math.max(firstIdx, 0)).filter((k) => !belongsToSelectedFolder(k));
    const nextGlobal = [...prefix, ...newOrder, ...suffix];
    onChange(nextGlobal);
  }

  function makePrimary(key: string) {
    const current = keysForSelected || [];
    const rest = current.filter((k) => k !== key);
    applyReorderForSelected([key, ...rest]);
  }

  function moveKey(key: string, dir: -1 | 1) {
    const current = keysForSelected || [];
    const idx = current.indexOf(key);
    if (idx === -1) return;
    const newIdx = Math.max(0, Math.min(current.length - 1, idx + dir));
    if (newIdx === idx) return;
    const next = [...current];
    next.splice(idx, 1);
    next.splice(newIdx, 0, key);
    applyReorderForSelected(next);
  }

  // Removed A–Z and Reverse batch sorting per UX request

  const keysNeedingPreview = useMemo(() => (value || []).filter((k) => !previews[k]), [value, previews]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!keysNeedingPreview.length) return;
      for (const key of keysNeedingPreview) {
        try {
          const res = await fetch("/api/storage/view", { method: "POST", body: JSON.stringify({ key }) });
          const data = await res.json();
          if (!cancelled && typeof data?.url === "string") {
            setPreviews((prev) => ({ ...prev, [key]: data.url }));
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [keysNeedingPreview]);

  const browse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    await uploadFiles(files);
  }, [value]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);

  async function uploadFiles(files: File[]) {
    setUploadErrors(null);
    const current = value || [];
    if (!files.length) return;
    const allowed = Math.max(0, max - (keysForSelected?.length || 0));
    const take = files.filter((f) => (f.type || "").startsWith("image/")).slice(0, allowed);
    if (take.length === 0) {
      setUploadErrors(allowed === 0 ? `You already have ${max} photos.` : "No valid images selected.");
      return;
    }
    setIsUploading(true);
    try {
      const nextKeys: string[] = [];
      for (const file of take) {
        try {
          const form = new FormData();
          form.append("file", file);
          // Require a selected vehicle when vehicles list provided
          if (vehicles.length) {
            if (!selectedSlug) throw new Error("Select a vehicle first.");
            form.append("path", `vehicles/${selectedSlug}`);
          } else {
            form.append("path", "car-photos");
          }
          const res = await fetch("/api/storage/upload", { method: "POST", body: form });
          if (!res.ok) {
            try { const data = await res.json(); throw new Error(data?.error || "Upload failed"); } catch { throw new Error("Upload failed"); }
          }
          const data = await res.json();
          const key = String(data?.key || "");
          if (key) {
            nextKeys.push(key);
            // Fetch a view URL for preview immediately
            try {
              const vres = await fetch("/api/storage/view", { method: "POST", body: JSON.stringify({ key }) });
              const vdata = await vres.json();
              if (typeof vdata?.url === "string") {
                setPreviews((prev) => ({ ...prev, [key]: vdata.url }));
              }
            } catch {}
          }
        } catch (err: any) {
          setUploadErrors(err?.message || "Upload failed");
        }
      }
      if (nextKeys.length) onChange([...(current || []), ...nextKeys]);
    } finally {
      setIsUploading(false);
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    uploadFiles(files);
    try { e.target.value = ""; } catch {}
  }

  async function removeKey(key: string) {
    try {
      await fetch('/api/storage/delete', { method: 'POST', body: JSON.stringify({ key, isFolder: false }) });
    } catch {}
    const next = (value || []).filter((k) => k !== key);
    onChange(next);
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Vehicle Photos</div>
        {vehicles.length ? (
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">{keysForSelected.length}/{max}</div>
            <Select value={String(selectedVehicleIndex)} onValueChange={(v)=>setSelectedVehicleIndex(parseInt(v))}>
              <SelectTrigger className="h-8 w-48">
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v, i) => (
                  <SelectItem key={`${v.make}-${v.model}-${i}`} value={String(i)}>
                    {v.make} {v.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{(value?.length || 0)}/{max}</div>
        )}
      </div>
      <div
        className={`mt-2 rounded-md border border-dashed ${isDragging ? "bg-white/5" : "bg-transparent"}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className="p-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Upload up to {max} images per vehicle. JPG/PNG/WebP. Files are stored in your workspace under {vehicles.length && selectedSlug ? `/vehicles/${selectedSlug}` : '/car-photos'}.
            </div>
            <div className="flex items-center gap-2">
              <Input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileInputChange} />
              <Button type="button" variant="outline" size="sm" onClick={browse} disabled={isUploading || canAddCount === 0 || (vehicles.length > 0 && !selectedSlug)}>
                {isUploading ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <UploadIcon className="mr-2 size-4" />} Add photos
              </Button>
              {/* Sorting controls removed */}
            </div>
          </div>
          {uploadErrors ? <div className="text-xs text-red-400">{uploadErrors}</div> : null}
          {(keysForSelected?.length || 0) > 0 ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(keysForSelected || []).map((key, idx) => {
                const url = previews[key];
                return (
                  <li key={key} className="relative group">
                    <div className="aspect-square rounded-md overflow-hidden bg-black/20">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="Car photo" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-muted-foreground">
                          <Loader2Icon className="size-5 animate-spin" />
                        </div>
                      )}
                    </div>
                    {idx === 0 ? (
                      <div className="absolute top-1 left-1 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">Primary</div>
                    ) : null}
                    <div className="absolute bottom-1 left-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" aria-label="Make primary" className="rounded-full p-1 bg-black/60 text-white" onClick={()=>makePrimary(key)}>
                        <StarIcon className="size-4" />
                      </button>
                      <button type="button" aria-label="Move left" className="rounded-full p-1 bg-black/60 text-white" onClick={()=>moveKey(key, -1)}>
                        <ArrowLeftIcon className="size-4" />
                      </button>
                      <button type="button" aria-label="Move right" className="rounded-full p-1 bg-black/60 text-white" onClick={()=>moveKey(key, 1)}>
                        <ArrowRightIcon className="size-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove photo"
                      className="absolute top-1 right-1 rounded-full p-1 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeKey(key)}
                    >
                      <XIcon className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-xs text-muted-foreground">No photos yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}


