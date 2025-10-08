"use client";
import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import NextImage from "next/image";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
// import { R2FileTree } from "@/components/ui/file-tree";
import FixedAspectCropper from "@/components/ui/fixed-aspect-cropper";
import Designer from "@/components/layer-editor/designer";
import { Dialog as AppDialog, DialogContent as AppDialogContent, DialogHeader as AppDialogHeader, DialogTitle as AppDialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DropZone } from "@/components/ui/drop-zone";
import { UploadIcon, SquarePlus, SquareCheckBig, RotateCw } from "lucide-react";
import type { Vehicle } from "@/components/vehicles-editor";
import carLoadAnimation from "@/public/carload.json";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { confirmToast } from "@/components/ui/toast-helpers";
import { Separator } from "@/components/ui/separator";
import { getViewUrl, getViewUrls } from "@/lib/view-url-client";
import CreditDepletionDrawer from "@/components/credit-depletion-drawer";
import { useCreditDepletion } from "@/lib/use-credit-depletion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type TemplateVariable = { key?: string; type?: string; label?: string; options?: string[]; defaultValue?: string };
export type UseTemplateTemplate = {
  id?: string;
  name: string;
  desc?: string;
  thumbUrl?: string;
  slug?: string;
  variables?: TemplateVariable[];
  prompt?: string;
  favoriteCount?: number;
  isFavorited?: boolean;
  fixedAspectRatio?: boolean;
  aspectRatio?: number;
  allowedImageSources?: Array<"vehicle" | "user">;
  // deprecated
  autoOpenDesigner?: boolean;
  maxUploadImages?: number;
  video?: {
    enabled?: boolean;
    provider?: 'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro';
    prompt?: string;
    duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
    resolution?: 'auto'|'480p'|'720p'|'1080p';
    aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
    camera_fixed?: boolean;
    fps?: number;
    allowedDurations?: Array<'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'>;
  } | null;
};

export function UseTemplateContent({ template }: { template: UseTemplateTemplate }) {
  const sessionRef = useRef<number>(0);
  const [me, setMe] = useState<{ plan?: string | null } | null>(null);
  const [source, setSource] = useState<"vehicle" | "upload" | "workspace">(() => {
    const srcs: Array<"vehicle" | "user"> = Array.isArray(template?.allowedImageSources) ? (template.allowedImageSources as Array<"vehicle" | "user">) : ["vehicle", "user"];
    return srcs.includes("vehicle") ? "vehicle" : "upload";
  });
  const [vehiclePhotos, setVehiclePhotos] = useState<string[]>([]);
  const [profileVehicles, setProfileVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(null);
  const [_browsePath] = useState<string>("");
  const [browseSelected, setBrowseSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const creditDepletion = useCreditDepletion();
  const [designOpen, setDesignOpen] = useState(false);
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<Record<string, string>>({});
  const [upscales, setUpscales] = useState<Array<{ key: string; url: string }>>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [upscaleBusy, setUpscaleBusy] = useState<boolean>(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<string[] | null>(null);
  const [varState, setVarState] = useState<Record<string, string>>({});
  const [sourceVehicleKey, setSourceVehicleKey] = useState<string | null>(null); // Track original vehicle photo for designer backgroundKey
  const requiredImages = ((): number => {
    try {
      const n = Number((template as { maxUploadImages?: number })?.maxUploadImages || 1);
      return Number.isFinite(n) && n > 0 ? Math.max(1, Math.floor(n)) : 1;
    } catch { return 1; }
  })();
  const [selectedImageKeys, setSelectedImageKeys] = useState<string[]>([]);
  const [workspaceItems, setWorkspaceItems] = useState<Array<{ key: string; url: string; name: string; blurhash?: string }>>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [requiredShake, setRequiredShake] = useState(false);

  // Reset generated output/designer state when switching templates
  function resetTemplateSession() {
    try {
      setResultUrl(null);
      setResultKey(null);
      setDesignOpen(false);
      setUpscales([]);
      setActiveKey(null);
      setActiveUrl(null);
      setUpscaleBusy(false);
      setCropOpen(false);
      setSourceVehicleKey(null);
      setCropUrl(null);
      setPendingKeys(null);
      setVarState({});
      setBusy(false);
      // Ensure fresh start for image selections
      setSelectedImageKeys([]);
    } catch {}
  }

  useEffect(() => {
    sessionRef.current += 1;
    resetTemplateSession();
  }, [template?.id, template?.slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        if (!cancelled) setMe({ plan: m?.plan ?? null });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load library thumbnails for workspace browsing (simple grid of /library)
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setWorkspaceLoading(true);
        const listRes = await fetch('/api/storage/list?path=' + encodeURIComponent('library'), { cache: 'no-store' });
        const obj = await listRes.json().catch(() => ({}));
        const arr: Array<{ type?: string; name?: string; key?: string; lastModified?: string; blurhash?: string }> = Array.isArray(obj?.items) ? obj.items : [];
        const files = arr.filter((it) => String(it?.type) === 'file');
        const imageFiles = files.filter((it) => {
          const s = String(it?.key || it?.name || '').toLowerCase();
          return /\.(png|jpe?g|webp|gif|avif|svg)$/.test(s);
        });
        // Sort by most recent first
        imageFiles.sort((a, b) => {
          const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return bTime - aTime;
        });
        const keys = imageFiles.map((it) => it.key || `library/${String(it?.name || '')}`);
        if (!keys.length) { if (!aborted) setWorkspaceItems([]); return; }
        const urls = await getViewUrls(keys);
        const out = imageFiles.map((it) => ({ 
          key: it.key || `library/${String(it?.name || '')}`, 
          name: (it.key || '').split('/').pop() || 'file', 
          url: urls[it.key || ''] || '',
          blurhash: it.blurhash
        }));
        if (!aborted) setWorkspaceItems(out);
      } finally {
        if (!aborted) setWorkspaceLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, []);

  async function refreshWorkspaceList() {
    try {
      setWorkspaceLoading(true);
      const listRes = await fetch('/api/storage/list?path=' + encodeURIComponent('library'), { cache: 'no-store' });
      const obj = await listRes.json().catch(() => ({}));
      const arr: Array<{ type?: string; name?: string; key?: string; lastModified?: string; blurhash?: string }> = Array.isArray(obj?.items) ? obj.items : [];
      const files = arr.filter((it) => String(it?.type) === 'file');
      const imageFiles = files.filter((it) => {
        const s = String(it?.key || it?.name || '').toLowerCase();
        return /\.(png|jpe?g|webp|gif|avif|svg)$/.test(s);
      });
      // Sort by most recent first
      imageFiles.sort((a, b) => {
        const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return bTime - aTime;
      });
      const keys = imageFiles.map((it) => it.key || `library/${String(it?.name || '')}`);
      if (!keys.length) { setWorkspaceItems([]); return; }
      const urls = await getViewUrls(keys);
      const out = imageFiles.map((it) => ({ 
        key: it.key || `library/${String(it?.name || '')}`, 
        name: (it.key || '').split('/').pop() || 'file', 
        url: urls[it.key || ''] || '',
        blurhash: it.blurhash
      }));
      setWorkspaceItems(out);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  function toggleSelectKey(k: string) {
    setSelectedImageKeys((prev) => {
      const exists = prev.includes(k);
      if (exists) return prev.filter((x) => x !== k);
      if (prev.length >= requiredImages) return prev;
      return [...prev, k];
    });
  }

  function canonicalPlan(p?: string | null): "base" | "premium" | "ultra" | null {
    const s = (p || "").toLowerCase();
    if (s === "ultra" || s === "pro") return "ultra";
    if (s === "premium") return "premium";
    if (s === "base" || s === "basic" || s === "minimum") return "base";
    return null;
  }

  async function getCredits(): Promise<number> {
    try {
      const r = await fetch("/api/credits", { cache: "no-store" }).then((r) => r.json());
      const c = typeof r?.credits === "number" ? Number(r.credits) : 0;
      return Number.isFinite(c) ? c : 0;
    } catch {
      return 0;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json());
        const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? (profile.profile.vehicles as Vehicle[]) : [];
        const keys: string[] = (() => {
          const flat = vehicles.flatMap((v) =>
            Array.isArray((v as unknown as { photos?: string[] }).photos)
              ? ((v as unknown as { photos?: string[] }).photos as string[])
              : []
          );
          if (flat.length) return flat;
          return Array.isArray(profile?.profile?.carPhotos) ? (profile.profile.carPhotos as string[]) : [];
        })();
        if (!cancelled) {
          setProfileVehicles(vehicles);
          setVehiclePhotos(keys);
          const primary = keys.find(Boolean) || null;
          setSelectedVehicleKey(primary);
        }
        // Prefetch vehicle photo URLs in bulk (helper handles caching)
        try { await getViewUrls(keys); } catch {}
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onProfileUpdated() {
      (async () => {
        try {
          const profile = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json());
          const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? (profile.profile.vehicles as Vehicle[]) : [];
          const keys: string[] = (() => {
            const flat = vehicles.flatMap((v) =>
              Array.isArray((v as unknown as { photos?: string[] }).photos)
                ? ((v as unknown as { photos?: string[] }).photos as string[])
                : []
            );
            if (flat.length) return flat;
            return Array.isArray(profile?.profile?.carPhotos) ? (profile.profile.carPhotos as string[]) : [];
          })();
          setProfileVehicles(vehicles);
          setVehiclePhotos(keys);
          if (!keys.includes(selectedVehicleKey || "")) {
            setSelectedVehicleKey(keys.find(Boolean) || null);
          }
        } catch {}
      })();
    }
    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    return () => window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
  }, [selectedVehicleKey]);

  // Prefill defaults for color variables from template definitions (without overriding user input)
  useEffect(() => {
    try {
      const tokensInPrompt = new Set(String(template?.prompt || "").match(/\[([A-Z0-9_]+)\]/g)?.map((m) => m.replace(/^[\[]|[\]]$/g, "")) || []);
      const defs: TemplateVariable[] = Array.isArray(template?.variables) ? (template.variables as TemplateVariable[]) : [];
      if (!defs.length) return;
      const next: Record<string, string> = { ...varState };
      let changed = false;
      for (const d of defs) {
        const key = String(d?.key || "").trim();
        if (!key) continue;
        if (tokensInPrompt.size && !tokensInPrompt.has(key)) continue;
        const type = String(d?.type || "text");
        if (type === "color") {
          const def = typeof d?.defaultValue === "string" ? (d.defaultValue as string) : "";
          if (def && !next[key]) {
            next[key] = def;
            changed = true;
          }
        }
      }
      if (changed) setVarState(next);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, template?.slug]);

  useEffect(() => {
    const srcs: Array<"vehicle" | "user"> = Array.isArray(template?.allowedImageSources) ? (template.allowedImageSources as Array<"vehicle" | "user">) : ["vehicle", "user"];
    if (!srcs.includes("user") && (source === "upload" || source === "workspace")) {
      setSource(srcs.includes("vehicle") ? "vehicle" : "upload");
    } else if (!srcs.includes("vehicle") && source === "vehicle") {
      setSource("upload");
    } else if (srcs.includes("vehicle") && source !== "vehicle" && !srcs.includes("user")) {
      setSource("vehicle");
    }
  }, [template?.id, template?.slug, source, template?.allowedImageSources]);

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
    const suffix = priorSame > 0 ? `-${priorSame}` : "";
    return `${base}${suffix}`;
  }
  function findVehicleForSelected(): Vehicle | null {
    if (!selectedVehicleKey || !profileVehicles.length) return null;
    const idx = selectedVehicleKey.indexOf("/vehicles/");
    if (idx === -1) return null;
    const sub = selectedVehicleKey.slice(idx);
    const m = sub.match(/\/vehicles\/([^/]+)\//);
    const slug = m?.[1] || "";
    const slugs = profileVehicles.map((_, i) => uniqueSlugForIndex(profileVehicles, i));
    const at = slugs.findIndex((s) => s === slug);
    return at >= 0 ? profileVehicles[at] : null;
  }

  async function handleUploadFiles(files: File[]) {
    const arr = Array.isArray(files) ? files : (files as unknown as File[]);
    const images = arr.filter((f) => (f?.type || "").startsWith("image/"));
    if (!images.length) return;
    setUploading(true);
    try {
      const newKeys: string[] = [];
      const newPreviews: Record<string, string> = {};
          for (const file of images) {
            try {
              const form = new FormData();
              form.append("file", file);
              form.append("path", "library");
              const res = await fetch("/api/storage/upload", { method: "POST", body: form });
              const data = await res.json();
              const key: string | undefined = data?.key;
              if (key) {
                newKeys.push(key);
              }
            } catch {}
          }
          if (newKeys.length) {
            try {
              const map = await getViewUrls(newKeys);
              for (const k of newKeys) { const u = map[k]; if (u) newPreviews[k] = u; }
            } catch {}
          }
      if (newKeys.length) {
        setUploadedKeys((prev) => {
          const wasEmpty = !prev || prev.length === 0;
          const newSet = Array.from(new Set([...prev, ...newKeys]));
          
          // Track workspace upload
          try {
            window.dispatchEvent(new CustomEvent("workspace-upload", { 
              detail: { count: newKeys.length }
            }));
            // If this is first upload, track activation
            if (wasEmpty) {
              window.dispatchEvent(new CustomEvent("first-workspace-upload", { 
                detail: { count: newKeys.length }
              }));
            }
          } catch {}
          
          return newSet;
        });
        setUploadedPreviews((prev) => ({ ...prev, ...newPreviews }));
        if (!browseSelected) setBrowseSelected(newKeys[0] || null);
        // Auto-add up to remaining slots
        setSelectedImageKeys((prev)=>{
          const remaining = Math.max(0, requiredImages - prev.length);
          const toAdd = newKeys.slice(0, remaining);
          const merged = Array.from(new Set([...prev, ...toAdd]));
          return merged;
        });
      }
    } finally {
      setUploading(false);
    }
  }

  async function finalizeWithCroppedBlob(blob: Blob) {
    const sess = sessionRef.current;
    const fr = new FileReader();
    const dataUrl: string = await new Promise((resolve) => {
      fr.onloadend = () => resolve(String(fr.result || ""));
      fr.readAsDataURL(blob);
    });
    const variables: Record<string, string> = {};
    const v = findVehicleForSelected();
    if (v) {
      const brand = v.make || "";
      const model = v.model || "";
      const cf = (v as unknown as { colorFinish?: string })?.colorFinish ? String((v as unknown as { colorFinish?: string }).colorFinish) : "";
      const acc = (v as unknown as { accents?: string })?.accents ? String((v as unknown as { accents?: string }).accents) : "";
      const combo = acc ? `${cf} with ${acc}` : cf;
      if (brand) variables.BRAND = brand;
      if (model) variables.MODEL = model;
      if (cf) variables.COLOR_FINISH = cf;
      if (acc) variables.ACCENTS = acc;
      if (combo) variables.COLOR_FINISH_ACCENTS = combo;
    }
    if (source !== "vehicle") {
      const tokensInPrompt = new Set(String(template?.prompt || "").match(/\[([A-Z0-9_]+)\]/g)?.map((m) => m.replace(/^[\[]|[\]]$/g, "")) || []);
      const builtinNeeded = ["BRAND", "MODEL", "COLOR_FINISH", "ACCENTS"].filter((k) => tokensInPrompt.has(k));
      const missing: string[] = [];
      for (const key of builtinNeeded) {
        const val = varState[key] || "";
        if (val) variables[key] = val;
        else missing.push(key);
      }
      if (builtinNeeded.length && missing.length) {
        toast.error(`Please fill: ${missing.join(", ")}`);
        return;
      }
    }
    const varDefs = Array.isArray(template?.variables) ? (template?.variables as Array<Record<string, unknown>>) : [];
    for (const vDef of varDefs) {
      const key = String(vDef?.key || "").trim();
      if (!key) continue;
      const val = varState[key] || "";
      if (val) variables[key] = val;
    }
    const payload = { templateId: template?.id, templateSlug: template?.slug, userImageDataUrls: [dataUrl], variables } as Record<string, unknown>;
    const res = await fetch("/api/templates/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      toast.error(String((data as { error?: string }).error || "Generation failed"));
      return;
    }
    if (sess !== sessionRef.current) { return; }
    if ((data as { url?: string }).url) setResultUrl(String((data as { url?: string }).url));
    if ((data as { key?: string }).key) setResultKey(String((data as { key?: string }).key));
    if (data?.key) setResultKey(String(data.key));
    try { if (typeof (data as { key?: string })?.key === 'string') setDesignOpen(true); } catch {}
  }

  async function autoCropAndGenerateFromUrl(safeUrl: string, targetAspect: number) {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      try {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = safeUrl;
      } catch {
        resolve(null);
      }
    });
    if (!img) return;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return;
    const ar = w / h;
    let cropW = w,
      cropH = h,
      cropX = 0,
      cropY = 0;
    if (ar > targetAspect) {
      cropW = Math.round(h * targetAspect);
      cropH = h;
      cropX = Math.round((w - cropW) / 2);
      cropY = 0;
    } else if (ar < targetAspect) {
      cropW = w;
      cropH = Math.round(w / targetAspect);
      cropX = 0;
      cropY = Math.round((h - cropH) / 2);
    }
    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
    if (!blob) return;
    await finalizeWithCroppedBlob(blob);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function generate() {
    if (!template) return;
    const sess = sessionRef.current;
    setResultUrl(null);
    try {
      const bal = await getCredits();
      if (bal < 100) {
        toast.error("Not enough credits to generate. Top up in Billing.");
        return;
      }
      const selected = Array.from(new Set(selectedImageKeys));
      if (selected.length < requiredImages) { setRequiredShake(true); setTimeout(()=> setRequiredShake(false), 700); return; }
      const selectedFullKey = selected[0] || null;
      
      // Store the source vehicle key for use as backgroundKey in designer
      if (selectedFullKey) {
        setSourceVehicleKey(selectedFullKey);
      }
      
      const userImageKeys: string[] = selected.map((k)=>{
        const m = k.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : k.replace(/^users\//, "");
        return rel.replace(/^\/+/, "");
      });

      // Aspect ratio enforcement based on active template
      if (template?.fixedAspectRatio && typeof template?.aspectRatio === "number" && selectedFullKey) {
        try {
          const url: string | null = await getViewUrl(selectedFullKey);
          if (url) {
            const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
              try {
                const img = new Image();
                img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
                img.onerror = () => resolve(null);
                img.src = url;
              } catch {
                resolve(null);
              }
            });
            if (dims) {
              const ar = dims.w / dims.h;
              const tolerance = 0.05;
              const targetAR = Number(template.aspectRatio);
              if (Math.abs(ar / targetAR - 1) <= tolerance) {
                setBusy(true);
                try {
                  await autoCropAndGenerateFromUrl(`/api/storage/file?key=${encodeURIComponent(selectedFullKey)}`, targetAR);
                } finally {
                  setBusy(false);
                }
                return;
              } else {
                setPendingKeys([]);
                setCropUrl(`/api/storage/file?key=${encodeURIComponent(selectedFullKey)}`);
                setCropOpen(true);
                return; // wait for crop flow
              }
            }
          }
        } catch {}
      }

      const variables: Record<string, string> = {};
      const v = findVehicleForSelected();
      if (v) {
        const brand = v.make || "";
        const model = v.model || "";
        const cf = (v as unknown as { colorFinish?: string })?.colorFinish ? String((v as unknown as { colorFinish?: string }).colorFinish) : "";
        const acc = (v as unknown as { accents?: string })?.accents ? String((v as unknown as { accents?: string }).accents) : "";
        const combo = acc ? `${cf} with ${acc}` : cf;
        if (brand) variables.BRAND = brand;
        if (model) variables.MODEL = model;
        if (cf) variables.COLOR_FINISH = cf;
        if (acc) variables.ACCENTS = acc;
        if (combo) variables.COLOR_FINISH_ACCENTS = combo;
      }
      if (source !== "vehicle") {
        const tokensInPrompt = new Set(String(template?.prompt || "").match(/\[([A-Z0-9_]+)\]/g)?.map((m) => m.replace(/^[\[]|[\]]$/g, "")) || []);
        const builtinNeeded = ["BRAND", "MODEL", "COLOR_FINISH", "ACCENTS"].filter((k) => tokensInPrompt.has(k));
        const missing: string[] = [];
        for (const key of builtinNeeded) {
          const val = varState[key] || "";
          if (val) variables[key] = val;
          else missing.push(key);
        }
        if (builtinNeeded.length && missing.length) {
          toast.error(`Please fill: ${missing.join(", ")}`);
          return;
        }
      }
      const vars = Array.isArray(template?.variables) ? (template?.variables as Array<Record<string, unknown>>) : [];
      for (const vDef of vars) {
        const key = String(vDef?.key || "").trim();
        if (!key) continue;
        const val = varState[key] || "";
        if (val) variables[key] = val;
      }
      setBusy(true);
      const payload = { templateId: template?.id, templateSlug: template?.slug, userImageKeys, variables };
      const res = await fetch("/api/templates/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      let d: unknown = {};
      try {
        d = await res.json();
      } catch {
        d = {};
      }
      const data = d as Record<string, unknown>;
      if (!res.ok) {
        const errorMsg = String(data?.error || "Generation failed");
        toast.error(errorMsg);
        // Track generation failure
        try {
          window.dispatchEvent(new CustomEvent("template-generation-failed", { 
            detail: { templateId: template?.id, templateName: template?.name, error: errorMsg }
          }));
        } catch {}
        return;
      }
      if (sess !== sessionRef.current) { return; }
      if (typeof data?.url === "string") setResultUrl(String(data.url));
      if (typeof data?.key === "string") setResultKey(String(data.key));
      if (typeof data?.url === "string") setActiveUrl(String(data.url));
      if (typeof data?.key === "string") setActiveKey(String(data.key));
      try {
        if (typeof data?.key === "string") setDesignOpen(true);
      } catch {}
      setUpscales([]);
      
      // Track successful template generation
      try {
        window.dispatchEvent(new CustomEvent("template-generated", { 
          detail: { 
            templateId: template?.id, 
            templateName: template?.name, 
            source,
            // Add for breakdown analysis
            template_slug: template?.slug,
            image_source: source
          }
        }));
        // If this is the first result (no previous resultKey), it might be first generation
        if (!resultKey) {
          window.dispatchEvent(new CustomEvent("first-template-generated", { 
            detail: { 
              templateId: template?.id, 
              templateName: template?.name,
              template_slug: template?.slug
            }
          }));
        }
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  // Ensure Designer opens for any path that sets a result key
  useEffect(()=>{
    try { if (resultKey && !designOpen) setDesignOpen(true); } catch {}
  }, [resultKey, designOpen]);

  return (
    <div>
      {busy ? (
        <div className="p-6 sm:p-10 min-h-[12rem] grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-[14rem] h-[8rem] sm:w-[17.5rem] sm:h-[10.5rem]">
              <Lottie animationData={carLoadAnimation as object} loop style={{ width: "100%", height: "100%" }} />
            </div>
            <div className="text-sm text-white/80 text-center px-2">Generating… this may take a moment</div>
          </div>
        </div>
      ) : resultUrl ? (
        <div className="space-y-3">
          <div className="w-full grid place-items-center">
            {activeUrl || resultUrl ? (
              <NextImage src={(activeUrl || resultUrl)!} alt="result" width={1024} height={768} className="rounded w-auto max-w-full sm:max-w-[32rem] max-h-[56vh] h-auto object-contain" />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="w-full sm:w-auto" onClick={() => { setResultUrl(null); }}>Try again</Button>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
              <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70 flex-1 sm:flex-none min-w-[9rem]" onClick={() => setDesignOpen(true)}>Designer</Button>
              <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70 flex-1 sm:flex-none min-w-[12rem]" disabled={upscaleBusy || !resultKey} onClick={async () => {
                // Comment out plan check - all users now have upscale access
                // if (canonicalPlan(me?.plan) !== "ultra") {
                //   try { window.dispatchEvent(new CustomEvent("open-pro-upsell")); } catch {}
                //   return;
                // }
                if (!resultKey) return;
                // Check credits before attempting upscale
                const bal = await getCredits();
                const insufficientCredits = creditDepletion.checkAndTrigger(bal, 20);
                if (insufficientCredits) return;
                setUpscaleBusy(true);
                try {
                  let payloadObj: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: String(resultKey) };
                  try {
                    const url: string | null = await getViewUrl(String(resultKey));
                    if (url) {
                      const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
                        try {
                          const img = new window.Image();
                          img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
                          img.onerror = () => resolve(null);
                          img.src = url;
                        } catch {
                          resolve(null);
                        }
                      });
                      if (dims && dims.w > 0 && dims.h > 0) {
                        payloadObj = { r2_key: String(resultKey), original_width: dims.w, original_height: dims.h };
                      }
                    }
                  } catch {}
                  const res = await fetch("/api/tools/upscale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadObj) });
                  const data = await res.json().catch(() => ({}));
                  if (res.status === 402) {
                    toast.error("Not enough credits. Top up in Billing.");
                    return;
                  }
                  if (res.status === 400 && (data?.error === "UPSCALE_AT_MAX")) {
                    toast.error("Already at maximum resolution.");
                    return;
                  }
                  if (res.status === 400 && (data?.error === "UPSCALE_DIM_OVERFLOW")) {
                    toast.error("Upscale would exceed the 4K limit.");
                    return;
                  }
                  if (res.status === 400 && (data?.error === "ALREADY_UPSCALED")) {
                    toast.error("This image was already upscaled. Use the original.");
                    return;
                  }
                  if (!res.ok || !data?.url || !data?.key) {
                    toast.error(data?.error || "Upscale failed");
                    return;
                  }
                  const entry = { key: String(data.key), url: String(data.url) };
                  setUpscales((prev) => [...prev, entry]);
                  setActiveKey(entry.key);
                  setActiveUrl(entry.url);
                } finally {
                  setUpscaleBusy(false);
                }
              }}>{upscales.length ? "Upscale again" : `Upscale${canonicalPlan(me?.plan) !== "ultra" ? " 🔒" : ""}`}</Button>
              <Button className="flex-1 sm:flex-none min-w-[9rem]" onClick={async () => {
                try {
                  const r = await fetch((activeUrl || resultUrl)!, { cache: "no-store" });
                  const blob = await r.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `image-${Date.now()}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => {
                    try {
                      URL.revokeObjectURL(a.href);
                      document.body.removeChild(a);
                    } catch {}
                  }, 1000);
                } catch {}
              }}>Download</Button>
            </div>
          </div>
          {upscales.length ? (
            <div className="space-y-2">
              {upscales.map((u, idx) => (
                <div key={u.key} className="flex items-center gap-2">
                  <div className="text-xs text-white/70">Attempt {idx + 1}</div>
                  <Select defaultValue={`up-${idx}`} onValueChange={(v) => {
                    if (v === "orig") {
                      setActiveKey(resultKey);
                      setActiveUrl(resultUrl);
                    } else {
                      setActiveKey(u.key);
                      setActiveUrl(u.url);
                    }
                  }}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Choose image" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="orig">Original</SelectItem>
                      <SelectItem value={`up-${idx}`}>Upscale #{idx + 1}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="text-xs text-white/60">Designer will use the currently selected image. You can&apos;t upscale an image that was already upscaled. Upscaling is limited to 6MP.</div>
            </div>
          ) : null}
          <AppDialog open={designOpen} onOpenChange={setDesignOpen}>
            <AppDialogContent className="p-2 sm:p-6 sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-[54vw]">
            <AppDialogHeader>
              <AppDialogTitle className="flex items-center justify-between">
                <span>Designer</span>
                {!busy && !resultUrl ? (
                  <span className="hidden lg:inline mx-auto absolute left-1/2 -translate-x-1/2 text-xs text-white/70 max-w-[50%] text-center pointer-events-none">For best results, use a car photo that matches this template&apos;s orientation</span>
                ) : null}
              </AppDialogTitle>
            </AppDialogHeader>
              <div className="mt-2">
                <div className="mb-2">
                </div>
                {upscales.length ? (
                  <div className="space-y-2 mb-3">
                    {upscales.map((u, idx) => (
                      <div key={u.key} className="flex items-center gap-2">
                        <div className="text-xs text-white/70">Attempt {idx + 1}</div>
                        <Select defaultValue={`up-${idx}`} onValueChange={(v) => {
                          if (v === "orig") {
                            setActiveKey(resultKey);
                            setActiveUrl(resultUrl);
                          } else {
                            setActiveKey(u.key);
                            setActiveUrl(u.url);
                          }
                        }}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Choose image" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="orig">Original</SelectItem>
                            <SelectItem value={`up-${idx}`}>Upscale #{idx + 1}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                ) : null}
                {/* TODO: Re-enable save to library functionality by adding onSave prop */}
                <Designer
                  bgKey={String((activeKey || resultKey) || "")}
                  sourceImageKey={sourceVehicleKey}
                  rembg={{ enabled: true }}
                  closeOnDownload={false}
                  onClose={() => { setDesignOpen(false); setSelectedImageKeys([]); setSourceVehicleKey(null); }}
                  onTryAgain={() => { try { setDesignOpen(false); setResultUrl(null); setSourceVehicleKey(null); } catch {} }}
                  aspectRatio={typeof template?.aspectRatio === "number" ? Number(template.aspectRatio) : undefined}
                  onReplaceBgKey={(newKey, newUrl) => {
                    try {
                      if (newKey) {
                        setActiveKey(newKey);
                        if (newUrl) setActiveUrl(newUrl);
                      }
                    } catch {}
                  }}
                  showAnimate={false}
                  onAnimate={undefined}
                />
              </div>
            </AppDialogContent>
          </AppDialog>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {(() => {
              const tokensInPrompt = new Set(String(template?.prompt || "").match(/\[([A-Z0-9_]+)\]/g)?.map((m) => m.replace(/^[\[]|[\]]$/g, "")) || []);
              const builtin = new Set(["BRAND", "BRAND_CAPS", "MODEL", "COLOR_FINISH", "ACCENTS", "COLOR_FINISH_ACCENTS"]);
              const needBuiltins = source !== "vehicle" ? ["BRAND", "MODEL", "COLOR_FINISH", "ACCENTS"].filter((k) => tokensInPrompt.has(k)) : [];
              const customVarDefs = Array.isArray(template?.variables)
                ? (template!.variables as Array<{ key?: string; type?: string; label?: string; options?: string[] }>).filter(
                    (v) => tokensInPrompt.has(String(v?.key || "")) && !builtin.has(String(v?.key || ""))
                  )
                : [];
              if (!needBuiltins.length && !customVarDefs.length) return null;
              return (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Options</div>
                  <div className="space-y-2">
                    {needBuiltins.map((key) => (
                      <div key={key} className="space-y-1">
                        <div className="text-xs text-white/70">{key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                        <Input value={varState[key] || ""} onChange={(e) => setVarState((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={key} />
                      </div>
                    ))}
                    {customVarDefs.map((v) => {
                      const key = String(v?.key || "").trim();
                      if (!key) return null;
                      const type = String(v?.type || "text");
                      const label = String(v?.label || key);
                      if (type === "select" && Array.isArray(v?.options) && v.options.length) {
                        return (
                          <div key={key} className="space-y-1">
                            <div className="text-xs text-white/70">{label}</div>
                            <Select value={varState[key] || ""} onValueChange={(val) => setVarState((prev) => ({ ...prev, [key]: val }))}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {v.options.map((opt, i) => (
                                  <SelectItem key={`${key}-${i}`} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      if (type === "color") {
                        return (
                          <div key={key} className="space-y-1">
                            <div className="text-xs text-white/70">{label}</div>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={varState[key] || "#ffffff"}
                                onChange={(e) => setVarState((prev) => ({ ...prev, [key]: e.target.value }))}
                                className="h-9 w-12 rounded bg-transparent border border-[color:var(--border)]"
                              />
                              <Input className="w-36" value={varState[key] || "#ffffff"} onChange={(e) => setVarState((prev) => ({ ...prev, [key]: e.target.value }))} placeholder="#ffffff" />
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={key} className="space-y-1">
                          <div className="text-xs text-white/70">{label}</div>
                          <Input value={varState[key] || ""} onChange={(e) => setVarState((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={label} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Images</div>
                <motion.div animate={requiredShake ? { x: [0,-6,6,-4,4,0] } : { x: 0 }} transition={{ duration: 0.6 }} className={`text-xs ${requiredShake ? 'text-red-400' : 'text-white/60'}`}>
                  Images required: {requiredImages}
                </motion.div>
              </div>

              <div className="space-y-2">
                {profileVehicles.length ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-white/70">Vehicle</div>
                    <Select
                      value={(() => {
                        const v = findVehicleForSelected();
                        if (!v) return "";
                        const i = profileVehicles.indexOf(v);
                        return String(i);
                      })()}
                      onValueChange={(v) => {
                        const idx = parseInt(v);
                        const vobj = profileVehicles[idx];
                        if (!vobj) return;
                        const slug = uniqueSlugForIndex(profileVehicles, idx);
                        const first = vehiclePhotos.find((k) => (k || "").includes(`/vehicles/${slug}/`)) || null;
                        setSelectedVehicleKey(first);
                      }}
                    >
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder="Select vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {profileVehicles.map((v, i) => (
                          <SelectItem key={`${v.make}-${v.model}-${i}`} value={String(i)}>
                            {v.make} {v.model} ({v.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-white/70">
                    No vehicles found.
                    <Button size="sm" variant="secondary" onClick={() => { try { window.dispatchEvent(new CustomEvent("open-profile")); setTimeout(() => { try { window.dispatchEvent(new CustomEvent("highlight-vehicles")); } catch {} }, 300); } catch {} }}>Add vehicle</Button>
                  </div>
                )}
                <div className="overflow-visible sm:overflow-x-auto">
                  <div className="flex flex-wrap gap-3 pb-2">
                    {vehiclePhotos.length ? (
                      vehiclePhotos.map((k) => (
                        <button key={k} onClick={() => { setSelectedVehicleKey(k); toggleSelectKey(k); }} className="relative focus:outline-none shrink sm:shrink-0 w-36 sm:w-44 cursor-pointer">
                          <div className={`w-full rounded p-0.5 ${selectedImageKeys.includes(k) ? 'bg-primary' : 'bg-[color:var(--border)]'}`}>
                            <div className="rounded overflow-hidden relative aspect-square bg-black/20">
                              <VehicleImage keyStr={k} />
                              <span className={`absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded bg-black/60 hover:bg-black/70 transition-colors cursor-pointer ${selectedImageKeys.includes(k)?'text-green-400':'text-white'} p-1`}>
                                <motion.span animate={selectedImageKeys.includes(k) ? { scale: [0.7, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
                                  {selectedImageKeys.includes(k) ? (<SquareCheckBig className="w-4 h-4" />) : (<SquarePlus className="w-4 h-4" />)}
                                </motion.span>
                              </span>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-white/60">No vehicle photos found. Upload in profile.</div>
                    )}
                  </div>
                </div>
              </div>

              <Separator className="my-2" />
              <div className="text-xs text-white/70">Upload image</div>
              <div className="space-y-2">
                <DropZone accept="image/*" onDrop={handleUploadFiles} disabled={uploading} maxFiles={requiredImages}>
                  <div className="flex flex-col items-center gap-2 py-10">
                    <UploadIcon className="w-[1.25rem] h-[1.25rem] text-white/70" />
                    <div className="text-sm text-white/80">Drag and drop image(s)</div>
                    <div className="text-xs text-white/60">Select up to {requiredImages}</div>
                  </div>
                </DropZone>
                {uploading ? <div className="text-sm text-white/60">Uploading…</div> : null}
                {uploadedKeys.length ? (
                  <div className="space-y-2">
                    <div className="text-xs text-white/70">Uploaded this session</div>
                    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {uploadedKeys.map((k) => (
                        <ContextMenu key={k}>
                          <ContextMenuTrigger asChild>
                            <li className={`relative rounded-md overflow-hidden border ${selectedImageKeys.includes(k) ? 'ring-2 ring-primary' : 'border-[color:var(--border)]'}`}>
                              <button type="button" className="block w-full h-full cursor-pointer" onClick={() => toggleSelectKey(k)}>
                                <div className="bg-black/20">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={uploadedPreviews[k] || undefined} alt="Uploaded" className="w-full h-auto object-contain cursor-pointer" />
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label={selectedImageKeys.includes(k)?'Deselect':'Select'}
                                onClick={(e)=>{ e.stopPropagation(); toggleSelectKey(k); }}
                                disabled={!selectedImageKeys.includes(k) && selectedImageKeys.length >= requiredImages}
                                className={`absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded bg-black/60 ${(!selectedImageKeys.includes(k) && selectedImageKeys.length >= requiredImages) ? 'cursor-not-allowed text-white/50' : 'hover:bg-black/70 cursor-pointer'} transition-colors ${selectedImageKeys.includes(k)?'text-green-400':'text-white'} p-1`}
                              >
                                <motion.span animate={selectedImageKeys.includes(k) ? { scale: [0.7, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
                                  {selectedImageKeys.includes(k) ? (<SquareCheckBig className="w-4 h-4" />) : (<SquarePlus className="w-4 h-4" />)}
                                </motion.span>
                              </button>
                              <div className="absolute left-1 top-1 text-[0.7rem] px-1.5 py-0.5 rounded bg-black/60">{selectedImageKeys.includes(k) ? 'Selected' : 'Select'}</div>
                            </li>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48 z-[60]">
                            <ContextMenuItem onSelect={async()=>{
                              const ok = await confirmToast({ title: 'Delete image?', message: 'This will also delete any associated masks.' });
                              if (!ok) return;
                              try {
                                await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key: k, isFolder: false }) });
                                setUploadedKeys((prev)=> prev.filter((x)=> x!==k));
                                setUploadedPreviews((prev)=> { const next = { ...prev } as Record<string, string>; try { delete next[k]; } catch {} return next; });
                                setSelectedImageKeys((prev)=> prev.filter((x)=> x!==k));
                                if (browseSelected === k) setBrowseSelected(null);
                                toast.success('Deleted');
                              } catch {
                                toast.error('Delete failed');
                              }
                            }}>Delete</ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/70">Your library</div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={refreshWorkspaceList} disabled={workspaceLoading} aria-label="Refresh library">
                  <RotateCw className={`w-4 h-4 ${workspaceLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <div className="space-y-2">
                {workspaceLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i)=> (<Skeleton key={`wk-${i}`} className="w-full aspect-square" />))}
                  </div>
                ) : (
                  <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {workspaceItems.map((it)=> (
                      <ContextMenu key={it.key}>
                        <ContextMenuTrigger asChild>
                          <li className={`relative rounded-md overflow-hidden border ${selectedImageKeys.includes(it.key) ? 'ring-2 ring-primary' : 'border-[color:var(--border)]'}`}>
                            <button type="button" className="block w-full h-full cursor-pointer" onClick={()=> toggleSelectKey(it.key)}>
                              <div className="bg-black/20 aspect-square">
                                {it.blurhash ? (
                                  <BlurhashImage
                                    src={it.url}
                                    alt={it.name}
                                    width={400}
                                    height={400}
                                    className="w-full h-full object-contain cursor-pointer"
                                    blurhash={it.blurhash}
                                    showSkeleton={false}
                                  />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={it.url} alt={it.name} className="w-full h-full object-contain cursor-pointer" loading="lazy" />
                                )}
                              </div>
                            </button>
                            <button
                              type="button"
                              aria-label={selectedImageKeys.includes(it.key)?'Deselect':'Select'}
                              onClick={(e)=>{ e.stopPropagation(); toggleSelectKey(it.key); }}
                              disabled={!selectedImageKeys.includes(it.key) && selectedImageKeys.length >= requiredImages}
                              className={`absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded bg-black/60 ${(!selectedImageKeys.includes(it.key) && selectedImageKeys.length >= requiredImages) ? 'cursor-not-allowed text-white/50' : 'hover:bg-black/70 cursor-pointer'} transition-colors ${selectedImageKeys.includes(it.key)?'text-green-400':'text-white'} p-1`}
                            >
                              <motion.span animate={selectedImageKeys.includes(it.key) ? { scale: [0.7, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
                                {selectedImageKeys.includes(it.key) ? (<SquareCheckBig className="w-4 h-4" />) : (<SquarePlus className="w-4 h-4" />)}
                              </motion.span>
                            </button>
                          </li>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48 z-[60]">
                          <ContextMenuItem onSelect={async()=>{
                            const ok = await confirmToast({ title: 'Delete image?', message: 'This will also delete any associated masks.' });
                            if (!ok) return;
                            try {
                              await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key: it.key, isFolder: false }) });
                              setWorkspaceItems(prev=> prev.filter(x=> x.key !== it.key));
                              setSelectedImageKeys(prev=> prev.filter(x=> x !== it.key));
                              toast.success('Deleted');
                            } catch {
                              toast.error('Delete failed');
                            }
                          }}>Delete</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </ul>
                )}
              </div>
              <div className="text-xs text-white/60">Selected {selectedImageKeys.length}/{requiredImages}</div>
            </div>
          </div>
          <div className="mt-3" />
          <FixedAspectCropper
            open={cropOpen}
            imageUrl={cropUrl}
            aspectRatio={typeof (template as { aspectRatio?: number })?.aspectRatio === "number" ? Number((template as { aspectRatio?: number }).aspectRatio) : 1}
            title={`Crop image to match template`}
            onCancel={() => {
              setCropOpen(false);
              setCropUrl(null);
              setPendingKeys(null);
            }}
            onCropped={async (blob) => {
              setCropOpen(false);
              setBusy(true);
              try {
                const sess = sessionRef.current;
                const fr = new FileReader();
                const dataUrl: string = await new Promise((resolve) => {
                  fr.onloadend = () => resolve(String(fr.result || ""));
                  fr.readAsDataURL(blob);
                });
                const variables: Record<string, string> = {};
                const v = findVehicleForSelected();
                if (v) {
                  const brand = v.make || "";
                  const model = v.model || "";
                  const cf = (v as unknown as { colorFinish?: string })?.colorFinish ? String((v as unknown as { colorFinish?: string }).colorFinish) : "";
                  const acc = (v as unknown as { accents?: string })?.accents ? String((v as unknown as { accents?: string }).accents) : "";
                  const combo = acc ? `${cf} with ${acc}` : cf;
                  if (brand) variables.BRAND = brand;
                  if (model) variables.MODEL = model;
                  if (cf) variables.COLOR_FINISH = cf;
                  if (acc) variables.ACCENTS = acc;
                  if (combo) variables.COLOR_FINISH_ACCENTS = combo;
                }
                if (source !== "vehicle") {
                  const tokensInPrompt = new Set(String(template?.prompt || "").match(/\[([A-Z0-9_]+)\]/g)?.map((m) => m.replace(/^[\[]|[\]]$/g, "")) || []);
                  const builtinNeeded = ["BRAND", "MODEL", "COLOR_FINISH", "ACCENTS"].filter((k) => tokensInPrompt.has(k));
                  const missing: string[] = [];
                  for (const key of builtinNeeded) {
                    const val = varState[key] || "";
                    if (val) variables[key] = val;
                    else missing.push(key);
                  }
                  if (builtinNeeded.length && missing.length) {
                    toast.error(`Please fill: ${missing.join(", ")}`);
                    setBusy(false);
                    return;
                  }
                }
                const varDefs = Array.isArray(template?.variables) ? (template?.variables as Array<Record<string, unknown>>) : [];
                for (const vDef of varDefs) {
                  const key = String(vDef?.key || "").trim();
                  if (!key) continue;
                  const val = varState[key] || "";
                  if (val) variables[key] = val;
                }
                const payload = { templateId: template?.id, templateSlug: template?.slug, userImageKeys: pendingKeys || [], userImageDataUrls: [dataUrl], variables } as Record<string, unknown>;
                const res = await fetch("/api/templates/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                let data: Record<string, unknown> = {};
                try {
                  data = await res.json();
                } catch {
                  data = {};
                }
                if (!res.ok) {
                  toast.error(String((data as { error?: string }).error || "Generation failed"));
                  return;
                }
                if (sess !== sessionRef.current) { return; }
                if ((data as { url?: string }).url) setResultUrl(String((data as { url?: string }).url));
                if ((data as { key?: string }).key) setResultKey(String((data as { key?: string }).key));
                if (data?.key) setResultKey(String(data.key));
              } finally {
                setBusy(false);
                setPendingKeys(null);
                setCropUrl(null);
              }
            }}
          />
        </>
      )}
      <CreditDepletionDrawer
        open={creditDepletion.isOpen}
        onOpenChange={creditDepletion.close}
        currentPlan={creditDepletion.currentPlan}
        creditsRemaining={creditDepletion.creditsRemaining}
        requiredCredits={creditDepletion.requiredCredits}
      />
    </div>
  );
}

function VehicleImage({ keyStr }: { keyStr: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await getViewUrl(keyStr);
        if (!cancelled && u) setUrl(u);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [keyStr]);
  if (!url) return <Skeleton className="w-full aspect-square" />;
  return <NextImage src={url} alt="vehicle" width={300} height={300} className="block w-full aspect-square object-cover" sizes="(max-width: 640px) 6rem, 7rem" />;
}

export default UseTemplateContent;


