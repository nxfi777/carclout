"use client";
import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { R2FileTree } from "@/components/ui/file-tree";
import FixedAspectCropper from "@/components/ui/fixed-aspect-cropper";
import TextBehindEditor from "@/components/templates/text-behind-editor";
import { Dialog as AppDialog, DialogContent as AppDialogContent, DialogHeader as AppDialogHeader, DialogTitle as AppDialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DropZone } from "@/components/ui/drop-zone";
import { UploadIcon } from "lucide-react";
import type { Vehicle } from "@/components/vehicles-editor";
import carLoadAnimation from "@/public/carload.json";

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
  autoOpenDesigner?: boolean;
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
  const [_browsePath, setBrowsePath] = useState<string>("");
  const [browseSelected, setBrowseSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
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
      setCropUrl(null);
      setPendingKeys(null);
      setVarState({});
      setBusy(false);
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
          form.append("path", "uploads");
          const res = await fetch("/api/storage/upload", { method: "POST", body: form });
          const data = await res.json();
          const key: string | undefined = data?.key;
          if (key) {
            newKeys.push(key);
            try {
              const vres = await fetch("/api/storage/view", { method: "POST", body: JSON.stringify({ key }) });
              const vdata = await vres.json();
              if (typeof vdata?.url === "string") newPreviews[key] = vdata.url as string;
            } catch {}
          }
        } catch {}
      }
      if (newKeys.length) {
        setUploadedKeys((prev) => Array.from(new Set([...
          prev,
          ...newKeys
        ])));
        setUploadedPreviews((prev) => ({ ...prev, ...newPreviews }));
        if (!browseSelected) setBrowseSelected(newKeys[0] || null);
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

  async function generate() {
    if (!template) return;
    const sess = sessionRef.current;
    setResultUrl(null);
    try {
      const bal = await getCredits();
      if (bal < 6) {
        toast.error("Not enough credits to generate. Top up in Billing.");
        return;
      }
      const userImageKeys: string[] = [];
      let selectedFullKey: string | null = null;
      if (source === "vehicle") {
        if (!selectedVehicleKey) {
          toast.error("Select a vehicle image");
          return;
        }
        const m = selectedVehicleKey.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : selectedVehicleKey.replace(/^users\//, "");
        userImageKeys.push(rel.replace(/^\/+/, ""));
        selectedFullKey = selectedVehicleKey;
      } else if (source === "workspace") {
        if (!browseSelected) {
          toast.error("Select a workspace image");
          return;
        }
        const m = browseSelected.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : browseSelected.replace(/^users\//, "");
        userImageKeys.push(rel.replace(/^\/+/, ""));
        selectedFullKey = browseSelected;
      } else if (source === "upload") {
        if (!browseSelected) {
          toast.error("Upload an image");
          return;
        }
        const m = browseSelected.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : browseSelected.replace(/^users\//, "");
        userImageKeys.push(rel.replace(/^\/+/, ""));
        selectedFullKey = browseSelected;
      }

      // Aspect ratio enforcement based on active template
      if (template?.fixedAspectRatio && typeof template?.aspectRatio === "number" && selectedFullKey) {
        try {
          const res = await fetch("/api/storage/view", { method: "POST", body: JSON.stringify({ key: selectedFullKey }) }).then((r) => r.json());
          const url: string | null = res?.url || null;
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
        toast.error(String(data?.error || "Generation failed"));
        return;
      }
      if (sess !== sessionRef.current) { return; }
      if (typeof data?.url === "string") setResultUrl(String(data.url));
      if (typeof data?.key === "string") setResultKey(String(data.key));
      if (typeof data?.url === "string") setActiveUrl(String(data.url));
      if (typeof data?.key === "string") setActiveKey(String(data.key));
      try {
        if (template && template.autoOpenDesigner && typeof data?.key === "string") setDesignOpen(true);
      } catch {}
      setUpscales([]);
    } finally {
      setBusy(false);
    }
  }

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
            <div className="text-xs text-white/70 mb-1">
              Image auto-saved to <a href="/dashboard?view=forge&tab=workspace&path=generations" target="_blank" rel="noreferrer" className="font-mono text-white/90 underline hover:text-white">/generations</a>
            </div>
            {activeUrl || resultUrl ? (
              <NextImage src={(activeUrl || resultUrl)!} alt="result" width={1024} height={768} className="rounded w-auto max-w-full sm:max-w-[32rem] max-h-[56vh] h-auto object-contain" unoptimized />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="w-full sm:w-auto" onClick={() => { setResultUrl(null); }}>Try again</Button>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
              <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70 flex-1 sm:flex-none min-w-[9rem]" onClick={() => setDesignOpen(true)}>Designer</Button>
              <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70 flex-1 sm:flex-none min-w-[12rem]" disabled={upscaleBusy || !resultKey} onClick={async () => {
                if (canonicalPlan(me?.plan) !== "ultra") {
                  try { window.dispatchEvent(new CustomEvent("open-pro-upsell")); } catch {}
                  return;
                }
                if (!resultKey) return;
                setUpscaleBusy(true);
                try {
                  let payloadObj: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: String(resultKey) };
                  try {
                    const v = await fetch("/api/storage/view", { method: "POST", body: JSON.stringify({ key: resultKey }) }).then((r) => r.json()).catch(() => ({}));
                    const url: string | null = v?.url || null;
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
                  if (res.status === 400 && (data?.error === "UPSCALE_LIMIT_6MP")) {
                    toast.error("Upscale exceeds the 6MP limit. Try a smaller image.");
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
              }}>{upscales.length ? "Upscale again" : `Upscale (up to 6MP)${canonicalPlan(me?.plan) !== "ultra" ? " 🔒" : ""}`}</Button>
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
            <AppDialogContent className="sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-[54vw]">
              <AppDialogHeader>
                <AppDialogTitle>Designer</AppDialogTitle>
              </AppDialogHeader>
              <div className="mt-2">
                <TextBehindEditor
                  bgKey={String((activeKey || resultKey) || "")}
                  rembg={{ enabled: true }}
                  defaultHeadline={(findVehicleForSelected()?.make || "").toUpperCase()}
                  onClose={() => setDesignOpen(false)}
                  onSave={async (blob) => {
                    try {
                      const filename = `design-${Date.now()}.png`;
                      const file = new File([blob], filename, { type: "image/png" });
                      const form = new FormData();
                      form.append("file", file, filename);
                      form.append("path", "generations");
                      const res = await fetch("/api/storage/upload", { method: "POST", body: form });
                      if (!res.ok) {
                        try {
                          const d = await res.json();
                          toast.error(d?.error || "Failed to save");
                        } catch {
                          toast.error("Failed to save");
                        }
                        return;
                      }
                      try { toast.success("Saved to /generations"); } catch {}
                      setDesignOpen(false);
                    } catch {}
                  }}
                  saveLabel={"Save to workspace"}
                  aspectRatio={typeof template?.aspectRatio === "number" ? Number(template.aspectRatio) : undefined}
                  onReplaceBgKey={(newKey, newUrl) => {
                    try {
                      if (newKey) {
                        setActiveKey(newKey);
                        if (newUrl) setActiveUrl(newUrl);
                      }
                    } catch {}
                  }}
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
              <div className="text-sm font-medium">Source</div>
              <Select value={source} onValueChange={(v: "vehicle" | "upload" | "workspace") => setSource(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(template?.allowedImageSources) ? (template as { allowedImageSources?: Array<"vehicle" | "user"> }).allowedImageSources! : ["vehicle", "user"]).includes("vehicle") ? (
                    <SelectItem value="vehicle">Your vehicles</SelectItem>
                  ) : null}
                  {(Array.isArray(template?.allowedImageSources) ? (template as { allowedImageSources?: Array<"vehicle" | "user"> }).allowedImageSources! : ["vehicle", "user"]).includes("user") ? (
                    <>
                      <SelectItem value="upload">Upload image</SelectItem>
                      <SelectItem value="workspace">Browse workspace</SelectItem>
                    </>
                  ) : null}
                </SelectContent>
              </Select>

              {source === "vehicle" ? (
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
                          <button key={k} onClick={() => setSelectedVehicleKey(k)} className="relative focus:outline-none shrink sm:shrink-0 w-24 sm:w-28">
                            <div className={`w-full rounded p-0.5 ${selectedVehicleKey === k ? "bg-primary" : "bg-[color:var(--border)]"}`}>
                              <div className="rounded overflow-hidden"><VehicleImage keyStr={k} /></div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="text-sm text-white/60">No vehicle photos found. Upload in profile.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : source === "upload" ? (
                <div className="space-y-2">
                  <DropZone accept="image/*" onDrop={handleUploadFiles} disabled={uploading}>
                    <div className="flex flex-col items-center gap-2 py-10">
                      <UploadIcon className="w-[1.25rem] h-[1.25rem] text-white/70" />
                      <div className="text-sm text-white/80">Drag and drop an image</div>
                      <div className="text-xs text-white/60">or click to browse</div>
                    </div>
                  </DropZone>
                  {uploading ? <div className="text-sm text-white/60">Uploading…</div> : null}
                  {uploadedKeys.length ? (
                    <div className="space-y-2">
                      <div className="text-xs text-white/70">Uploaded this session</div>
                      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {uploadedKeys.map((k) => (
                          <li key={k} className={`relative rounded-md overflow-hidden border ${browseSelected === k ? 'ring-2 ring-primary' : 'border-[color:var(--border)]'}`}>
                            <button type="button" className="block w-full h-full" onClick={() => setBrowseSelected(k)}>
                              <div className="aspect-square bg-black/20">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={uploadedPreviews[k] || ''} alt="Uploaded" className="w-full h-full object-cover" />
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {browseSelected && !uploadedKeys.includes(browseSelected) ? (
                    <div className="text-xs text-white/60">Selected: {browseSelected}</div>
                  ) : null}
                </div>
              ) : (
                <div className="h-[300px] border border-[color:var(--border)] rounded p-2 overflow-hidden">
                  <R2FileTree onNavigate={(p) => setBrowsePath(p)} onFileSelect={(k) => setBrowseSelected(k)} scope={"user"} selectedKeys={browseSelected ? [browseSelected] : []} />
                </div>
              )}
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={generate} disabled={busy} className="w-full justify-center">
              Generate
            </Button>
          </div>
          <FixedAspectCropper
            open={cropOpen}
            imageUrl={cropUrl}
            aspectRatio={typeof (template as { aspectRatio?: number })?.aspectRatio === "number" ? Number((template as { aspectRatio?: number }).aspectRatio) : 1}
            title={`Crop image to match aspect ratio`}
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
    </div>
  );
}

function VehicleImage({ keyStr }: { keyStr: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storage/view", { method: "POST", body: JSON.stringify({ key: keyStr }) }).then((r) => r.json());
        if (!cancelled && res?.url) setUrl(res.url);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [keyStr]);
  if (!url) return <Skeleton className="w-full aspect-square" />;
  return <NextImage src={url} alt="vehicle" width={300} height={300} className="block w-full aspect-square object-cover" unoptimized />;
}

export default UseTemplateContent;


