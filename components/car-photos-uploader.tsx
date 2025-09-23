"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getViewUrl, getViewUrls } from "@/lib/view-url-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Vehicle } from "@/components/vehicles-editor";
import { Loader2Icon, UploadIcon, XIcon, ArrowLeftIcon, ArrowRightIcon, StarIcon } from "lucide-react";

interface CarPhotosUploaderProps {
  value: string[];
  onChange: (next: string[]) => void;
  vehicles?: Vehicle[];
  onVehiclesChange?: (next: Vehicle[]) => void;
  initialVehicleIndex?: number;
  max?: number; // max per vehicle
  className?: string;
  chatSelected?: string[];
  onChatSelectedChange?: (next: string[]) => void;
  chatMax?: number;
}

// Removed unused type alias per lint

export default function CarPhotosUploader({ value, onChange, vehicles = [], onVehiclesChange, initialVehicleIndex = 0, max = 30, className, chatSelected, onChatSelectedChange, chatMax = 6 }: CarPhotosUploaderProps) {
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
  const chatSelectedSet = useMemo(() => new Set(chatSelected || []), [chatSelected]);

  const flattenVehiclePhotos = useCallback((list: Vehicle[] | undefined): string[] => {
    if (!Array.isArray(list)) return value || [];
    const out: string[] = [];
    for (const v of list) {
      const arr = (v as unknown as { photos?: string[] })?.photos;
      if (Array.isArray(arr)) {
        for (const k of arr) if (typeof k === 'string') out.push(k);
      }
    }
    return out;
  }, [value]);

  // Determine keys for selected vehicle from per-vehicle photos when available; fallback by filtering global list
  const keysForSelected = useMemo(() => {
    if (selectedVehicle?.photos && Array.isArray(selectedVehicle.photos)) return selectedVehicle.photos.filter(Boolean) as string[];
    if (!vehicles.length || !selectedSlug) return value || [];
    const prefix = `/vehicles/${selectedSlug}/`;
    return (value || []).filter((k) => {
      const idx = (k || "").indexOf("/vehicles/");
      if (idx === -1) return false;
      const sub = (k || "").slice(idx);
      return sub.startsWith(prefix);
    });
  }, [value, vehicles, selectedVehicle, selectedSlug]);

  const canAddCount = Math.max(0, max - (keysForSelected?.length || 0));

  function belongsToSelectedFolder(k: string): boolean {
    const idx = (k || "").indexOf('/vehicles/');
    if (idx === -1) return false;
    const sub = (k || "").slice(idx);
    return sub.startsWith(`/vehicles/${selectedSlug}/`);
  }

  function applyReorderForSelected(newOrder: string[]) {
    if (vehicles.length && onVehiclesChange) {
      const nextVehicles = (vehicles || []).map((v, i) => (i === selectedVehicleIndex ? ({ ...v, photos: [...newOrder] } as Vehicle) : v));
      onVehiclesChange(nextVehicles);
      const flat = flattenVehiclePhotos(nextVehicles);
      onChange(flat);
    } else {
      // Rebuild global value preserving non-folder keys' relative order
      const firstIdx = (value || []).findIndex(belongsToSelectedFolder);
      const prefix = (value || []).slice(0, Math.max(firstIdx, 0)).filter((k) => !belongsToSelectedFolder(k));
      const suffix = (value || []).slice(Math.max(firstIdx, 0)).filter((k) => !belongsToSelectedFolder(k));
      const nextGlobal = [...prefix, ...newOrder, ...suffix];
      onChange(nextGlobal);
    }
  }

  // Primary control removed; use arrows to reorder if needed

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

  const keysNeedingPreview = useMemo(() => {
    const all = flattenVehiclePhotos(vehicles);
    const src = all.length ? all : (value || []);
    return src.filter((k) => !previews[k]);
  }, [value, previews, vehicles, flattenVehiclePhotos]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!keysNeedingPreview.length) return;
      try {
        const urls = await getViewUrls(keysNeedingPreview);
        if (!cancelled) setPreviews((prev) => ({ ...prev, ...urls }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [keysNeedingPreview]);

  const browse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  function toggleChatSelection(key: string) {
    if (!onChatSelectedChange) return;
    const current = Array.isArray(chatSelected) ? chatSelected : [];
    const isSel = current.includes(key);
    if (isSel) {
      onChatSelectedChange(current.filter((k) => k !== key));
    } else if (current.length < chatMax) {
      onChatSelectedChange([...current, key]);
    }
  }

  const uploadFiles = useCallback(async (files: File[]) => {
    setUploadErrors(null);
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
              const url = await getViewUrl(key);
              if (typeof url === "string" && url) setPreviews((prev) => ({ ...prev, [key]: url }));
            } catch {}
          }
        } catch (err) {
          const msg = (err instanceof Error && err.message) ? err.message : "Upload failed";
          setUploadErrors(msg);
        }
      }
      if (nextKeys.length) {
        if (vehicles.length && onVehiclesChange) {
          const nextVehicles = (vehicles || []).map((v, i) => {
            if (i !== selectedVehicleIndex) return v;
            const existing = Array.isArray(v.photos) ? v.photos : [];
            return { ...v, photos: [...existing, ...nextKeys] } as Vehicle;
          });
          onVehiclesChange(nextVehicles);
          const flat = flattenVehiclePhotos(nextVehicles);
          onChange(flat);
        } else {
          const current = value || [];
          onChange([...(current || []), ...nextKeys]);
        }
      }
    } finally {
      setIsUploading(false);
    }
  }, [value, vehicles, onVehiclesChange, selectedVehicleIndex, selectedSlug, keysForSelected?.length, max, onChange, flattenVehiclePhotos]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    void uploadFiles(files);
  }, [uploadFiles]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);

  

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    void uploadFiles(files);
    try { e.target.value = ""; } catch {}
  }

  async function removeKey(key: string) {
    try {
      await fetch('/api/storage/delete', { method: 'POST', body: JSON.stringify({ key, isFolder: false }) });
    } catch {}
    if (vehicles.length && onVehiclesChange) {
      const nextVehicles = (vehicles || []).map((v, i) => {
        if (i !== selectedVehicleIndex) return v;
        const existing = Array.isArray(v.photos) ? v.photos : [];
        return { ...v, photos: existing.filter((k) => k !== key) } as Vehicle;
      });
      onVehiclesChange(nextVehicles);
      const flat = flattenVehiclePhotos(nextVehicles);
      onChange(flat);
    } else {
      const next = (value || []).filter((k) => k !== key);
      onChange(next);
    }
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
          {onChatSelectedChange ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div>Chat profile selection: {(chatSelected?.length || 0)}/{chatMax}</div>
              {(chatSelected?.length || 0) > 0 ? (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-white"
                  onClick={() => onChatSelectedChange([])}
                  aria-label="Clear selected chat photos"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
          {(keysForSelected?.length || 0) > 0 ? (
            <ul className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(keysForSelected || []).map((key, idx) => {
                const url = previews[key];
                const isChat = chatSelectedSet.has(key);
                return (
                  <li key={key} className="relative group">
                    <div className="h-48 rounded-md overflow-hidden bg-black/20">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="Car photo" className="w-full h-full object-contain" />
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
                      {onChatSelectedChange ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={isChat ? "Remove from chat profile" : "Show on chat profile"}
                              className={`rounded-full p-1 ${isChat ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white'}`}
                              onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); toggleChatSelection(key); }}
                            >
                              <StarIcon className="size-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>{isChat ? 'Remove from chat profile' : 'Show on chat profile'}</TooltipContent>
                        </Tooltip>
                      ) : null}
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


