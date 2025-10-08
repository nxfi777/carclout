"use client";
import { useEffect, useRef, useState, useCallback, useMemo, Fragment } from "react";
import Image from "next/image";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { R2FileTree } from "@/components/ui/file-tree";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import FolderIconFancy from "@/components/ui/folder";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import SparkMD5 from "spark-md5";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { confirmToast, promptToast } from "@/components/ui/toast-helpers";
import Designer from "@/components/layer-editor/designer";
import { SHOW_MANAGED_FOLDERS, isManagedRoot, isManagedPath as isManagedPathUtil } from "@/lib/workspace-visibility";
import { ChevronLeft, List as ListIcon, LayoutGrid, MoreHorizontal, RefreshCcw, Download } from "lucide-react";
import dynamic from "next/dynamic";
import carLoadAnimation from "@/public/carload.json";
import { getViewUrl, getViewUrls } from "@/lib/view-url-client";
import ElectricBorder from "@/components/electric-border";
import CreditDepletionDrawer from "@/components/credit-depletion-drawer";
import { useCreditDepletion } from "@/lib/use-credit-depletion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type Item = { type: "folder" | "file"; name: string; key?: string; size?: number; lastModified?: string; blurhash?: string; width?: number; height?: number };
type ItemWithTag = Item & { etag?: string; isUpscaling?: boolean };

// Simple in-memory + session cache for workspace items, keyed by scope:path
const ITEMS_TTL_MS = 60_000; // UI hint only; we still revalidate in background
const SESSION_PREFIX = "carclout:workspace:list:";
type WorkspaceCacheEntry = { items: ItemWithTag[]; timestamp: number; etag?: string };
const workspaceItemsCache = new Map<string, WorkspaceCacheEntry>();

function readSessionCache(key: string): WorkspaceCacheEntry | null {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_PREFIX + key) : null;
    if (!raw) return null;
    const obj = JSON.parse(raw) as WorkspaceCacheEntry;
    if (!obj || !Array.isArray(obj.items)) return null;
    return obj;
  } catch { return null; }
}
function writeSessionCache(key: string, entry: WorkspaceCacheEntry) {
  try { if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry)); } catch {}
}

export function DashboardWorkspacePanel({ scope }: { scope?: 'user' | 'admin' } = {}) {
  const searchParams = useSearchParams();
  const [_me, setMe] = useState<{ plan?: string | null } | null>(null);
  const [path, setPath] = useState<string>(() => {
    try {
      if (typeof window === 'undefined') return scope === 'admin' ? '' : 'library';
      const qp = new URLSearchParams(window.location.search).get('path') || '';
      const cleaned = qp.replace(/^\/+|\/+$/g, "");
      return cleaned || (scope === 'admin' ? '' : 'library');
    } catch { return scope === 'admin' ? '' : 'library'; }
  });
  const [items, setItems] = useState<ItemWithTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [viewUrls, setViewUrls] = useState<Record<string, string>>({});
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "size" | "modified">("modified");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [preview, setPreview] = useState<{ url: string; name: string; key?: string } | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [view, setView] = useState<"list" | "icons">("icons");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [replaceAll, setReplaceAll] = useState<null | boolean>(null);
  const pendingFilesRef = useRef<File[] | null>(null);
  const [conflictName, setConflictName] = useState<string>("");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isHooksAdminPath = scope === 'admin' && (!!path && (path === 'hooks' || path.startsWith('hooks')));
  const isLearnTutorialsAdminPath = false;
  const isLearnEbooksAdminPath = false;
  const selectingRef = useRef(false);
  const [_selecting, setSelecting] = useState(false);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const initialSelectedRef = useRef<Set<string>>(new Set());
  const additiveRef = useRef(false);
  const dragThresholdRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadUnitsDone, setUploadUnitsDone] = useState(0);
  const [uploadUnitsTotal, setUploadUnitsTotal] = useState(0);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadCurrentName, setUploadCurrentName] = useState<string | null>(null);
  const activeXHRRef = useRef<XMLHttpRequest | null>(null);
  const cancelRequestedRef = useRef(false);
  const [_uploadFilesDone, setUploadFilesDone] = useState(0);
  const [_uploadFilesTotal, setUploadFilesTotal] = useState(0);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [usage, setUsage] = useState<{ usedBytes: number; limitBytes: number | null; percentUsed: number | null } | null>(null);
  const [designOpen, setDesignOpen] = useState(false);
  const [designKey, setDesignKey] = useState<string | null>(null);
  const [designProjectState, setDesignProjectState] = useState<import("@/lib/layer-export").DesignerProjectState | null>(null);
  const [upscaleBusy, setUpscaleBusy] = useState(false);
  const [videoUpscaleBusy, setVideoUpscaleBusy] = useState(false);
  const [_videoInterpolateBusy, _setVideoInterpolateBusy] = useState(false);
  const [previewVariants, setPreviewVariants] = useState<{ key?: string; name: string; url: string }[]>([]);
  const [activePreviewVariantIndex, setActivePreviewVariantIndex] = useState(0);
  const isManagedRootName = useMemo(() => (name: string) => isManagedRoot(name), []);
  const isManagedPath = useMemo(() => isManagedPathUtil(path || ''), [path]);
  const [_maskHint, setMaskHint] = useState<Record<string, 'exists' | 'missing' | 'checking' | 'unknown'>>({});
  const [blurhashBackfillProcessed, setBlurhashBackfillProcessed] = useState(new Set<string>());
  const creditDepletion = useCreditDepletion();
  const [videoTemplates, setVideoTemplates] = useState<Set<string>>(new Set());
  const [profileVehicles, setProfileVehicles] = useState<Array<{ make?: string; model?: string; colorFinish?: string; accents?: string; type?: string }>>([]);
  const [activeUpscaleOps, setActiveUpscaleOps] = useState<Set<string>>(new Set()); // Track which videos are being upscaled

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetch('/api/me', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
        if (!cancelled) setMe({ plan: m?.plan ?? null });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch templates with video enabled
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/templates?limit=200', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        const templates = Array.isArray(data?.templates) ? data.templates : [];
        const videoSlugs = new Set<string>();
        for (const t of templates) {
          if (t?.video?.enabled && t?.slug) {
            videoSlugs.add(String(t.slug).toLowerCase());
          }
        }
        if (!cancelled) setVideoTemplates(videoSlugs);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch profile vehicles for token replacement in video prompts
  useEffect(() => {
    let cancelled = false;
    const fetchVehicles = async () => {
      try {
        const profile = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json());
        const vehicles: Array<{ make?: string; model?: string; colorFinish?: string; accents?: string; type?: string }> = Array.isArray(profile?.profile?.vehicles) ? profile.profile.vehicles : [];
        if (!cancelled) setProfileVehicles(vehicles);
      } catch {}
    };
    fetchVehicles();
    
    // Re-fetch when profile is updated
    const onProfileUpdated = () => { fetchVehicles(); };
    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    
    return () => { 
      cancelled = true;
      window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
    };
  }, []);

  // function canonicalPlan(p?: string | null): 'base' | 'premium' | 'ultra' | null {
  //   const s = (p || '').toLowerCase();
  //   if (s === 'ultra' || s === 'pro') return 'ultra';
  //   if (s === 'premium') return 'premium';
  //   if (s === 'base' || s === 'basic' || s === 'minimum') return 'base';
  //   return null;
  // }

  async function getCredits(): Promise<number> {
    try {
      const r = await fetch('/api/credits', { cache: 'no-store' }).then(r=>r.json());
      const c = typeof r?.credits === 'number' ? Number(r.credits) : 0;
      return Number.isFinite(c) ? c : 0;
    } catch { return 0; }
  }

  async function doUpscale(key: string) {
    setUpscaleBusy(true);
    try {
      let payload: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: key };
      try {
        const url: string | null = await getViewUrl(key, scope);
        if (url) {
          const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img=new window.Image(); img.onload=()=> resolve({ w: img.naturalWidth||img.width, h: img.naturalHeight||img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
          // Hide/do not attempt if already at or beyond 4K
          if (dims && ((dims.w >= 3840) || (dims.h >= 2160))) { toast.error('Already at maximum resolution.'); return; }
          if (dims && dims.w>0 && dims.h>0) { payload = { r2_key: key, original_width: dims.w, original_height: dims.h }; }
        }
      } catch {}
      const res = await fetch('/api/tools/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(()=>({}));
      if (res.status === 402) { toast.error('Not enough credits. Top up in Billing.'); return; }
      if (res.status === 400 && (data?.error === 'UPSCALE_AT_MAX')) { toast.error('Already at maximum resolution.'); return; }
      if (res.status === 400 && (data?.error === 'UPSCALE_DIM_OVERFLOW')) { toast.error('Upscale would exceed the 4K limit.'); return; }
      if (res.status === 400 && (data?.error === 'ALREADY_UPSCALED')) { toast.error('This image was already upscaled. Use the original.'); return; }
      if (!res.ok || !data?.key) { toast.error(data?.error || 'Upscale failed'); return; }
      await refresh(undefined, { force: true });
      setTreeVersion(v=>v+1);
    } catch {} finally { setUpscaleBusy(false); }
  }

  async function doVideoUpscale(key: string) {
    setVideoUpscaleBusy(true);
    
    // Add this key to active operations to show the temporary placeholder
    setActiveUpscaleOps(prev => new Set(prev).add(key));
    
    try {
      const res = await fetch('/api/tools/video-upscale', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ r2_key: key }) 
      });
      const data = await res.json().catch(() => ({}));
      
      if (res.status === 402) { toast.error('Not enough credits. Top up in Billing.'); return; }
      if (res.status === 403) { toast.error('Video upscaling is only available on the Ultra plan.'); return; }
      if (!res.ok || !data?.key) { toast.error(data?.error || 'Video upscale failed'); return; }
      
      await refresh(undefined, { force: true });
      setTreeVersion(v => v + 1);
    } catch (e) {
      console.error('Video upscale error:', e);
      toast.error('Video upscale failed');
    } finally { 
      // Remove from active operations
      setActiveUpscaleOps(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setVideoUpscaleBusy(false); 
    }
  }

  // TEMPORARILY DISABLED - Make Smoother Feature
  // async function doVideoInterpolate(key: string) {
  //   setVideoInterpolateBusy(true);
  //   try {
  //     const res = await fetch('/api/tools/video-interpolate', { 
  //       method: 'POST', 
  //       headers: { 'Content-Type': 'application/json' }, 
  //       body: JSON.stringify({ r2_key: key }) 
  //     });
  //     const data = await res.json().catch(() => ({}));
  //     
  //     if (res.status === 402) { toast.error('Not enough credits. Top up in Billing.'); return; }
  //     if (res.status === 403) { toast.error('60fps smoothing is only available on the Ultra plan.'); return; }
  //     if (res.status === 400 && data?.code === 'UPSCALE_REQUIRED') {
  //       toast.error('Please upscale the video first, then make it smoother.');
  //       return;
  //     }
  //     if (!res.ok || !data?.key) { toast.error(data?.error || 'Video smoothing failed'); return; }
  //     
  //     await refresh(undefined, { force: true });
  //     setTreeVersion(v => v + 1);
  //   } catch (e) {
  //     console.error('Video interpolate error:', e);
  //     toast.error('Video smoothing failed');
  //   } finally { 
  //     setVideoInterpolateBusy(false); 
  //   }
  // }

  const refresh = useCallback(async (p = path, options?: { force?: boolean }) => {
    const key = p;
    const cacheKey = `${scope === 'admin' ? 'admin' : 'user'}:${key}`;
    const now = Date.now();
    let cached = workspaceItemsCache.get(cacheKey);
    if (!cached) {
      const fromSession = readSessionCache(cacheKey);
      if (fromSession) {
        cached = fromSession;
        workspaceItemsCache.set(cacheKey, fromSession);
      }
    }
    const isFresh = !!cached && now - cached.timestamp < ITEMS_TTL_MS;

    if (cached) {
      setItems(Array.isArray(cached.items) ? cached.items : []);
    }

    const shouldUseSkeleton = !cached;
    const shouldShowRefreshing = !!options?.force || !cached || !isFresh;
    const shouldFetch = !!options?.force || !cached || !isFresh;

    setLoading(shouldUseSkeleton);
    setRefreshing(!shouldUseSkeleton && shouldShowRefreshing);

    if (!shouldFetch) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const scopeParam = scope === 'admin' ? `&scope=admin` : '';
      const headers: Record<string, string> = {};
      if (cached?.etag) headers["If-None-Match"] = cached.etag.startsWith('W/') ? cached.etag : `W/"${cached.etag.replace(/\"/g, '"').replace(/"/g, '')}"`;
      const res = await fetch(`/api/storage/list?path=${encodeURIComponent(key)}${scopeParam}`, { cache: "no-store", headers });
      if (res.status === 304) {
        const et = res.headers.get('etag') || cached?.etag;
        const entry: WorkspaceCacheEntry = { items: cached?.items || [], timestamp: Date.now(), etag: et || undefined };
        workspaceItemsCache.set(cacheKey, entry);
        writeSessionCache(cacheKey, entry);
        // Keep displayed items as-is
      } else {
        let r: { items?: ItemWithTag[]; etag?: string } = { items: [] };
        try { r = await res.json() as { items?: ItemWithTag[]; etag?: string }; } catch { r = { items: [] }; }
        const nextItems: ItemWithTag[] = Array.isArray(r.items) ? r.items as ItemWithTag[] : [];
        const et = res.headers.get('etag') || r.etag;
        const entry: WorkspaceCacheEntry = { items: nextItems, timestamp: Date.now(), etag: et || undefined };
        workspaceItemsCache.set(cacheKey, entry);
        writeSessionCache(cacheKey, entry);
        setItems(nextItems);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [path, scope]);

  useEffect(() => { refresh(path); }, [path, refresh]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scopeParam = scope === 'admin' ? `?scope=admin` : '';
        const r = await fetch(`/api/storage/usage${scopeParam}`, { cache: 'no-store' }).then(resp => resp.json()).catch(() => null);
        if (!cancelled && r && typeof r.usedBytes === 'number') {
          setUsage({ usedBytes: r.usedBytes, limitBytes: r.limitBytes ?? null, percentUsed: r.percentUsed ?? null });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [scope, treeVersion]);
  useEffect(() => { setSelectedKeys(new Set()); }, [path]);

  // Load project state when designKey is set
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!designKey || !designOpen) {
        setDesignProjectState(null);
        return;
      }
      
      // Try to find and load the corresponding project state from managed folder
      try {
        // Use SHA1 hash of the designKey to find the project state
        const { default: SparkMD5 } = await import('spark-md5');
        const hash = SparkMD5.hash(designKey);
        const root = scope === 'admin' ? 'admin' : `users/${designKey.split('/')[1]}`; // Extract user from key
        const projectKey = `${root}/designer_states/${hash}.json`;
        
        console.log('[workspace] Looking for project state:', {
          designKey,
          hash,
          projectKey
        });
        
        const scopeParam = scope === 'admin' ? '&scope=admin' : '';
        const res = await fetch(`/api/storage/file?key=${encodeURIComponent(projectKey)}${scopeParam}`, { cache: 'no-store' });
        
        if (res.ok) {
          const json = await res.text();
          const { importDesignerState } = await import('@/lib/layer-export');
          const projectState = importDesignerState(json);
          if (!cancelled && projectState) {
            console.log('[workspace] Loaded project state:', projectState);
            setDesignProjectState(projectState);
          } else {
            if (!cancelled) {
              console.log('[workspace] Failed to parse project state');
              setDesignProjectState(null);
            }
          }
        } else {
          // No project file found - that's ok, just start fresh
          console.log('[workspace] No project state found (status:', res.status, ')');
          if (!cancelled) setDesignProjectState(null);
        }
      } catch (err) {
        console.warn('[workspace] Failed to load project state:', err);
        if (!cancelled) setDesignProjectState(null);
      }
    })();
    return () => { cancelled = true; };
  }, [designKey, designOpen, scope]);

  // When preview opens (or tree changes), discover upscaled variants saved to /library and prepare a dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!preview) { setPreviewVariants([]); setActivePreviewVariantIndex(0); return; }
        const base = String(preview.name || '').replace(/\.[^.]+$/, '');
        const variants: { key?: string; name: string; url: string }[] = [{ key: preview.key, name: 'Original', url: preview.url }];
        // Search in user's library for upscaled files derived from this base
        const scopeParam = scope === 'admin' ? `&scope=admin` : '';
        const listRes = await fetch(`/api/storage/list?path=${encodeURIComponent('library')}${scopeParam}`, { cache: 'no-store' });
        const listData = await listRes.json().catch(() => ({}));
        const libItems: { type?: string; name?: string; key?: string }[] = Array.isArray(listData?.items) ? listData.items : [];
        const matches = libItems.filter((it) => {
          const n = String(it?.name || '');
          return String(it?.type) === 'file' && n.includes(`-${base}-upscaled-`);
        });
        if (matches.length) {
          const keys = matches.map((it) => it.key || `library/${String(it.name)}`);
          const vb = await fetch('/api/storage/view-bulk', { method: 'POST', body: JSON.stringify({ keys, scope }) });
          const vdata = await vb.json().catch(() => ({}));
          const urls: Record<string, string> = (vdata?.urls as Record<string, string>) || {};
          for (const it of matches) {
            const k = it.key || `library/${String(it.name)}`;
            const url = urls[k];
            if (!url) continue;
            let label = 'Upscaled';
            try {
              const m = String(it.name).match(/-upscaled-(\d+)x/i);
              if (m && m[1]) label = `Upscaled ${m[1]}x`;
            } catch {}
            variants.push({ key: k, name: label, url });
          }
        }
        if (!cancelled) { setPreviewVariants(variants); setActivePreviewVariantIndex(0); }
      } catch {
        if (!cancelled) { setPreviewVariants(preview ? [{ key: preview.key, name: 'Original', url: preview.url }] : []); setActivePreviewVariantIndex(0); }
      }
    })();
    return () => { cancelled = true; };
  }, [preview, scope, treeVersion]);

  // Read initial folder from query param (?path=library) when present
  useEffect(() => {
    try {
      const qp = searchParams?.get('path') || '';
      if (!qp) { if (!path && scope !== 'admin') setPath('library'); return; }
      const clean = qp.replace(/^\/+|\/+$/g, "");
      if (clean && clean !== path) setPath(clean);
    } catch {}
  }, [searchParams, path, scope]);

  // Auto-open preview from query param (?preview=key)
  useEffect(() => {
    const previewKey = searchParams?.get('preview');
    if (!previewKey || preview?.key === previewKey) return;
    
    (async () => {
      try {
        const url = await getViewUrl(previewKey, scope);
        if (url) {
          const name = previewKey.split('/').pop() || 'image';
          setPreview({ url, name, key: previewKey });
          // Clean up the URL by removing the preview param
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('preview');
          window.history.replaceState({}, '', newUrl.toString());
        }
      } catch (err) {
        console.warn('[workspace] Failed to auto-open preview:', err);
      }
    })();
  }, [searchParams, scope, preview?.key]);

  const itemStorageKey = useCallback((it: Item) => (
    it.key || `${path ? `${path}/` : ""}${it.name}${it.type === 'folder' ? '/' : ''}`
  ), [path]);
  function isSelectedKey(key: string) { return selectedKeys.has(key); }
  function toggleKey(key: string, checked: boolean | "indeterminate") {
    const want = checked === true;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (want) next.add(key); else next.delete(key);
      return next;
    });
  }
  function clearSelection() { setSelectedKeys(new Set()); }
  const selectedCount = selectedKeys.size;

  // Keyboard handlers: Delete to bulk delete; Shift/Ctrl selection logic applied in click handlers below
  // (moved below after onBulkDelete declaration)

  function navigate(next: string) {
    const clean = next.replace(/^\/+|\/+$/g, "");
    if (clean === path) return;
    setPath(clean);
    refresh(clean);
  }

  async function onUpload(files: File[]) {
    // Compute md5 hashes for duplicates? We will use remote ETag for fast path, and name prompt when same
    const existingByName = new Map(items.map(it => [it.name, it] as const));
    const existingBundleNames = new Set(items.filter(it=>it.type==='folder').map(it=>it.name));
    const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name);
    if (isHooksAdminPath || isLearnTutorialsAdminPath) {
      const rejected = files.filter(f => !isVideo(f));
      if (rejected.length) {
        toast.error('Only video files are allowed in this folder. Skipped: ' + rejected.map(f=>f.name).join(', '));
      }
      files = files.filter(isVideo);
    }
    if (isLearnEbooksAdminPath) {
      const isPdf = (f: File) => (f.type || '').startsWith('application/pdf') || /\.pdf$/i.test(f.name);
      const rejected = files.filter(f => !isPdf(f));
      if (rejected.length) {
        toast.error('Only PDF files are allowed in ebooks. Skipped: ' + rejected.map(f=>f.name).join(', '));
      }
      files = files.filter(isPdf);
    }
    const toUpload: File[] = [];
    // Client-side precheck: ensure total size won't exceed quota (non-admin only)
    if (scope !== 'admin') {
      try {
        const u = usage || (await fetch('/api/storage/usage', { cache: 'no-store' }).then(r=>r.json()).catch(()=>null));
        const limit = u?.limitBytes as number | null;
        const used = u?.usedBytes as number | undefined;
        if (limit && typeof used === 'number') {
          const incoming = files.reduce((acc, f) => acc + (f.size || 0), 0);
          if (used + incoming > limit) {
            toast.error('Uploading these files would exceed your storage limit. Please remove some files or upgrade your plan.');
            return;
          }
        }
      } catch {}
    }
    for (const f of files) {
      if ((isHooksAdminPath || isLearnTutorialsAdminPath) && isVideo(f)) {
        // Bundle slug duplicate check against existing folder names
        const slug = createSlug(f.name);
        const hasBundle = existingBundleNames.has(slug);
        if (hasBundle) {
          if (replaceAll === true) {
            toUpload.push(f);
            continue;
          }
          if (replaceAll === false) {
            continue;
          }
          pendingFilesRef.current = files;
          setConflictName(`[bundle] ${slug}`);
          setConfirmOpen(true);
          return; // wait for user
        }
        toUpload.push(f);
        continue;
      }
      const conflict = existingByName.get(f.name);
      if (conflict) {
        // If ETag equals unknown, still prompt. If we can hash client-side, skip identical
        try {
          const buf = await f.arrayBuffer();
          const md5 = SparkMD5.ArrayBuffer.hash(buf);
          if (conflict.etag && conflict.etag.replace(/\"/g, "") === md5) {
            // identical content, skip
            continue;
          }
        } catch {}
        if (replaceAll === true) {
          toUpload.push(f);
          continue;
        }
        if (replaceAll === false) {
          continue;
        }
        pendingFilesRef.current = files;
        setConflictName(f.name);
        setConfirmOpen(true);
        return; // Defer until user chooses
      } else {
        toUpload.push(f);
      }
    }
    const isHooksAdmin = isHooksAdminPath;
    const isPdf = (f: File) => (f.type || '').startsWith('application/pdf') || /\.pdf$/i.test(f.name);
    // Initialize upload progress state
    let totalUnits = 0;
    for (const f of toUpload) {
      if (isHooksAdmin && isVideo(f)) totalUnits += 2; else if (isLearnEbooksAdminPath && isPdf(f)) totalUnits += 2; else totalUnits += 1;
    }
    if (toUpload.length > 0) {
      cancelRequestedRef.current = false;
      setUploading(true);
      setUploadUnitsDone(0);
      setUploadUnitsTotal(totalUnits);
      setUploadPercent(0);
      setUploadCurrentName(null);
      setUploadFilesDone(0);
      setUploadFilesTotal(toUpload.length);
    }

    function uploadViaXHR(form: FormData, currentName: string) {
      return new Promise<void>((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          activeXHRRef.current = xhr;
          xhr.open('POST', '/api/storage/upload', true);
          xhr.responseType = 'json';
          xhr.upload.onprogress = (evt) => {
            if (!uploadUnitsTotal) return;
            if (evt.lengthComputable) {
              const unitProgress = evt.total ? evt.loaded / evt.total : 0;
              setUploadCurrentName(currentName);
              setUploadPercent(Math.round(((uploadUnitsDone + unitProgress) / uploadUnitsTotal) * 100));
            } else {
              setUploadCurrentName(currentName);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error('Upload failed'));
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.onabort = () => reject(new Error('aborted'));
          xhr.send(form);
        } catch (err) {
          reject(err as Error);
        }
      });
    }

    let unitsDone = 0;
    for (const f of toUpload) {
      if (cancelRequestedRef.current) break;
      if (isHooksAdmin && isVideo(f)) {
        // Special pipeline: create a bundle folder with muted video + thumbnail
        try {
          const slug = createSlug(f.name);
          const bundlePath = path ? `${path}/${slug}` : slug;
          const { videoFile, thumbFile } = await createHookBundleFiles(f);
          // Upload thumbnail first
          if (cancelRequestedRef.current) break;
          const formThumb = new FormData();
          formThumb.append('file', thumbFile, thumbFile.name);
          formThumb.append('path', bundlePath);
          if (scope === 'admin') formThumb.append('scope', 'admin');
          try {
            await uploadViaXHR(formThumb, thumbFile.name || 'thumbnail');
          } catch (err) {
            if ((err as Error)?.message === 'aborted') break;
            throw new Error('thumb upload failed');
          }
          unitsDone += 1;
          setUploadUnitsDone(unitsDone);
          if (uploadUnitsTotal) setUploadPercent(Math.round((unitsDone / uploadUnitsTotal) * 100));
          // Upload video
          if (cancelRequestedRef.current) break;
          const formVid = new FormData();
          formVid.append('file', videoFile, videoFile.name);
          formVid.append('path', bundlePath);
          if (scope === 'admin') formVid.append('scope', 'admin');
          try {
            await uploadViaXHR(formVid, videoFile.name || 'video');
          } catch (err) {
            if ((err as Error)?.message === 'aborted') break;
            throw new Error('video upload failed');
          }
          unitsDone += 1;
          setUploadUnitsDone(unitsDone);
          if (uploadUnitsTotal) setUploadPercent(Math.round((unitsDone / uploadUnitsTotal) * 100));
          setUploadFilesDone((n)=>n+1);
        } catch (err) {
          console.error('hook bundle upload failed, falling back to raw upload', err);
          if (cancelRequestedRef.current) break;
          const form = new FormData();
          form.append('file', f, f.name);
          form.append('path', path);
          if (scope === 'admin') form.append('scope', 'admin');
          try {
            await uploadViaXHR(form, f.name);
          } catch (e) {
            if ((e as Error)?.message === 'aborted') break;
            toast.error('Upload failed');
            break;
          }
          unitsDone += 1;
          setUploadUnitsDone(unitsDone);
          if (uploadUnitsTotal) setUploadPercent(Math.round((unitsDone / uploadUnitsTotal) * 100));
          setUploadFilesDone((n)=>n+1);
        }
      } else if (isLearnEbooksAdminPath && isPdf(f)) {
        if (cancelRequestedRef.current) break;
        try {
          const slug = createSlug(f.name);
          const bundlePath = path ? `${path}/${slug}` : slug;
          let coverFile: File | null = null;
          try {
            coverFile = await createPdfCoverImageFile(f);
          } catch (err) {
            console.warn('pdf cover generation failed', err);
          }
          if (coverFile) {
            const formCover = new FormData();
            formCover.append('file', coverFile, coverFile.name || 'cover.jpg');
            formCover.append('path', bundlePath);
            if (scope === 'admin') formCover.append('scope', 'admin');
            try {
              await uploadViaXHR(formCover, coverFile.name || 'cover');
            } catch (err) {
              if ((err as Error)?.message === 'aborted') break;
              console.warn('cover upload failed, continuing with pdf');
            }
            unitsDone += 1;
            setUploadUnitsDone(unitsDone);
            if (uploadUnitsTotal) setUploadPercent(Math.round((unitsDone / uploadUnitsTotal) * 100));
          }
          if (cancelRequestedRef.current) break;
          const pdfExt = f.name.toLowerCase().endsWith('.pdf') ? '' : '.pdf';
          const pdfFile = new File([await f.arrayBuffer()], `file${pdfExt || '.pdf'}`, { type: 'application/pdf' });
          const formPdf = new FormData();
          formPdf.append('file', pdfFile, pdfFile.name);
          formPdf.append('path', bundlePath);
          if (scope === 'admin') formPdf.append('scope', 'admin');
          try {
            await uploadViaXHR(formPdf, pdfFile.name || 'ebook');
          } catch (err) {
            if ((err as Error)?.message === 'aborted') break;
            throw new Error('pdf upload failed');
          }
          unitsDone += 1;
          setUploadUnitsDone(unitsDone);
          if (uploadUnitsTotal) setUploadPercent(Math.round((unitsDone / uploadUnitsTotal) * 100));
          setUploadFilesDone((n)=>n+1);
        } catch (err) {
          console.error('ebook bundle upload failed, falling back to raw upload', err);
          if (cancelRequestedRef.current) break;
          const form = new FormData();
          form.append('file', f, f.name);
          form.append('path', path);
          if (scope === 'admin') form.append('scope', 'admin');
          try {
            await uploadViaXHR(form, f.name);
          } catch (e) {
            if ((e as Error)?.message === 'aborted') break;
            toast.error('Upload failed');
            break;
          }
          unitsDone += 1;
          setUploadUnitsDone(unitsDone);
          if (uploadUnitsTotal) setUploadPercent(Math.round((unitsDone / uploadUnitsTotal) * 100));
          setUploadFilesDone((n)=>n+1);
        }
      } else {
        if (cancelRequestedRef.current) break;
        const form = new FormData();
        form.append('file', f, f.name);
        form.append('path', path);
        if (scope === 'admin') form.append('scope', 'admin');
        try {
          await uploadViaXHR(form, f.name);
        } catch (e) {
          if ((e as Error)?.message === 'aborted') break;
          try {
            const res = activeXHRRef.current?.response as unknown;
            let msg = 'Upload failed';
            if (res && typeof res === 'object' && 'error' in (res as Record<string, unknown>)) {
              const errVal = (res as Record<string, unknown>).error;
              if (typeof errVal === 'string') msg = errVal;
            }
            toast.error(msg);
          } catch { toast.error('Upload failed'); }
          break;
        }
        unitsDone += 1;
        setUploadUnitsDone(unitsDone);
        if (uploadUnitsTotal) setUploadPercent(Math.round((unitsDone / uploadUnitsTotal) * 100));
        setUploadFilesDone((n)=>n+1);
      }
    }
    try {
      await refresh(undefined, { force: true });
      setTreeVersion(v=>v+1);
    } finally {
      setUploading(false);
      setUploadCurrentName(null);
      activeXHRRef.current = null;
    }
  }

  function createSlug(name: string) {
    const base = (name || 'video').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${base || 'video'}`;
  }

  async function createHookBundleFiles(file: File): Promise<{ videoFile: File; thumbFile: File }> {
    // Try ffmpeg.wasm for audio removal + first frame. Fallback to original video + canvas thumbnail.
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      const inputName = 'input';
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
      const inputFile = `${inputName}.${ext}`;
      {
        const buf = new Uint8Array(await file.arrayBuffer());
        await ffmpeg.writeFile(inputFile, buf as unknown as Uint8Array);
      }
      // Create thumbnail
      const thumbName = 'thumb.jpg';
      await ffmpeg.exec(['-i', inputFile, '-frames:v', '1', '-q:v', '2', thumbName]);
      // Strip audio, attempt stream copy first; if fails, re-encode minimal
      const outName = `video.mp4`;
      try {
        await ffmpeg.exec(['-i', inputFile, '-an', '-c:v', 'copy', outName]);
      } catch {
        await ffmpeg.exec(['-i', inputFile, '-an', '-vcodec', 'libx264', '-preset', 'veryfast', '-movflags', 'faststart', outName]);
      }
      const outVideo = await ffmpeg.readFile(outName);
      const outThumb = await ffmpeg.readFile(thumbName);
      const videoBlob = new Blob([outVideo as unknown as BlobPart], { type: 'video/mp4' });
      const thumbBlob = new Blob([outThumb as unknown as BlobPart], { type: 'image/jpeg' });
      const videoFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });
      const thumbFile = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' });
      return { videoFile, thumbFile };
    } catch (e) {
      console.warn('ffmpeg pipeline unavailable; falling back to canvas thumb + muted playback', e);
      const thumbBlob = await extractFirstFrameFromFile(file);
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
      const videoFile = new File([await file.arrayBuffer()], `video.${ext}`, { type: file.type || 'video/mp4' });
      const thumbFile = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' });
      return { videoFile, thumbFile };
    }
  }

  async function createPdfCoverImageFile(file: File): Promise<File> {
    const data = await file.arrayBuffer();
    try {
      const pdfjs = await import('pdfjs-dist');
      const anyPdf = pdfjs as unknown as { GlobalWorkerOptions?: { workerSrc?: string }; getDocument: (args: { data: ArrayBuffer }) => { promise: Promise<unknown> } };
      const GlobalWorkerOptions = anyPdf.GlobalWorkerOptions;
      if (GlobalWorkerOptions && !GlobalWorkerOptions.workerSrc) {
        try { GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs'; } catch {}
      }
      const loadingTask = anyPdf.getDocument({ data });
      const loaded: unknown = await loadingTask.promise;
      const pdf = loaded as { getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } }> };
      const page = await pdf.getPage(1);
      const viewport: { width: number; height: number } = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no ctx');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blobOut: Blob | null = await new Promise((resolve) => canvas.toBlob((b)=>resolve(b), 'image/jpeg', 0.9));
      if (!blobOut) throw new Error('no cover');
      return new File([blobOut], 'cover.jpg', { type: 'image/jpeg' });
    } catch (e) {
      // fallback: solid placeholder
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.fillStyle = '#111'; ctx.fillRect(0,0,canvas.width,canvas.height); }
      const b: Blob | null = await new Promise((resolve) => canvas.toBlob((bb)=>resolve(bb), 'image/jpeg', 0.85));
      if (!b) throw e;
      return new File([b], 'cover.jpg', { type: 'image/jpeg' });
    }
  }

  async function extractFirstFrameFromFile(file: File): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      try {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = `${url}#t=0.001`;
        video.muted = true;
        video.preload = 'metadata';
        try { (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true; } catch {}
        const onLoaded = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 320;
            canvas.height = video.videoHeight || 180;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('no ctx');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((b)=>{ cleanup(); if (b) resolve(b); else reject(new Error('no blob')); }, 'image/jpeg', 0.85);
          } catch (err) { cleanup(); reject(err as Error); }
        };
        const onError = () => { cleanup(); reject(new Error('thumb error')); };
        function cleanup(){ try{video.removeEventListener('loadeddata', onLoaded);}catch{} try{video.removeEventListener('error', onError);}catch{} try{URL.revokeObjectURL(url);}catch{} }
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('error', onError);
      } catch (err) { reject(err as Error); }
    });
  }

  async function onDelete(it: Item) {
    // Prevent deletes inside managed folders
    const managedPath = path === 'vehicles' || (path || '').startsWith('vehicles/') || path === 'designer_masks' || (path || '').startsWith('designer_masks/') || path === 'designer_states' || (path || '').startsWith('designer_states/');
    if (managedPath) { toast.info('This folder is managed. Deletion is disabled here.'); return; }
    if (it.type === 'folder') {
      const ok = await confirmToast({ title: `Delete folder "${it.name}"?`, message: 'All contents will be deleted.' });
      if (!ok) return;
    }
    const key = it.key || `${path ? `${path}/` : ""}${it.name}${it.type==='folder'?'/':''}`;
    const normalizedKey = String(key).replace(/^\/+/, '');
    if (normalizedKey.startsWith('vehicles/') || normalizedKey.startsWith('designer_masks/') || normalizedKey.startsWith('designer_states/')) { toast.info('This folder is managed. Deletion is disabled here.'); return; }
    const cacheKey = `${scope === 'admin' ? 'admin' : 'user'}:${path}`;
    const prevItems = items;
    // Optimistic UI: remove immediately and update cache
    const nextItems = items.filter(x => (x.key || `${path ? `${path}/` : ""}${x.name}${x.type==='folder'?'/':''}`) !== key);
    setItems(nextItems);
    workspaceItemsCache.set(cacheKey, { items: nextItems, timestamp: Date.now() });
    try {
      const res = await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key, isFolder: it.type==='folder', scope }) });
      if (!res.ok) throw new Error('Delete failed');
      toast.success(`${it.type==='folder'?'Folder':'File'} deleted`);
      setTreeVersion(v=>v+1);
      setViewUrls((prev) => {
        const next = { ...prev } as Record<string, string>;
        try { delete next[key.replace(/\/$/, '')]; } catch {}
        return next;
      });
    } catch {
      // Revert on failure
      setItems(prevItems);
      workspaceItemsCache.set(cacheKey, { items: prevItems, timestamp: Date.now() });
      toast.error(`Failed to delete ${it.type==='folder'?'folder':'file'}`);
    }
  }

  const onBulkDelete = useCallback(async () => {
    // Prevent bulk deletes inside managed folders
    const managedPath = path === 'vehicles' || (path || '').startsWith('vehicles/') || path === 'designer_masks' || (path || '').startsWith('designer_masks/');
    if (managedPath) { toast.info('This folder is managed. Deletion is disabled here.'); return; }
    if (selectedKeys.size === 0) return;
    const keys = Array.from(selectedKeys);
    const lookup = new Map(items.map(it => [itemStorageKey(it), it] as const));
    // If any selected key lies under managed folders, block
    const hasManaged = keys.some((k) => {
      const n = String(k || '').replace(/^\/+/, '');
      return n.startsWith('vehicles/') || n.startsWith('designer_masks/');
    });
    if (hasManaged) { toast.info('This folder is managed. Deletion is disabled here.'); return; }
    const hasFolder = keys.some(k => (lookup.get(k)?.type === 'folder'));
    const ok = await confirmToast({ title: `Delete ${keys.length} selected item${keys.length>1?'s':''}?`, message: hasFolder ? 'Folders will delete all contents.' : undefined });
    if (!ok) return;
    const cacheKey = `${scope === 'admin' ? 'admin' : 'user'}:${path}`;
    const prevItems = items;
    // Optimistic remove from UI and cache
    const keySet = new Set(keys);
    const nextItems = items.filter(it => !keySet.has(itemStorageKey(it)));
    setItems(nextItems);
    workspaceItemsCache.set(cacheKey, { items: nextItems, timestamp: Date.now() });
    clearSelection();
    try {
      for (const k of keys) {
        const it = lookup.get(k);
        if (!it) continue;
        const res = await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key: k, isFolder: it.type==='folder', scope }) });
        if (!res.ok) throw new Error('Delete failed');
      }
      toast.success(`Deleted ${keys.length} item${keys.length>1?'s':''}`);
      setTreeVersion(v=>v+1);
      setViewUrls((prev) => {
        const next = { ...prev } as Record<string, string>;
        for (const k of keys) { try { delete next[k.replace(/\/$/, '')]; } catch {} }
        return next;
      });
    } catch {
      // Revert UI on failure
      setItems(prevItems);
      workspaceItemsCache.set(cacheKey, { items: prevItems, timestamp: Date.now() });
      toast.error('Failed to delete selected items');
    }
  }, [path, selectedKeys, items, scope, itemStorageKey]);

  // Rename temporarily disabled due to runtime issue in promptToast (jsx is not a function)
  // Leaving stub to avoid unused references if re-enabled later
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function onRename(_it: Item) { /* disabled */ }

  function crumbs(): { label: string; value: string }[] {
    const parts = path ? path.split('/') : [];
    const res: { label: string; value: string }[] = [{ label: '/', value: '' }];
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      res.push({ label: p, value: acc });
    }
    return res;
  }

  function formatSize(bytes?: number) {
    if (!bytes || bytes <= 0) return "—";
    const units = ["B","KB","MB","GB","TB"]; let i = 0; let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function renderTypeIcon(name: string, isFolder: boolean) {
    if (isFolder) {
      return (
        <svg className="size-4 text-indigo-300" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v1h9l2 2h9v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6z"/></svg>
      );
    }
    const lower = name.toLowerCase();
    if (/(\.png|\.jpe?g|\.gif|\.webp|\.svg|\.bmp|\.tiff?)$/.test(lower)) {
      return (<svg className="size-4 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" d="M3 5a2 2 0 0 1 2-2h7l4 4h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path strokeWidth="2" d="M8 17l2.5-3 2 2 3-4 3.5 5"/></svg>);
    }
    if (/\.(tsx|jsx)$/.test(lower)) {
      return (
        <svg className="size-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="2" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4" strokeWidth="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" strokeWidth="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" strokeWidth="1.5"/></svg>
      );
    }
    if (/\.js$/.test(lower)) {
      return (<svg className="size-4 text-yellow-300" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><text x="7" y="16" fontSize="8" fill="#000">JS</text></svg>);
    }
    if (/\.html$/.test(lower)) {
      return (<svg className="size-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18l-2 16-7 2-7-2z"/></svg>);
    }
    if (/\.css$/.test(lower)) {
      return (<svg className="size-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18l-2 16-7 2-7-2z"/></svg>);
    }
    return (
      <svg className="size-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" d="M7 21h10a2 2 0 0 0 2-2V9.5L12.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/></svg>
    );
  }

  async function computeSha1Hex(input: string): Promise<string> {
    try {
      const enc = new TextEncoder();
      const data = enc.encode(input);
      const digest = await crypto.subtle.digest('SHA-1', data);
      const arr = Array.from(new Uint8Array(digest));
      return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }

  async function _ensureMaskHintForKey(fullKeyOrName: string) {
    try {
      const key = fullKeyOrName;
      if (!key) return;
      setMaskHint((prev) => ({ ...prev, [key]: prev[key] || 'checking' }));
      // Only compute when we have a full user key (users/<id>/...)
      const m = key.match(/^(users\/[^/]+)\//);
      if (!m) { setMaskHint((prev) => ({ ...prev, [key]: 'unknown' })); return; }
      const userRoot = m[1];
      const digest = await computeSha1Hex(key);
      if (!digest) { setMaskHint((prev) => ({ ...prev, [key]: 'unknown' })); return; }
      const maskKey = `${userRoot}/designer_masks/${digest}.png`;
      try {
        const res = await fetch(`/api/storage/file?key=${encodeURIComponent(maskKey)}`, { method: 'GET', headers: { Range: 'bytes=0-0' } });
        if (res.ok) setMaskHint((prev) => ({ ...prev, [key]: 'exists' }));
        else setMaskHint((prev) => ({ ...prev, [key]: 'missing' }));
      } catch {
        setMaskHint((prev) => ({ ...prev, [key]: 'missing' }));
      }
    } catch {
      // noop
    }
  }

  function ImageThumb({ storageKey, alt, url: providedUrl, blurhash }: { storageKey: string; alt: string; url?: string | null; blurhash?: string }) {
    const [url, setUrl] = useState<string | null>(providedUrl || null);
    useEffect(() => {
      let cancelled = false;
      if (providedUrl) {
        setUrl(providedUrl);
        return () => { cancelled = true; };
      }
      (async () => {
        try {
          const u = await getViewUrl(storageKey, scope);
          if (!cancelled && u) setUrl(u);
        } catch {}
      })();
      return () => { cancelled = true; };
    }, [storageKey, providedUrl]);
    if (!url) return (
      <Skeleton className="w-full h-full rounded-none" />
    );
    if (blurhash) {
      return (
        <BlurhashImage
          src={url}
          alt={alt}
          fill
          sizes="(max-width: 768px) 50vw, 12rem"
          blurhash={blurhash}
          className="object-cover"
          showSkeleton={false}
        />
      );
    }
    return (
      <Image
        src={url}
        alt={alt}
        fill
        sizes="(max-width: 768px) 50vw, 12rem"
        unoptimized
        className="object-cover"
      />
    );
  }

  function VideoThumb({ storageKey, alt, url: providedUrl, blurhash }: { storageKey: string; alt: string; url?: string | null; blurhash?: string }) {
    const [url, setUrl] = useState<string | null>(providedUrl || null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isInView, setIsInView] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
      let cancelled = false;
      if (providedUrl) {
        setUrl(providedUrl);
        return () => { cancelled = true; };
      }
      (async () => {
        try {
          const u = await getViewUrl(storageKey, scope);
          if (!cancelled && u) setUrl(u);
        } catch {}
      })();
      return () => { cancelled = true; };
    }, [storageKey, providedUrl]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            setIsInView(entry.isIntersecting);
          });
        },
        { threshold: 0.5 }
      );

      observer.observe(video);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !url) return;

      if (isInView) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }, [isInView, url]);

    if (!url) return (
      <Skeleton className="w-full h-full rounded-none" />
    );

    return (
      <>
        {blurhash && !isLoaded && (
          <BlurhashImage
            src=""
            alt={alt}
            fill
            sizes="(max-width: 768px) 50vw, 12rem"
            blurhash={blurhash}
            className="object-cover"
            showSkeleton={false}
          />
        )}
        <video
          ref={videoRef}
          src={url}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: isLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
          loop
          muted
          playsInline
          preload="metadata"
          onLoadedData={() => setIsLoaded(true)}
        />
      </>
    );
  }

  const sortedItems = useMemo(() => {
    const last = path.split('/').pop() || '';
    const visibleUnfiltered = items.filter((it) => !(it.type === 'folder' && it.name === last));
    const currentScope = scope === 'admin' ? 'admin' : 'user';
    const showManaged = SHOW_MANAGED_FOLDERS[currentScope];
    const visible = showManaged || (path && path.length > 0)
      ? visibleUnfiltered
      : visibleUnfiltered.filter((it) => !(it.type === 'folder' && isManagedRootName(it.name)));
    
    // Add temporary placeholder items for videos being upscaled
    const placeholders: ItemWithTag[] = [];
    for (const key of activeUpscaleOps) {
      const fileName = key.split('/').pop() || 'video.mp4';
      const baseName = fileName.replace(/\.[^.]+$/, '');
      const placeholderName = `upscaled-${baseName}.mp4`;
      
      // Only show placeholder if we're in the same directory as the source video
      const keyPath = key.includes('/') ? key.substring(0, key.lastIndexOf('/')) : 'library';
      if (keyPath === path) {
        placeholders.push({
          type: 'file',
          name: placeholderName,
          key: `${key}-upscaling-placeholder`,
          size: 0,
          lastModified: new Date().toISOString(),
          isUpscaling: true, // Flag to identify placeholder items
        } as ItemWithTag);
      }
    }
    
    const arr = [...visible, ...placeholders];
    arr.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
      else if (sortBy === 'modified') cmp = new Date(a.lastModified || 0).getTime() - new Date(b.lastModified || 0).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [items, sortBy, sortDir, path, scope, isManagedRootName, activeUpscaleOps]);

  // Reset cached view URLs on path change
  useEffect(() => { setViewUrls({}); }, [path]);

  // Bulk fetch signed view URLs for image and video thumbnails in icons view
  useEffect(() => {
    let aborted = false;
    if (view !== 'icons') return () => { aborted = true; };
    const isImage = (n: string) => /(\.png|\.jpe?g|\.gif|\.webp|\.svg|\.bmp|\.tiff?)$/i.test(n);
    const isVideo = (n: string) => /(\.mp4|\.mov|\.webm|\.avi|\.mkv)$/i.test(n);
    const keys = sortedItems
      .filter((it) => it.type === 'file' && (isImage(it.name) || isVideo(it.name)))
      .map((it) => it.key || `${path ? `${path}/` : ''}${it.name}`);
    const unique = Array.from(new Set(keys));
    const missing = unique.filter((k) => !viewUrls[k]);
    if (missing.length === 0) return () => { aborted = true; };
    (async () => {
      try {
        const updates = await getViewUrls(missing, scope);
        if (!aborted && Object.keys(updates).length > 0) setViewUrls((prev) => ({ ...prev, ...updates }));
      } catch {}
    })();
    return () => { aborted = true; };
  }, [sortedItems, path, scope, view, viewUrls]);

  // Automatic blurhash backfill for items without blurhashes
  useEffect(() => {
    let aborted = false;
    
    // Only backfill in library paths
    const isLibraryPath = path === 'library' || path.startsWith('library/');
    if (!isLibraryPath || loading) return () => { aborted = true; };

    const isImage = (n: string) => /(\.png|\.jpe?g|\.gif|\.webp|\.svg|\.bmp|\.tiff?)$/i.test(n);
    const isVideo = (n: string) => /(\.mp4|\.mov|\.webm|\.avi|\.mkv)$/i.test(n);

    // Find items that need blurhash generation
    const itemsNeedingBlurhash = sortedItems.filter((it) => {
      if (it.type !== 'file') return false;
      if (!it.key) return false;
      if (it.blurhash) return false; // Already has blurhash
      if (blurhashBackfillProcessed.has(it.key)) return false; // Already attempted
      // Only backfill library files (the endpoint rejects non-library files anyway)
      if (!it.key.startsWith('library/')) return false;
      return isImage(it.name) || isVideo(it.name);
    });

    if (itemsNeedingBlurhash.length === 0) return () => { aborted = true; };

    // Process items one at a time with delay to avoid overwhelming server
    let currentIndex = 0;
    const processNext = async () => {
      if (aborted || currentIndex >= itemsNeedingBlurhash.length) return;

      const item = itemsNeedingBlurhash[currentIndex];
      if (!item?.key) {
        currentIndex++;
        setTimeout(processNext, 100);
        return;
      }

      try {
        console.log(`[blurhash-backfill] Generating for: ${item.key}`);
        
        const response = await fetch('/api/storage/generate-blurhash-backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: item.key, scope }),
        });

        if (response.ok) {
          const data = await response.json();
          
          // Update items with the new blurhash
          if (data.blurhash && !aborted) {
            setItems((prevItems) =>
              prevItems.map((it) =>
                it.key === item.key ? { ...it, blurhash: data.blurhash } : it
              )
            );
            console.log(`[blurhash-backfill] Success: ${item.key}`);
          }
        } else if (response.status !== 400) {
          // Only log non-400 errors (400 is expected for non-library files)
          console.warn(`[blurhash-backfill] Failed for ${item.key}:`, response.status);
        }
      } catch (error) {
        console.error(`[blurhash-backfill] Error for ${item.key}:`, error);
      } finally {
        // Mark as processed regardless of success/failure
        if (!aborted) {
          setBlurhashBackfillProcessed((prev) => new Set(prev).add(item.key!));
        }
      }

      currentIndex++;
      // Small delay between items to avoid overwhelming the server
      if (!aborted && currentIndex < itemsNeedingBlurhash.length) {
        setTimeout(processNext, 500);
      }
    };

    // Start processing after a short delay
    const timeoutId = setTimeout(processNext, 1000);

    return () => {
      aborted = true;
      clearTimeout(timeoutId);
    };
  }, [sortedItems, path, scope, loading, blurhashBackfillProcessed]);

  function updateSort(next: "name" | "size" | "modified") {
    setSortBy((prev) => {
      if (prev === next) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return next;
    });
  }

  function rectsIntersect(a: {left:number;top:number;right:number;bottom:number}, b: {left:number;top:number;right:number;bottom:number}) {
    return !(b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top);
  }

  const computeMarqueeSelection = useCallback((rect: { x: number; y: number; w: number; h: number }): Set<string> => {
    const container = contentRef.current;
    if (!container) return new Set();
    const left = Math.min(rect.x, rect.x + rect.w);
    const top = Math.min(rect.y, rect.y + rect.h);
    const right = Math.max(rect.x, rect.x + rect.w);
    const bottom = Math.max(rect.y, rect.y + rect.h);
    const selBox = { left, top, right, bottom };
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-sk]'));
    const selected = new Set<string>();
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const elBox = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      if (rectsIntersect(selBox, elBox)) {
        const key = el.getAttribute('data-sk');
        if (key) selected.add(key);
      }
    }
    return selected;
  }, []);

  const beginMarquee = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (contextMenuOpen) return;
    const target = e.target as HTMLElement;
    if (target && target.closest('[data-sk]')) return; // don't start marquee when clicking items
    selectingRef.current = true;
    setSelecting(false);
    selectionStartRef.current = { x: e.clientX, y: e.clientY };
    additiveRef.current = !!(e.ctrlKey || e.metaKey);
    initialSelectedRef.current = new Set(selectedKeys);
    dragThresholdRef.current = false;
    setSelectionRect(null);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  }, [selectedKeys, contextMenuOpen]);

  const onMarqueeMove = useCallback((e: React.PointerEvent) => {
    if (!selectingRef.current || !selectionStartRef.current) return;
    const start = selectionStartRef.current;
    const w = e.clientX - start.x;
    const h = e.clientY - start.y;
    const moved = Math.abs(w) + Math.abs(h);
    if (!dragThresholdRef.current) {
      if (moved < 6) return; // threshold before starting selection
      dragThresholdRef.current = true;
      setSelecting(true);
    }
    const rect = { x: start.x, y: start.y, w, h };
    setSelectionRect(rect);
    const selectedNow = computeMarqueeSelection(rect);
    if (additiveRef.current) {
      const next = new Set(initialSelectedRef.current);
      for (const k of selectedNow) next.add(k);
      setSelectedKeys(next);
    } else {
      setSelectedKeys(selectedNow);
    }
  }, [computeMarqueeSelection]);

  const endMarquee = useCallback((e: React.PointerEvent) => {
    if (!selectingRef.current) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (!dragThresholdRef.current) {
      // simple click on background clears selection (only if not on an item)
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sk]')) clearSelection();
    }
    selectingRef.current = false;
    dragThresholdRef.current = false;
    setSelecting(false);
    selectionStartRef.current = null;
    setSelectionRect(null);
  }, []);

  const isFetching = loading || refreshing;
  const _selectedImageKey = useMemo(() => {
    if (selectedKeys.size !== 1) return null;
    const k = Array.from(selectedKeys)[0];
    const lookup = new Map(sortedItems.map(it => [itemStorageKey(it), it] as const));
    const it = lookup.get(k);
    if (!it || it.type !== 'file') return null;
    if (!/(\.png|\.jpe?g|\.gif|\.webp|\.bmp|\.tiff?)$/i.test(it.name)) return null;
    return it.key || `${path ? `${path}/` : ''}${it.name}`;
  }, [selectedKeys, sortedItems, path, itemStorageKey]);

  // Keyboard handlers: Delete to bulk delete; Shift/Ctrl selection logic applied in click handlers below
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Delete' && selectedKeys.size > 0) {
        e.preventDefault();
        onBulkDelete();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedKeys, onBulkDelete]);

  async function saveDesignToWorkspace(blob: Blob, projectState?: string) {
    try {
      const targetPath = path === 'vehicles' ? 'library' : (path || 'library');
      const timestamp = Date.now();
      const filename = `design-${timestamp}.png`;
      
      // Upload the PNG image
      const form = new FormData();
      const file = new File([blob], filename, { type: 'image/png' });
      form.append('file', file, filename);
      form.append('path', targetPath);
      if (scope === 'admin') form.append('scope', 'admin');
      const res = await fetch('/api/storage/upload', { method: 'POST', body: form });
      if (!res.ok) {
        try {
          const data = await res.json();
          toast.error(data?.error || 'Failed to save');
        } catch {
          toast.error('Failed to save');
        }
        return;
      }
      
      // Get the uploaded file's key to save project state with matching hash
      const uploadData = await res.json().catch(() => ({}));
      const uploadedKey = uploadData?.key as string | undefined;
      
      // Also save the project state if provided - store in managed designer_states folder
      if (projectState && uploadedKey) {
        try {
          const { default: SparkMD5 } = await import('spark-md5');
          const hash = SparkMD5.hash(uploadedKey);
          const projectFilename = `${hash}.json`;
          
          console.log('[saveDesignToWorkspace] Saving project state:', {
            uploadedKey,
            hash,
            projectFilename,
            projectStateLength: projectState.length
          });
          
          const projectForm = new FormData();
          const projectFile = new File([projectState], projectFilename, { type: 'application/json' });
          projectForm.append('file', projectFile, projectFilename);
          projectForm.append('path', 'designer_states'); // Managed folder
          if (scope === 'admin') projectForm.append('scope', 'admin');
          const projectRes = await fetch('/api/storage/upload', { method: 'POST', body: projectForm });
          
          if (!projectRes.ok) {
            console.error('[saveDesignToWorkspace] Project state upload failed:', await projectRes.text());
          } else {
            const projectData = await projectRes.json();
            console.log('[saveDesignToWorkspace] Project state saved successfully:', projectData);
          }
        } catch (err) {
          console.warn('[saveDesignToWorkspace] Failed to save project state:', err);
        }
      }
      
      await refresh(undefined, { force: true });
      setTreeVersion(v=>v+1);
      const message = path === 'vehicles' ? 'Saved to your library folder' : 'Saved to your library';
      
      // Close designer and open preview of the saved image
      setDesignOpen(false);
      setDesignKey(null);
      setDesignProjectState(null);
      
      // Auto-open the preview of the saved image
      if (uploadedKey) {
        try {
          const url = await getViewUrl(uploadedKey, scope);
          if (url) {
            setPreview({ url, name: filename, key: uploadedKey });
          }
        } catch (err) {
          console.warn('[saveDesignToWorkspace] Failed to open preview:', err);
        }
      }
      
      try {
        toast.success(message, {
          action: {
            label: 'View',
            onClick: () => {
              try {
                // If we're already on the workspace page, just open the preview directly
                if (uploadedKey && window.location.pathname.includes('/dashboard')) {
                  const url = new URL(window.location.href);
                  url.searchParams.set('preview', uploadedKey);
                  window.location.href = url.toString();
                } else {
                  // Navigate to workspace with preview param
                  window.location.href = `/dashboard?view=forge&tab=workspace&path=library&preview=${encodeURIComponent(uploadedKey || '')}`;
                }
              } catch {}
            },
          },
        });
      } catch {}
    } catch {}
  }

  return (
    <div className="grid grid-rows-[auto_1fr] gap-3 h-full">
      {/* Mobile header */}
      <div className="md:hidden grid gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button size="icon" variant="ghost" className="shrink-0" onClick={()=>{ const parent = path.split('/').slice(0, -1).join('/'); navigate(parent); }} disabled={!path} aria-label="Go back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Breadcrumb className="min-w-0 overflow-hidden">
            <BreadcrumbList className="flex-nowrap min-w-0 overflow-hidden">
              {crumbs().map((c, i, arr) => (
                <Fragment key={`crumb-${c.value || 'root'}`}>
                  <BreadcrumbItem key={`item-${c.value || 'root'}`}>
                    {i === arr.length - 1 ? (
                      <BreadcrumbPage className="text-primary truncate">{c.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink className="truncate" href="#" onClick={(e)=>{ e.preventDefault(); navigate(c.value); }}>{c.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {i < arr.length - 1 ? <BreadcrumbSeparator key={`sep-${c.value || 'root'}`} /> : null}
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        {usage ? (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-white/70 whitespace-nowrap">
              {formatSize(usage.usedBytes)} {usage.limitBytes === null ? '/ Unlimited' : ` / ${formatSize(usage.limitBytes)}`}
            </div>
            <div className="w-28">
              <Progress value={usage.percentUsed || 0} />
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="hidden md:inline-flex" onClick={()=>{ const parent = path.split('/').slice(0, -1).join('/'); navigate(parent); }} disabled={!path}>Back</Button>
          <input ref={uploadRef} type="file" multiple hidden onChange={(e)=>{ const files = Array.from(e.target.files || []); if (files.length) onUpload(files as File[]); e.currentTarget.value=''; }} />
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async()=>{ await refresh(undefined, { force: true }); setTreeVersion(v=>v+1); }}
              disabled={refreshing}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCcw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" aria-label="Open controls">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem disabled={uploading || isManagedPath} onSelect={()=>{ uploadRef.current?.click(); }}>Upload</DropdownMenuItem>
                <DropdownMenuItem onSelect={async()=>{ if (path === 'vehicles' || (path || '').startsWith('vehicles/')) { toast.info('The vehicles folder is managed automatically. Select a specific vehicle to manage its photos.'); return; } if (path === 'designer_masks' || (path || '').startsWith('designer_masks/')) { toast.info('Designer masks are managed automatically.'); return; } const name = await promptToast({ title: 'New folder name' }); if (!name) return; await fetch('/api/storage/folder', { method:'POST', body: JSON.stringify({ path: path ? `${path}/${name}` : name, scope }) }); await refresh(undefined, { force: true }); setTreeVersion(v=>v+1); }}>New folder</DropdownMenuItem>
                <DropdownMenuItem disabled={sortedItems.length === 0} onSelect={()=>{ setSelectedKeys(new Set(sortedItems.map(it => itemStorageKey(it)))); }}>Select all</DropdownMenuItem>
                <DropdownMenuItem onSelect={()=>setView(v=>v==='list'?'icons':'list')}>{view==='list' ? 'Icon view' : 'List view'}</DropdownMenuItem>
                {selectedCount > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={isManagedPath} onSelect={onBulkDelete}>Delete selected</DropdownMenuItem>
                    <DropdownMenuItem onSelect={clearSelection}>Clear selection</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {path === 'vehicles' || path.startsWith('vehicles/') ? (
            <div className="ml-2 text-xs px-2 py-1 rounded-md bg-white/5 border border-red-500 text-red-400">
              Managed folder. Add photos via Edit Profile &rarr; select a vehicle.
            </div>
          ) : path === 'designer_masks' || path.startsWith('designer_masks/') ? (
            <div className="ml-2 text-xs px-2 py-1 rounded-md bg-white/5 border border-red-500 text-red-400">
              Managed folder. Masks are auto-saved for reuse. You can delete them.
            </div>
          ) : null}
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs().map((c, i, arr) => (
              <Fragment key={`crumb-${c.value || 'root'}`}>
                <BreadcrumbItem key={`item-${c.value || 'root'}`}>
                  {i === arr.length - 1 ? (
                    <BreadcrumbPage className="text-primary">{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href="#" onClick={(e)=>{ e.preventDefault(); navigate(c.value); }}>{c.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {i < arr.length - 1 ? <BreadcrumbSeparator key={`sep-${c.value || 'root'}`} /> : null}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={()=>{ const parent = path.split('/').slice(0, -1).join('/'); navigate(parent); }} disabled={!path} aria-label="Go back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button size="sm" onClick={()=>uploadRef.current?.click()} disabled={uploading || isManagedPath}>Upload</Button>
          <input ref={uploadRef} type="file" multiple hidden onChange={(e)=>{ const files = Array.from(e.target.files || []); if (files.length) onUpload(files as File[]); e.currentTarget.value=''; }} />
          <Button size="sm" variant="outline" onClick={async()=>{ if (path === 'vehicles' || (path || '').startsWith('vehicles/')) { toast.info('The vehicles folder is managed automatically. Select a specific vehicle to manage its photos.'); return; } if (path === 'designer_masks' || (path || '').startsWith('designer_masks/')) { toast.info('Designer masks are managed automatically.'); return; } const name = await promptToast({ title: 'New folder name' }); if (!name) return; await fetch('/api/storage/folder', { method:'POST', body: JSON.stringify({ path: path ? `${path}/${name}` : name, scope }) }); await refresh(undefined, { force: true }); setTreeVersion(v=>v+1); }}>New Folder</Button>
          <Button size="sm" variant="outline" onClick={()=>{ setSelectedKeys(new Set(sortedItems.map(it => itemStorageKey(it)))); }} disabled={sortedItems.length === 0}>Select all</Button>
          <Button size="sm" variant="outline" onClick={()=>setView(v=>v==='list'?'icons':'list')} aria-label={view==='list' ? 'Switch to icon view' : 'Switch to list view'} title={view==='list' ? 'Icon view' : 'List view'}>
            {view==='list' ? (<LayoutGrid className="w-4 h-4" />) : (<ListIcon className="w-4 h-4" />)}
          </Button>
          <Button size="sm" variant="outline" onClick={async()=>{ await refresh(undefined, { force: true }); setTreeVersion(v=>v+1); }} disabled={refreshing} aria-label="Refresh" title="Refresh">
            <RefreshCcw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </Button>
          {selectedCount > 0 ? (
            <div className="ml-2 flex items-center gap-2">
              <div className="text-xs text-white/70">{selectedCount} selected</div>
              <Button size="sm" variant="destructive" onClick={onBulkDelete} disabled={isManagedPath}>Delete</Button>
              <Button size="sm" variant="outline" onClick={clearSelection}>Clear</Button>
            </div>
          ) : null}
          {path === 'vehicles' || path.startsWith('vehicles/') ? (
            <div className="ml-2 text-xs px-2 py-1 rounded-md bg-white/5 border border-red-500 text-red-400">
              Managed folder. Add photos via Edit Profile → select a vehicle.
            </div>
          ) : path === 'designer_masks' || path.startsWith('designer_masks/') ? (
            <div className="ml-2 text-xs px-2 py-1 rounded-md bg-white/5 border border-red-500 text-red-400">
              Managed folder. Masks are auto-saved for reuse. You can delete them.
            </div>
          ) : null}
        </div>
      </div>

      {uploading ? (
        <div className="border border-[color:var(--border)] rounded-md p-3 bg-black/40">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm">
              Uploading{uploadCurrentName ? `: ${uploadCurrentName}` : '…'}
            </div>
            <div className="text-xs text-white/70">
              {uploadUnitsDone}/{uploadUnitsTotal}
            </div>
          </div>
          <Progress value={uploadPercent} />
          <div className="mt-2 flex items-center justify-end">
            <Button size="sm" variant="destructive" onClick={()=>{ cancelRequestedRef.current = true; try { activeXHRRef.current?.abort(); } catch {} }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-3 min-h-0">
        <aside className="hidden md:block md:col-span-4 border border-[color:var(--border)] rounded-lg p-2 bg-[var(--card)] min-h-0 overflow-hidden">
          <div className="text-sm font-semibold px-2 py-1">Explorer</div>
          {usage ? (
            <div className="px-2 pb-2">
              {usage.limitBytes === null ? (
                <div className="text-xs text-white/70">Storage: Unlimited</div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs text-white/70">
                    {formatSize(usage.usedBytes)} / {formatSize(usage.limitBytes)}
                    {typeof usage.percentUsed === 'number' ? (
                      <span className="ml-2 text-white/50">{usage.percentUsed}% used</span>
                    ) : null}
                  </div>
                  <Progress value={usage.percentUsed || 0} />
                </div>
              )}
            </div>
          ) : null}
          <div className="h-[60vh] overflow-y-auto overflow-x-hidden">
            <R2FileTree
              refreshKey={treeVersion}
              scope={scope}
              selectedKeys={selectedKeys}
              onNavigate={(p)=>{ setPath(p); refresh(p); }}
              onFileSelect={(k)=>{ setSelectedKeys(new Set([k])); }}
              onOpenFile={async (k)=>{
                try {
                  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(k);
                  const url = await getViewUrl(k, scope);
                  if (!url) return;
                  if (isImage) setPreview({ url, name: k.split('/').pop() || k, key: k }); else window.open(url, '_blank', 'noopener,noreferrer');
                } catch {}
              }}
              onMove={async (sourceKey, destPath) => {
                await fetch('/api/storage/rename', { method:'POST', body: JSON.stringify({ sourceKey, targetKey: destPath, isFolder: false, scope }) });
                await refresh();
                setTreeVersion(v=>v+1);
              }}
            />
          </div>
        </aside>
        <section className="col-span-12 md:col-span-8 border border-[color:var(--border)] rounded-lg p-0 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto relative" ref={contentRef} onPointerDown={beginMarquee} onPointerMove={onMarqueeMove} onPointerUp={endMarquee}>
            <DropZone cover onDrop={onUpload} className="rounded-none border-0" />
            {selectionRect ? (
              <div
                className="pointer-events-none fixed z-50 border border-[color:var(--border)] bg-[color:var(--primary)]/10"
                style={{
                  left: `${Math.min(selectionRect.x, selectionRect.x + selectionRect.w)}px`,
                  top: `${Math.min(selectionRect.y, selectionRect.y + selectionRect.h)}px`,
                  width: `${Math.abs(selectionRect.w)}px`,
                  height: `${Math.abs(selectionRect.h)}px`,
                }}
              />
            ) : null}
            {isFetching ? (
              view === 'list' ? (
                <div className="p-3">
                  <div className="space-y-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={`sk-row-${i}`} className="grid grid-cols-[24px_1fr_120px_180px_120px] gap-2 items-center px-3 py-2">
                        <div className="flex items-center justify-center">
                          <Skeleton className="size-4" />
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Skeleton className="size-4" />
                          <Skeleton className="h-4 w-48" />
                        </div>
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-28" />
                        <div className="flex justify-end">
                          <Skeleton className="h-6 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={`sk-icon-${i}`} className="p-2 flex flex-col items-center">
                        <div className="w-full aspect-square rounded-md overflow-hidden">
                          <Skeleton className="w-full h-full" />
                        </div>
                        <Skeleton className="h-3 w-20 mt-2" />
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : items.length === 0 ? (
              <div className="h-full grid place-items-center text-center p-6">
                <div className="text-white/80 font-medium">This folder is empty</div>
                {path === 'vehicles' || path.startsWith('vehicles/') ? (
                  <div className="text-white/60 text-sm mt-2 max-w-lg mx-auto grid gap-2">
                    <div className="inline-flex items-center gap-2 justify-center text-white/80">
                      <svg className="size-4 text-amber-300" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l10 19H2L12 2zm0 4.8L5.6 19h12.8L12 6.8zM11 10h2v4h-2v-4zm0 6h2v2h-2v-2z"/></svg>
                      <span>Vehicles is auto‑managed. You can&apos;t upload here directly.</span>
                    </div>
                    <div>
                      Add photos in Edit Profile under a specific vehicle. We&apos;ll create subfolders like <span className="font-mono">/vehicles/&lt;car&gt;</span> for you.
                    </div>
                  </div>
                ) : (
                  <div className="text-white/50 text-sm mt-1">Create a new folder or upload files</div>
                )}
              </div>
            ) : (
              <div className="text-sm">
                {view === 'list' ? (
                <>
                <div className="sticky top-0 z-10 bg-black/20 backdrop-blur supports-[backdrop-filter]:bg-black/10 border-b border-[color:var(--border)] px-3 py-1 grid grid-cols-[24px_1fr_120px_180px_120px] gap-2">
                  <div className="flex items-center">
                    <Checkbox
                      checked={selectedKeys.size > 0 && selectedKeys.size === sortedItems.length ? true : (selectedKeys.size === 0 ? false : "indeterminate")}
                      onCheckedChange={(v)=>{ if (v === true) setSelectedKeys(new Set(sortedItems.map(it => itemStorageKey(it)))); else clearSelection(); }}
                      aria-label="Select all"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="text-left hover:underline" onClick={()=>updateSort('name')}>Name {sortBy==='name' ? (sortDir==='asc' ? '▴' : '▾') : ''}</button>
                    <button className="text-xs px-2 py-0.5 rounded hover:bg-white/10" onClick={()=> setSelectedKeys(new Set(sortedItems.map(it=>itemStorageKey(it)))) }>Select All</button>
                    <button className="text-xs px-2 py-0.5 rounded hover:bg-white/10" onClick={clearSelection}>Clear</button>
                  </div>
                  <button className="text-left hover:underline" onClick={()=>updateSort('size')}>Size {sortBy==='size' ? (sortDir==='asc' ? '▴' : '▾') : ''}</button>
                  <button className="text-left hover:underline" onClick={()=>updateSort('modified')}>Modified {sortBy==='modified' ? (sortDir==='asc' ? '▴' : '▾') : ''}</button>
                  <div className="text-right pr-2">Actions</div>
            </div>
                <ul className="divide-y">
                  {sortedItems.map((it) => {
                    const isReservedHooksRoot = it.type === 'folder' && it.name === 'hooks' && !path;
                    const isManagedContext = isManagedPath;
                    const k = itemStorageKey(it);
                    const checked = isSelectedKey(k);
                    return (
                    <li key={(it.key || it.name)} data-sk={k} className={cn("grid grid-cols-[24px_1fr_120px_180px_120px] gap-2 items-center px-3 py-2 hover:bg-white/5", checked && "bg-white/5")} onDoubleClick={()=>{ if (it.type==='folder') navigate(path ? `${path}/${it.name}` : it.name); }}
                      onClick={(ev)=>{
                        // Modifier-based selection
                        const idx = sortedItems.findIndex(x => x === it);
                        if (ev.shiftKey) {
                          // Select range from last selected to current
                          const allKeys = sortedItems.map(itemStorageKey);
                          const selectedArray = Array.from(selectedKeys);
                          const lastKey = selectedArray[selectedArray.length - 1];
                          const lastIdx = lastKey ? allKeys.indexOf(lastKey) : -1;
                          const start = lastIdx >= 0 ? Math.min(lastIdx, idx) : 0;
                          const end = lastIdx >= 0 ? Math.max(lastIdx, idx) : idx;
                          const range = allKeys.slice(start, end + 1);
                          setSelectedKeys(new Set(range));
                        } else if (ev.ctrlKey || ev.metaKey) {
                          toggleKey(k, !checked);
                        } else {
                          // Click: open folders when not dragging
                          if (it.type === 'folder' && !selectingRef.current) {
                            if (it.name !== (path.split('/').pop() || '')) navigate(path ? `${path}/${it.name}` : it.name);
                          } else {
                            setSelectedKeys(new Set([k]));
                          }
                        }
                      }}
                    >
                      <div className="flex items-center justify-center">
                        <Checkbox checked={checked} onCheckedChange={(v)=>toggleKey(k, v)} aria-label={`Select ${it.name}`} />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Icon */}
                        {renderTypeIcon(it.name, it.type==='folder')}
                        <button className="truncate text-left" onClick={async()=>{
                          if (it.type === 'folder') { if (it.name !== (path.split('/').pop() || '')) navigate(path ? `${path}/${it.name}` : it.name); return; }
                          const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                          const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(it.name);
                          const url = await getViewUrl(key, scope);
                          if (!url) return;
                          if (isImage) setPreview({ url, name: it.name, key }); else window.open(url, '_blank', 'noopener,noreferrer');
                        }}>{it.name}</button>
                      </div>
                      <div className="text-white/60">{it.type==='file' ? formatSize(it.size) : '—'}</div>
                      <div className="text-white/60">{it.lastModified ? new Date(it.lastModified).toLocaleString() : '—'}</div>
                      <div className="flex items-center gap-2 justify-end">
                        <ContextMenu onOpenChange={setContextMenuOpen}>
                          <ContextMenuTrigger asChild>
                            <button className="text-xs px-2 py-1 rounded hover:bg-white/10">Actions</button>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            <ContextMenuLabel>{it.name}</ContextMenuLabel>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={async()=>{
                              if (it.type === 'folder') { navigate(path ? `${path}/${it.name}` : it.name); return; }
                              const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                              const isImage = /(\.png|\.jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(it.name);
                              const url = await getViewUrl(key, scope);
                              if (!url) return;
                              if (isImage) setPreview({ url, name: it.name, key }); else window.open(url, '_blank', 'noopener,noreferrer');
                            }}>Open</ContextMenuItem>
                            {it.type==='file' ? (
                              <ContextMenuItem onSelect={()=>{
                                const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                const scopeParam = scope === 'admin' ? `&scope=admin` : '';
                                const a = document.createElement('a');
                                a.href = `/api/storage/file?key=${encodeURIComponent(key)}${scopeParam}&download=1`;
                                a.download = it.name || `file-${Date.now()}`;
                                document.body.appendChild(a);
                                a.click();
                                setTimeout(()=>{ try{ document.body.removeChild(a);}catch{} }, 1000);
                              }}>Download</ContextMenuItem>
                            ) : null}
                            {it.type==='file' && /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(it.name) ? (
                              <>
                                <ContextMenuItem onSelect={()=>{ const key = it.key || `${path ? `${path}/` : ''}${it.name}`; setDesignKey(key); setDesignOpen(true); }}>Open in Designer</ContextMenuItem>
                                  <ContextMenuItem onSelect={async()=>{
                                  // Comment out plan check - all users now have video generation access
                                  // if (canonicalPlan(me?.plan) !== 'ultra') { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} return; }
                                  const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                  await doUpscale(key);
                                  }}>Upscale</ContextMenuItem>
                              </>
                            ) : null}
                            {it.type==='file' && /\.(mp4|mov|webm|avi|mkv)$/i.test(it.name) ? (
                              <>
                                {(() => {
                                  // Hide upscale button if video is already at max resolution or already upscaled
                                  if (it.name.includes('upscaled') || it.name.includes('2x')) return null;
                                  
                                  // Check if video dimensions are at or above max (1080p smaller dim, 1920p larger dim)
                                  const w = it.width || 0;
                                  const h = it.height || 0;
                                  if (w > 0 && h > 0) {
                                    const largerDim = Math.max(w, h);
                                    const smallerDim = Math.min(w, h);
                                    // Hide if already at or above max resolution
                                    if (smallerDim >= 1080 || largerDim >= 1920) return null;
                                  }
                                  
                                  return (
                                    <ContextMenuItem 
                                      disabled={videoUpscaleBusy}
                                      onSelect={async()=>{
                                        // Comment out plan check - all users now have video generation access
                                        // if (canonicalPlan(me?.plan) !== 'ultra') { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} return; }
                                        const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                        await doVideoUpscale(key);
                                      }}
                                    >
                                      {videoUpscaleBusy ? 'Upscaling...' : 'Upscale'}
                                    </ContextMenuItem>
                                  );
                                })()}
                                {/* TEMPORARILY DISABLED - Make Smoother Feature */}
                                {/* {(it.name.includes('upscaled') || it.name.includes('2x')) && !it.name.includes('60fps') && !it.name.includes('interpolated') ? (
                                  <ContextMenuItem 
                                    disabled={videoInterpolateBusy}
                                    onSelect={async()=>{
                                      // Comment out plan check - all users now have video generation access
                                      // if (canonicalPlan(me?.plan) !== 'ultra') { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} return; }
                                      const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                      await doVideoInterpolate(key);
                                    }}
                                  >
                                    {videoInterpolateBusy ? 'Processing...' : 'Make Smoother (60fps)'}
                                  </ContextMenuItem>
                                ) : null} */}
                              </>
                            ) : null}
                            {!isReservedHooksRoot ? (
                              !(isManagedContext) ? (
                                <ContextMenuItem onSelect={()=>{ onDelete(it); setTreeVersion(v=>v+1); }}>Delete</ContextMenuItem>
                              ) : (
                                <ContextMenuItem disabled className="cursor-default pointer-events-none opacity-60">Managed folder</ContextMenuItem>
                              )
                            ) : (
                              <ContextMenuItem disabled>Reserved folder</ContextMenuItem>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      </div>
                    </li>
                  );})}
                </ul>
                </>
                ) : (
                  <div className="p-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                      {sortedItems.map((it) => {
                        const isReservedHooksRoot = it.type === 'folder' && it.name === 'hooks' && !path;
                        const isManagedContext = isManagedPath;
                        const isImage = /(\.png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(it.name);
                        const isVideo = /(\.mp4|\.mov|\.webm|\.avi|\.mkv)$/i.test(it.name);
                        const k = itemStorageKey(it);
                        const checked = isSelectedKey(k);
                        return (
                          <ContextMenu key={(it.key || it.name)} onOpenChange={setContextMenuOpen}>
                            <ContextMenuTrigger asChild disabled={(it as ItemWithTag).isUpscaling}>
                              <div
                                data-sk={k}
                                className={cn("group select-none p-2 flex flex-col items-center relative", (it as ItemWithTag).isUpscaling ? "cursor-default opacity-75" : "cursor-pointer", checked && "ring-1 ring-primary/60 rounded-md")}
                                onDoubleClick={()=>{ if ((it as ItemWithTag).isUpscaling) return; if (it.type==='folder') navigate(path ? `${path}/${it.name}` : it.name); }}
                                onClick={async(ev)=>{
                                  if ((it as ItemWithTag).isUpscaling) { ev.preventDefault(); ev.stopPropagation(); return; }
                                  // Selection with modifiers
                                  const kLocal = k;
                                  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    if (ev.shiftKey) {
                                      const allKeys = sortedItems.map(itemStorageKey);
                                      const selectedArray = Array.from(selectedKeys);
                                      const lastKey = selectedArray[selectedArray.length - 1];
                                      const lastIdx = lastKey ? allKeys.indexOf(lastKey) : -1;
                                      const idx = allKeys.indexOf(kLocal);
                                      const start = lastIdx >= 0 ? Math.min(lastIdx, idx) : 0;
                                      const end = lastIdx >= 0 ? Math.max(lastIdx, idx) : idx;
                                      const range = allKeys.slice(start, end + 1);
                                      setSelectedKeys(new Set(range));
                                    } else {
                                      toggleKey(kLocal, !checked);
                                    }
                                    return;
                                  }
                                  if (selectingRef.current) { ev.preventDefault(); ev.stopPropagation(); return; }
                                  if (it.type==='folder') { if (it.name !== (path.split('/').pop() || '')) navigate(path ? `${path}/${it.name}` : it.name); return; }
                                  const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                  const url = await getViewUrl(key, scope);
                                  if (!url) return;
                                  if (isImage) setPreview({ url, name: it.name, key }); else window.open(url, '_blank', 'noopener,noreferrer');
                                }}
                              >
                                {!(it as ItemWithTag).isUpscaling ? (
                                  <div className="absolute left-2 top-2 z-10" onClick={(e)=>{ e.stopPropagation(); }} onPointerDown={(e)=>{ e.stopPropagation(); }}>
                                    <Checkbox checked={checked} onCheckedChange={(v)=>toggleKey(k, v)} aria-label={`Select ${it.name}`} />
                                  </div>
                                ) : null}
                                {it.type==='folder' ? (
                                  <FolderIconFancy size={0.85} color="#8EA2FF" />
                                ) : (
                                  <div className="aspect-square w-full rounded-md bg-black/20 grid place-items-center overflow-hidden relative">
                                    {(it as ItemWithTag).isUpscaling ? (
                                      <div className="w-full h-full grid place-items-center">
                                        <div className="flex flex-col items-center gap-2">
                                          <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0a12 12 0 00-8 20l-2-3.464A8 8 0 014 12z"></path>
                                          </svg>
                                          <span className="text-xs text-indigo-400">Upscaling...</span>
                                        </div>
                                      </div>
                                    ) : isImage ? (
                                      <div className="w-full h-full"><ImageThumb storageKey={it.key || `${path ? `${path}/` : ''}${it.name}`} alt={it.name} url={viewUrls[(it.key || `${path ? `${path}/` : ''}${it.name}`)] || null} blurhash={it.blurhash} /></div>
                                    ) : isVideo ? (
                                      <VideoThumb storageKey={it.key || `${path ? `${path}/` : ''}${it.name}`} alt={it.name} url={viewUrls[(it.key || `${path ? `${path}/` : ''}${it.name}`)] || null} blurhash={it.blurhash} />
                                    ) : (
                                      <svg className="size-10 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" d="M7 21h10a2 2 0 0 0 2-2V9.5L12.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/></svg>
                                    )}
                                  </div>
                                )}
                                <div className="mt-2 text-xs text-center w-full max-w-32 truncate" title={it.name}>{it.name}</div>
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-48">
                              <ContextMenuLabel>{it.name}</ContextMenuLabel>
                              <ContextMenuSeparator />
                              <ContextMenuItem onSelect={async()=>{
                                if (it.type === 'folder') { navigate(path ? `${path}/${it.name}` : it.name); return; }
                                const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                const isImage = /(\.png|\.jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(it.name);
                                const url = await getViewUrl(key, scope);
                                if (!url) return;
                                if (isImage) setPreview({ url, name: it.name, key }); else window.open(url, '_blank', 'noopener,noreferrer');
                              }}>Open</ContextMenuItem>
                              {it.type==='file' ? (
                                <ContextMenuItem onSelect={()=>{
                                  const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                  const scopeParam = scope === 'admin' ? `&scope=admin` : '';
                                  const a = document.createElement('a');
                                  a.href = `/api/storage/file?key=${encodeURIComponent(key)}${scopeParam}&download=1`;
                                  a.download = it.name || `file-${Date.now()}`;
                                  document.body.appendChild(a);
                                  a.click();
                                  setTimeout(()=>{ try{ document.body.removeChild(a);}catch{} }, 1000);
                                }}>Download</ContextMenuItem>
                              ) : null}
                              {it.type==='file' && /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(it.name) ? (
                                <>
                                  <ContextMenuItem onSelect={()=>{ const key = it.key || `${path ? `${path}/` : ''}${it.name}`; setDesignKey(key); setDesignOpen(true); }}>Open in Designer</ContextMenuItem>
                                  <ContextMenuItem onSelect={async()=>{
                                    // All users now have upscale access
                                    const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                    // Check credits before attempting upscale
                                    const bal = await getCredits();
                                    const insufficientCredits = creditDepletion.checkAndTrigger(bal, 20);
                                    if (insufficientCredits) return;
                                    await doUpscale(key);
                                  }}>Upscale</ContextMenuItem>
                                </>
                              ) : null}
                              {it.type==='file' && /\.(mp4|mov|webm|avi|mkv)$/i.test(it.name) ? (
                                <>
                                  {(() => {
                                    // Hide upscale button if video is already at max resolution or already upscaled
                                    if (it.name.includes('upscaled') || it.name.includes('2x')) return null;
                                    
                                    // Check if video dimensions are at or above max (1080p smaller dim, 1920p larger dim)
                                    const w = it.width || 0;
                                    const h = it.height || 0;
                                    if (w > 0 && h > 0) {
                                      const largerDim = Math.max(w, h);
                                      const smallerDim = Math.min(w, h);
                                      // Hide if already at or above max resolution
                                      if (smallerDim >= 1080 || largerDim >= 1920) return null;
                                    }
                                    
                                    return (
                                      <ContextMenuItem 
                                        disabled={videoUpscaleBusy}
                                        onSelect={async()=>{
                                          // Comment out plan check - all users now have video generation access
                                          // if (canonicalPlan(me?.plan) !== 'ultra') { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} return; }
                                          const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                          await doVideoUpscale(key);
                                        }}
                                      >
                                        {videoUpscaleBusy ? 'Upscaling...' : 'Upscale'}
                                      </ContextMenuItem>
                                    );
                                  })()}
                                  {/* TEMPORARILY DISABLED - Make Smoother Feature */}
                                  {/* {(it.name.includes('upscaled') || it.name.includes('2x')) && !it.name.includes('60fps') && !it.name.includes('interpolated') ? (
                                    <ContextMenuItem 
                                      disabled={videoInterpolateBusy}
                                      onSelect={async()=>{
                                        // Comment out plan check - all users now have video generation access
                                        // if (canonicalPlan(me?.plan) !== 'ultra') { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} return; }
                                        const key = it.key || `${path ? `${path}/` : ''}${it.name}`;
                                        await doVideoInterpolate(key);
                                      }}
                                    >
                                      {videoInterpolateBusy ? 'Processing...' : 'Make Smoother (60fps)'}
                                    </ContextMenuItem>
                                  ) : null} */}
                                </>
                              ) : null}
                              {!isReservedHooksRoot ? (
                                !(isManagedContext) ? (
                                  <ContextMenuItem onSelect={()=>{ onDelete(it); setTreeVersion(v=>v+1); }}>Delete</ContextMenuItem>
                                ) : (
                                  <ContextMenuItem disabled className="cursor-default pointer-events-none opacity-60">Managed folder</ContextMenuItem>
                                )
                              ) : (
                                <ContextMenuItem disabled>Reserved folder</ContextMenuItem>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      {preview ? (
        <div className="fixed inset-0 bg-black/70 grid place-items-center z-[12000]" onClick={()=>setPreview(null)}>
          <div className="bg-[var(--popover)] rounded-lg p-3 max-w-[90vw] max-h-[85vh]" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm font-medium truncate">{preview.name}</div>
              <button className="text-xs px-2 py-1 rounded hover:bg-white/10" onClick={()=>setPreview(null)}>Close</button>
            </div>
            <div className="grid place-items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={(previewVariants[activePreviewVariantIndex]?.url || preview.url)} alt={preview.name} className="max-w-full max-h-[70vh] rounded" />
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {previewVariants.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">{previewVariants[activePreviewVariantIndex]?.name || 'Original'}<span className="ml-1 opacity-80">▾</span></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-40">
                      {previewVariants.map((v, idx) => (
                        <DropdownMenuItem key={`${v.key || 'original'}-${idx}`} onSelect={()=> setActivePreviewVariantIndex(idx)}>
                          {v.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                <ElectricBorder color="#6366f1" speed={1} chaos={0.6} thickness={2} className="w-full sm:w-auto rounded-md">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={upscaleBusy}
                    onClick={async()=>{
                      // All users now have upscale access
                      if (!preview?.key) return;
                      // Check credits before attempting upscale
                      const bal = await getCredits();
                      const insufficientCredits = creditDepletion.checkAndTrigger(bal, 20);
                      if (insufficientCredits) return;
                      await doUpscale(preview.key);
                    }}
                  >
                    {upscaleBusy ? 'Upscaling…' : 'Upscale'}
                  </Button>
                </ElectricBorder>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={()=>{ if (!preview?.key) return; setDesignKey(preview.key); setDesignOpen(true); }}
                >
                  Open in Designer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={()=>{
                  const active = previewVariants[activePreviewVariantIndex];
                  const key = (active?.key || preview.key);
                  const scopeParam = scope === 'admin' ? `&scope=admin` : '';
                  const a = document.createElement('a');
                  if (key) {
                    a.href = `/api/storage/file?key=${encodeURIComponent(key)}${scopeParam}&download=1`;
                    a.download = (key.split('/').pop() || preview.name || `image-${Date.now()}`);
                  } else {
                    // Fallback to direct URL if no key (should not happen for workspace files)
                    a.href = (active?.url || preview.url);
                    a.download = preview.name || `image-${Date.now()}`;
                  }
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(()=>{ try{ document.body.removeChild(a);}catch{} }, 1000);
                  }}
                  aria-label="Download"
                  title="Download"
                >
                  <Download className="size-4" aria-hidden />
                  <span>Download</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <Dialog open={designOpen} onOpenChange={(o)=>{ setDesignOpen(o); if (!o) { setDesignKey(null); setDesignProjectState(null); setPreview(null); } }}>
        <DialogContent className="p-2 sm:p-6 sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-[54vw]">
          <DialogHeader>
            <DialogTitle>Designer</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {designKey ? (
              <Designer
                bgKey={designProjectState?.backgroundKey || designKey}
                rembg={{ enabled: !designProjectState }} // Skip rembg if we have project state
                isolateCutout={{ mode: 'user_choice', defaultEnabled: false }} // Let user choose in workspace
                projectState={designProjectState}
                onClose={()=> { setDesignOpen(false); setPreview(null); }}
                onSave={saveDesignToWorkspace}
                onReplaceBgKey={(newKey)=>{ try { if (newKey) { setDesignKey(newKey); } } catch {} }}
                showAnimate={(() => { 
                  try { 
                    const name = (designKey || '').split('/').pop() || ''; 
                    const m = name.match(/^[0-9T\-:.]+-([a-z0-9\-]+)/i);
                    if (!m || !m[1]) return false;
                    const slug = m[1].toLowerCase();
                    return videoTemplates.has(slug);
                  } catch { return false; } 
                })()}
                onAnimate={async (getBlob)=>{
                  try {
                    // Comment out plan check - all users now have video generation access
                    // if (canonicalPlan(me?.plan) !== 'ultra') { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} return; }
                    // Upload current canvas to workspace as start frame
                    const blob = await getBlob();
                    if (!blob) return;
                    const filename = `design-${Date.now()}.png`;
                    const file = new File([blob], filename, { type: 'image/png' });
                    const form = new FormData(); form.append('file', file, filename); form.append('path', 'library');
                    const up = await fetch('/api/storage/upload', { method: 'POST', body: form });
                    const dj = await up.json().catch(()=>({}));
                    const key = typeof dj?.key === 'string' ? String(dj.key) : '';
                    if (!key) { toast.error('Failed to prepare animation'); return; }
                    // Check credits before video generation (default estimate ~500 credits for typical video)
                    const bal = await getCredits();
                    const estimatedCredits = 500; // Conservative estimate
                    const insufficientCredits = creditDepletion.checkAndTrigger(bal, estimatedCredits);
                    if (insufficientCredits) return;
                    // Attempt to infer template slug from the filename prefix of the original key
                    let slug: string | undefined = undefined;
                    try {
                      const name = (designKey || '').split('/').pop() || '';
                      const m = name.match(/^[0-9T\-:.]+-([a-z0-9\-]+)/i);
                      if (m && m[1]) slug = m[1].toLowerCase();
                    } catch {}
                    
                    // Build variables for token replacement in video prompts (same as image generation)
                    const variables: Record<string, string> = {};
                    // Try to extract vehicle data from user's profile
                    // Use first vehicle if available, or try to match based on filename
                    if (profileVehicles.length > 0) {
                      const v = profileVehicles[0]; // For now, use first vehicle; could be enhanced to match by filename
                      const brand = v.make || '';
                      const model = v.model || '';
                      const cf = v.colorFinish || '';
                      const acc = v.accents || '';
                      const combo = acc ? `${cf} with ${acc}` : cf;
                      if (brand) {
                        variables.BRAND = brand;
                        variables.MAKE = brand;
                        variables.BRAND_CAPS = brand.toUpperCase();
                      }
                      if (model) variables.MODEL = model;
                      if (cf) variables.COLOR_FINISH = cf;
                      if (acc) variables.ACCENTS = acc;
                      if (combo) variables.COLOR_FINISH_ACCENTS = combo;
                    }
                    
                    // Start async video generation
                    const resp = await fetch('/api/templates/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateSlug: slug, startKey: key, variables }) });
                    const out = await resp.json().catch(()=>({}));
                    if (resp.status === 402) { const bal = await getCredits(); creditDepletion.checkAndTrigger(bal, estimatedCredits); return; }
                    if (!resp.ok || !out?.jobId) { toast.error(out?.error || 'Video generation failed to start.'); return; }
                    
                    const jobId = out.jobId;
                    toast.success('Video generation started! This may take a few minutes...');
                    
                    // Poll for completion
                    const pollInterval = 3000; // Poll every 3 seconds
                    const maxPolls = 200; // Max 10 minutes (200 * 3s = 600s)
                    let pollCount = 0;
                    
                    const poll = async (): Promise<void> => {
                      if (pollCount >= maxPolls) {
                        toast.error('Video generation timed out. Please check your library later.');
                        return;
                      }
                      pollCount++;
                      
                      try {
                        const statusResp = await fetch(`/api/templates/video/status?jobId=${encodeURIComponent(jobId)}`);
                        const statusData = await statusResp.json().catch(()=>({}));
                        
                        if (statusResp.status === 402) {
                          const bal = await getCredits();
                          creditDepletion.checkAndTrigger(bal, estimatedCredits);
                          return;
                        }
                        
                        if (statusData.status === 'completed') {
                          const outKey = String(statusData.key || '');
                          const name = outKey ? (outKey.split('/').pop() || 'video.mp4') : 'video.mp4';
                          setPreview({ url: String(statusData.url), name, key: outKey });
                          await refresh(undefined, { force: true });
                          setTreeVersion(v=>v+1);
                          toast.success('Video generated successfully!');
                          return;
                        }
                        
                        if (statusData.status === 'failed') {
                          toast.error(statusData.error || 'Video generation failed.');
                          return;
                        }
                        
                        // Still pending or processing - continue polling
                        setTimeout(poll, pollInterval);
                      } catch (pollErr) {
                        console.error('Error polling video status:', pollErr);
                        setTimeout(poll, pollInterval);
                      }
                    };
                    
                    // Start polling
                    setTimeout(poll, pollInterval);
                  } catch {}
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={upscaleBusy}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Upscaling…</DialogTitle>
          </DialogHeader>
          <div className="p-10 min-h-[16rem] grid place-items-center">
            <div className="flex flex-col items-center gap-3">
              <Lottie animationData={carLoadAnimation as object} loop style={{ width: 280, height: 170 }} />
              <div className="text-sm text-white/80">This may take a moment</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File exists</DialogTitle>
            <DialogDescription>
              &quot;{conflictName}&quot; already exists in <span className="font-medium">/{path || '/'}</span>. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="outline" onClick={()=>{ setReplaceAll(false); setConfirmOpen(false); const files = pendingFilesRef.current || []; pendingFilesRef.current=null; onUpload(files.filter(f=>f.name!==conflictName)); }}>Skip</Button>
            <Button onClick={()=>{ setReplaceAll(true); setConfirmOpen(false); const files = pendingFilesRef.current || []; pendingFilesRef.current=null; onUpload(files); }}>Replace</Button>
            <Button onClick={()=>{ setReplaceAll(true); setConfirmOpen(false); const files = pendingFilesRef.current || []; pendingFilesRef.current=null; onUpload(files); }}>Replace all</Button>
          </div>
        </DialogContent>
      </Dialog>
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

