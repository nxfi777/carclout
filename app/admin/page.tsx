"use client";
import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DashboardWorkspacePanel } from "@/components/dashboard-workspace-panel";
import MusicSuggestions from "@/components/music/music-suggestions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
// import { DropZone } from "@/components/ui/drop-zone";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, CarFront } from "lucide-react";
import { TemplateCard } from "@/components/templates/template-card";
import { UseTemplateContent } from "@/components/templates/use-template-content";
import { Bar, BarChart, CartesianGrid, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
 
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { confirmToast, promptToast } from "@/components/ui/toast-helpers";
import { AdminTemplateImages } from "@/components/admin/admin-template-images";
import { AdminTemplateVideo, type AdminVideoConfig } from "@/components/admin/admin-template-video";
import Lottie from "lottie-react";
import fireAnimation from "@/public/fire.json";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Image from "next/image";

//

// Shared types used across this admin page
type TemplateVariableDef = {
  key: string;
  label?: string;
  type?: 'text' | 'select' | 'color';
  required?: boolean;
  defaultValue?: string;
  options?: string[];
};

type TemplateDisplay = {
  id?: string;
  name: string;
  description?: string;
  slug?: string;
  thumbnailKey?: string;
  thumbUrl?: string;
  blurhash?: string;
  variables?: TemplateVariableDef[];
  prompt?: string;
  falModelSlug?: string;
  fixedAspectRatio?: boolean;
  aspectRatio?: number;
  allowedImageSources?: Array<'vehicle' | 'user'>;
  proOnly?: boolean;
  status?: 'draft' | 'public';
  maxUploadImages?: number;
  imageSize?: { width: number; height: number } | null;
  favoriteCount?: number;
  // deprecated
  autoOpenDesigner?: boolean;
  adminImageKeys?: string[];
  rembg?: {
    enabled?: boolean;
    model?: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait';
    operating_resolution?: '1024x1024' | '2048x2048';
    output_format?: 'png' | 'webp';
    refine_foreground?: boolean;
    output_mask?: boolean;
  } | null;
  video?: {
    enabled?: boolean;
    provider?: 'seedance' | 'kling2_5' | 'sora2';
    prompt?: string;
    duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
    resolution?: 'auto'|'480p'|'720p'|'1080p';
    aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
    camera_fixed?: boolean;
    seed?: number | null;
    fps?: number;
    previewKey?: string | null;
    allowedDurations?: Array<'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'>;
  } | null;
  designerDefaults?: {
    headline?: string | null;
  } | null;
};

type ChatProfile = {
  name?: string;
  image?: string;
  vehicles?: Array<{ make?: string; model?: string }>;
  photos?: string[];
  bio?: string;
};

//

type CreateTemplatePayload = {
  name: string;
  description?: string;
  prompt: string;
  falModelSlug: string;
  thumbnailKey?: string | null;
  adminImageKeys: string[];
  imageSize?: { width: number; height: number };
  fixedAspectRatio: boolean;
  aspectRatio?: number;
  allowedImageSources: Array<'vehicle' | 'user'>;
  proOnly?: boolean;
  status?: 'draft' | 'public';
  maxUploadImages?: number;
  autoOpenDesigner?: boolean;
  variables: Array<{
    key: string;
    label: string;
    required: boolean;
    type: 'select' | 'color' | 'text';
    options?: string[];
    defaultValue?: string;
  }>;
  video?: {
    enabled?: boolean;
    provider?: 'seedance' | 'kling2_5' | 'sora2';
    prompt?: string;
    duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
    resolution?: 'auto'|'480p'|'720p'|'1080p';
    aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
    camera_fixed?: boolean;
    seed?: number | null;
    fps?: number;
    previewKey?: string | null;
    allowedDurations?: Array<'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'>;
  } | null;
  designerDefaults?: {
    headline?: string | null;
  } | null;
};

//

const _BUILT_IN_TOKENS = new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]);

function AdminPageInner() {
  const [tab, setTab] = useState<"analytics" | "workspace" | "templates" | "music" | "moderation" | "announcements">("analytics");
  const [me, setMe] = useState<{ role?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try { const m = await fetch('/api/me', { cache: 'no-store' }).then(r=>r.json()); setMe({ role: m?.role }); } catch {}
      finally { setChecking(false); }
    })();
  }, []);
  useEffect(() => {
    if (!checking && me?.role !== 'admin') {
      try { router.replace('/dashboard'); } catch {}
    }
  }, [checking, me, router]);
  useEffect(() => {
    const t = String(searchParams?.get('tab') || '').toLowerCase();
    if (t === 'analytics' || t === 'workspace' || t === 'templates' || t === 'music' || t === 'moderation' || t === 'announcements') {
      setTab(t as "analytics" | "workspace" | "templates" | "music" | "moderation" | "announcements");
    } else {
      setTab('analytics');
    }
  }, [searchParams]);
  if (checking || me?.role !== 'admin') return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-6rem)]">
      <Lottie animationData={fireAnimation} loop className="w-24 h-24 -mt-[8vh]" />
    </div>
  );
  return (
    <main className="p-6 space-y-4 bg-[var(--background)]">
      {/* Dock replaces inline tab buttons */}
      {tab === 'analytics' && <AdminAnalyticsTab />}
      {tab === 'workspace' && <DashboardWorkspacePanel scope="admin" />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'music' && <MusicSuggestions admin />}
      {tab === 'moderation' && <ModerationTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}> 
      <AdminPageInner />
    </Suspense>
  );
}
function AdminAnalyticsTab() {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d'|'30d'|'90d'>('30d');
  const [metrics, setMetrics] = useState<{
    totalRevenueUsd: number;
    settledRevenueUsd?: number;
    creditsSpent: number;
    spendingUsers: number;
    payingUsers: number;
    avgUserCostUsd: number;
    avgUserSpendUsd: number;
    subscribers: number;
    proUsers?: number;
    minimumUsers?: number;
    estimatedVendorCostUsd?: number;
    estimatedStripeFeesUsd?: number;
    estimatedProfitUsd?: number;
    settledProfitUsd?: number;
    topupRevenueUsd?: number;
  } | null>(null);
  const [series, setSeries] = useState<Array<{ date: string; revenueUsd: number; creditsSpent: number; costUsd?: number; stripeFeesUsd?: number; profitUsd?: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/analytics?range=${encodeURIComponent(range)}`, { cache: 'no-store' });
        const data = await res.json().catch(()=>({}));
        if (!cancelled && res.ok) {
          setMetrics(data?.metrics || null);
          setSeries(Array.isArray(data?.series) ? data.series : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true };
  }, [range]);

  const chartConfig = {
    revenue: { label: 'Settled revenue (USD)', color: 'oklch(0.769 0.188 70.08)' },
    spend: { label: 'Credits spent', color: 'oklch(0.627 0.265 303.9)' },
    profit: { label: 'Estimated profit (USD)', color: 'oklch(0.723 0.198 148.46)' },
  } as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="size-5" /> Analytics
        </div>
        <Select value={range} onValueChange={(v)=> setRange(v as '7d'|'30d'|'90d')}>
          <SelectTrigger className="h-8 w-[8em]"><SelectValue placeholder="Range" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total revenue</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.totalRevenueUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">subscriptions + top-ups</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top-up revenue</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.topupRevenueUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">collected in selected range</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Settled revenue</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.settledRevenueUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">from credits spent</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Credits spent</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <div className="text-2xl font-semibold">{(metrics?.creditsSpent || 0).toLocaleString()}</div>
            )}
            <div className="text-xs text-white/60">in selected range</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Estimated profit</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.estimatedProfitUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">≈ percentage of total revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Settled profit</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.settledProfitUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">≈ percentage of settled revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Average user settled revenue</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.avgUserCostUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">per active spending user</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Average user settled profit</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <div className="text-2xl font-semibold">
                ${(((metrics?.settledProfitUsd || 0) / Math.max(1, metrics?.spendingUsers || 0)) || 0).toFixed(2)}
              </div>
            )}
            <div className="text-xs text-white/60">per active spending user</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pro users</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-16" /> : <div className="text-2xl font-semibold">{metrics?.proUsers ?? 0}</div>}
            <div className="text-xs text-white/60">active subscriptions</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Minimum users</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-16" /> : <div className="text-2xl font-semibold">{metrics?.minimumUsers ?? 0}</div>}
            <div className="text-xs text-white/60">active subscriptions</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Manage users</CardTitle></CardHeader>
        <CardContent>
          <GrantCreditsForm />
          <div className="mt-4 pt-4 border-t">
            <UserCreditsSearch />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Settled revenue, usage, and profit</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-[repeat(14,minmax(2rem,1fr))] gap-3">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="w-12 h-12 md:w-14 md:h-14 rounded" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-[16/7]">
              <ResponsiveContainer>
                <BarChart data={series} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltipContent />} />
                  <Bar dataKey="revenueUsd" name="revenue" fill="var(--color-revenue)" radius={4} />
                  <Line type="monotone" dataKey="creditsSpent" name="spend" strokeWidth={2} stroke="var(--color-spend)" dot={false} />
                  <Line type="monotone" dataKey="profitUsd" name="profit" strokeWidth={2} stroke="var(--color-profit)" dot={false} />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GrantCreditsForm(){
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("admin_grant");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input value={email} onChange={(e)=> setEmail(e.target.value)} placeholder="target email" />
        <Input value={amount} onChange={(e)=> setAmount(e.target.value)} placeholder="credits (+/-)" />
        <Input value={reason} onChange={(e)=> setReason(e.target.value)} placeholder="reason" />
      </div>
      <div className="flex items-center gap-2">
        <Button disabled={busy} onClick={async()=>{
          const n = Math.trunc(Number(amount));
          if (!email || !Number.isFinite(n) || n === 0) { toast.error('Enter target email and non-zero credits'); return; }
          setBusy(true);
          try {
            const res = await fetch('/api/admin/credits', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email, credits: n, reason }) });
            const data = await res.json().catch(()=>({}));
            if (!res.ok) { toast.error(data?.error || 'Failed to grant credits'); return; }
            toast.success('Credits updated');
            setAmount("");
          } finally { setBusy(false); }
        }}>Bestow</Button>
        <div className="text-xs text-white/60">Use negative numbers to deduct.</div>
      </div>
    </div>
  );
}

function ChatProfileDialog({ email, name, open, onOpenChange }: { email: string; name: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [profile, setProfile] = useState<ChatProfile | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const requestedPhotoKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingProfile(true);
    (async () => {
      try {
        const fetched = await fetch(`/api/users/chat-profile?email=${encodeURIComponent(email)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
        if (!cancelled) {
          requestedPhotoKeysRef.current = new Set();
          setPreviews({});
          setPhotosLoading(false);
          setProfile(fetched || null);
        }
      } catch { }
      finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [email, open]);

  useEffect(() => {
    if (!open) return;
    const keys = Array.isArray(profile?.photos) ? profile.photos.slice(0, 6).filter(Boolean) : [];
    if (!keys.length) {
      setPhotosLoading(false);
      return;
    }
    const missing = keys.filter((k) => k && !previews[k] && !requestedPhotoKeysRef.current.has(k));
    if (!missing.length) return;
    let cancelled = false;
    setPhotosLoading(true);
    missing.forEach((k) => requestedPhotoKeysRef.current.add(k));
    (async () => {
      try {
        const { getViewUrls } = await import("@/lib/view-url-client");
        const urls = await getViewUrls(missing);
        if (!cancelled) {
          setPreviews((prev) => ({ ...prev, ...urls }));
        }
      } catch { }
      finally {
        if (!cancelled) {
          setPhotosLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.photos, previews, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chat Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarImage src={profile?.image} alt={profile?.name || name} />
              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]">
                <CarFront className="size-6" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-base font-medium truncate">{profile?.name || name}</div>
              <div className="text-sm text-white/60">{email}</div>
            </div>
          </div>
          
          {typeof profile?.bio === 'string' && profile.bio.trim() ? (
            <div className="text-sm text-white/80 whitespace-pre-wrap bg-white/5 p-3 rounded border border-white/10">
              {profile.bio}
            </div>
          ) : null}

          {loadingProfile ? (
            <div>
              <div className="text-sm font-medium mb-2">Vehicles</div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-7 w-32" />
              </div>
            </div>
          ) : Array.isArray(profile?.vehicles) && profile.vehicles.length > 0 ? (
            <div>
              <div className="text-sm font-medium mb-2">Vehicles</div>
              <div className="flex flex-wrap gap-2">
                {profile.vehicles.slice(0, 6).map((v, i) => (
                  <span key={i} className="px-3 py-1 rounded bg-white/5 border border-white/10 text-sm">
                    {v.make} {v.model}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="text-sm font-medium mb-2">Photos</div>
            {photosLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded overflow-hidden bg-black/20">
                    <Skeleton className="w-full h-full" />
                  </div>
                ))}
              </div>
            ) : Array.isArray(profile?.photos) && profile.photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {profile.photos.slice(0, 6).map((k) => (
                  <div key={k} className="relative aspect-square rounded overflow-hidden bg-black/20 border border-white/10">
                    {!previews[k] && (
                      <Skeleton className="absolute inset-0" />
                    )}
                    {previews[k] ? (
                      <Image src={previews[k]} alt="Car" fill className="object-cover" sizes="(max-width: 768px) 33vw, 150px" />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/50 bg-white/5 p-4 rounded border border-white/10 text-center">
                No photos yet.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserCreditsSearch(){
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<{ displayName?: string|null; name?: string|null; email: string; credits: number; plan?: string | null; role?: string | null; createdAt?: string | null }>>([]);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [editingCredits, setEditingCredits] = useState<string | null>(null);
  const [confirmPlanDialog, setConfirmPlanDialog] = useState<{ email: string; userName: string; currentPlan: string | null; newPlan: string | null } | null>(null);
  const [confirmCreditsDialog, setConfirmCreditsDialog] = useState<{ email: string; userName: string; currentCredits: number; newCredits: number; delta: number } | null>(null);
  const [creditsInputValue, setCreditsInputValue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const loadingRef = useRef(false);
  const LIMIT = 30;
  const [profileDialogUser, setProfileDialogUser] = useState<{ email: string; name: string } | null>(null);
  
  const loadMore = useCallback(async (resetOffset = false, currentOffset: number) => {
    if (loadingRef.current) return; // Prevent multiple simultaneous loads using ref
    
    loadingRef.current = true;
    setLoading(true);
    try {
      const offsetToUse = resetOffset ? 0 : currentOffset;
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=${offsetToUse}`, { cache:'no-store' }).then(r=>r.json()).catch(()=>({ users: [] }));
      const newUsers = Array.isArray(res?.users) ? res.users : [];
      
      if (resetOffset) {
        setRows(newUsers);
        setOffset(newUsers.length);
      } else {
        setRows(prev => [...prev, ...newUsers]);
        setOffset(prev => prev + newUsers.length);
      }
      
      setHasMore(newUsers.length === LIMIT);
    } catch {}
    finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [q, LIMIT]);
  
  const run = useCallback(async () => {
    setOffset(0);
    setHasMore(true);
    await loadMore(true, 0);
  }, [loadMore]);
  
  // Debounced search - reset to first page when search changes
  useEffect(()=>{
    const t = setTimeout(run, 400);
    return ()=> clearTimeout(t);
  }, [q, run]);

  const handlePlanChange = async (email: string, userName: string, currentPlan: string | null, newPlan: string) => {
    const targetPlan = newPlan === "none" ? null : newPlan;
    if (targetPlan === currentPlan) return; // No change
    
    // Show confirmation dialog
    setConfirmPlanDialog({ email, userName, currentPlan, newPlan: targetPlan });
  };

  const confirmPlanChange = async () => {
    if (!confirmPlanDialog) return;
    const { email, newPlan } = confirmPlanDialog;
    
    setChangingPlan(email);
    try {
      const res = await fetch('/api/admin/plan', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ targetEmail: email, plan: newPlan }) 
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { 
        toast.error(data?.error || 'Failed to update plan'); 
        return; 
      }
      toast.success(`Plan updated to ${newPlan || 'none'}`);
      run();
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setChangingPlan(null);
      setConfirmPlanDialog(null);
    }
  };

  const handleCreditsClick = (email: string, currentCredits: number) => {
    setEditingCredits(email);
    setCreditsInputValue(String(currentCredits));
  };

  const handleCreditsChange = (email: string, userName: string, currentCredits: number) => {
    const newCredits = Math.max(0, Math.trunc(Number(creditsInputValue)));
    if (!Number.isFinite(newCredits) || newCredits === currentCredits) {
      setEditingCredits(null);
      return;
    }
    
    const delta = newCredits - currentCredits;
    setConfirmCreditsDialog({ email, userName, currentCredits, newCredits, delta });
  };

  const confirmCreditsChange = async () => {
    if (!confirmCreditsDialog) return;
    const { email, delta } = confirmCreditsDialog;
    
    try {
      const res = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: email, credits: delta, reason: 'admin_adjustment' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update credits');
        return;
      }
      toast.success('Credits updated');
      run();
    } catch {
      toast.error('Failed to update credits');
    } finally {
      setEditingCredits(null);
      setConfirmCreditsDialog(null);
    }
  };

  const handleScroll = useCallback((e: React.UIEvent<HTMLUListElement>) => {
    if (loadingRef.current || !hasMore) return; // Early return if already loading or no more data
    
    const target = e.currentTarget;
    const scrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    
    if (scrolledToBottom) {
      loadMore(false, offset);
    }
  }, [hasMore, loadMore, offset]);

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <Input 
          value={q} 
          onChange={(e)=> setQ(e.target.value)} 
          placeholder="Search users by display name, handle, or email" 
          className="flex-1" 
        />
        <div className="border rounded">
          <div className="grid grid-cols-[1fr_2fr_140px_140px_140px] gap-2 px-3 py-2 text-xs text-white/60 border-b">
            <div>Name</div>
            <div>Email</div>
            <div className="text-center">Plan</div>
            <div className="text-right">Credits</div>
            <div className="text-right">Joined</div>
          </div>
          <ul className="max-h-[32rem] overflow-y-auto divide-y" onScroll={handleScroll}>
            {rows.map((u)=> (
              <li key={u.email} className="grid grid-cols-[1fr_2fr_140px_140px_140px] gap-2 px-3 py-2 text-sm items-center">
                <button 
                  className="truncate hover:text-blue-400 transition-colors cursor-pointer text-left"
                  onClick={() => setProfileDialogUser({ email: u.email, name: u.displayName || u.name || u.email })}
                >
                  {u.displayName || u.name || '—'}
                </button>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(u.email);
                          toast.success('Email copied to clipboard');
                        } catch {
                          toast.error('Failed to copy email');
                        }
                      }}
                      className="truncate font-mono cursor-pointer hover:text-blue-400 transition-colors text-left"
                    >
                      {u.email}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" className="max-w-sm">
                    <p className="font-mono text-xs">{u.email}</p>
                    <p className="text-[0.625rem] text-white/60 mt-1">Click to copy</p>
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center justify-center">
                  {u.role === 'admin' ? (
                    <span className="text-amber-400 text-xs">Admin</span>
                  ) : (
                    <Select 
                      value={u.plan || "none"} 
                      onValueChange={(newPlan) => handlePlanChange(u.email, u.displayName || u.name || u.email, u.plan ?? null, newPlan)}
                      disabled={changingPlan === u.email}
                    >
                      <SelectTrigger className="h-7 text-xs w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="minimum">Minimum</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="text-right">
                  {editingCredits === u.email ? (
                    <Input
                      type="number"
                      value={creditsInputValue}
                      onChange={(e) => setCreditsInputValue(e.target.value)}
                      onBlur={() => handleCreditsChange(u.email, u.displayName || u.name || u.email, u.credits)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreditsChange(u.email, u.displayName || u.name || u.email, u.credits);
                        if (e.key === 'Escape') setEditingCredits(null);
                      }}
                      autoFocus
                      className="h-7 text-xs text-right w-28 ml-auto"
                    />
                  ) : (
                    <button
                      onClick={() => handleCreditsClick(u.email, u.credits)}
                      className="hover:text-blue-400 transition-colors cursor-pointer"
                    >
                      {u.credits}
                    </button>
                  )}
                </div>
                <div className="text-right text-xs text-white/70">
                  {u.createdAt ? (
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          {new Date(u.createdAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {new Date(u.createdAt).toLocaleString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : '—'}
                </div>
              </li>
            ))}
            {!rows.length && !loading ? (
              <li className="px-3 py-2 text-sm text-white/60">No users found</li>
            ) : null}
            {loading ? (
              <li className="px-3 py-2 text-sm text-white/60 text-center">Loading...</li>
            ) : null}
          </ul>
        </div>

      <AlertDialog open={!!confirmPlanDialog} onOpenChange={(open) => !open && setConfirmPlanDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change User Plan</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>You are about to change the plan for:</div>
                <div className="bg-white/5 p-3 rounded space-y-1 text-sm">
                  <div><strong>User:</strong> {confirmPlanDialog?.userName}</div>
                  <div><strong>Email:</strong> {confirmPlanDialog?.email}</div>
                  <div><strong>Current Plan:</strong> <span className="capitalize">{confirmPlanDialog?.currentPlan || 'none'}</span></div>
                  <div><strong>New Plan:</strong> <span className="capitalize text-green-400">{confirmPlanDialog?.newPlan || 'none'}</span></div>
                </div>
                <div className="text-xs text-white/60 mt-2">
                  This will immediately change the user&apos;s access and features according to their new plan tier.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPlanChange}>Confirm Change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCreditsDialog} onOpenChange={(open) => !open && setConfirmCreditsDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change User Credits</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>You are about to adjust credits for:</div>
                <div className="bg-white/5 p-3 rounded space-y-1 text-sm">
                  <div><strong>User:</strong> {confirmCreditsDialog?.userName}</div>
                  <div><strong>Email:</strong> {confirmCreditsDialog?.email}</div>
                  <div><strong>Current Credits:</strong> {confirmCreditsDialog?.currentCredits}</div>
                  <div><strong>New Credits:</strong> <span className="text-green-400">{confirmCreditsDialog?.newCredits}</span></div>
                  <div>
                    <strong>Change:</strong> 
                    <span className={confirmCreditsDialog && confirmCreditsDialog.delta > 0 ? 'text-green-400' : 'text-red-400'}>
                      {' '}{confirmCreditsDialog && confirmCreditsDialog.delta > 0 ? '+' : ''}{confirmCreditsDialog?.delta}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-white/60 mt-2">
                  This will immediately adjust the user&apos;s credit balance.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEditingCredits(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreditsChange}>Confirm Change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChatProfileDialog
        email={profileDialogUser?.email || ''}
        name={profileDialogUser?.name || ''}
        open={!!profileDialogUser}
        onOpenChange={(open) => !open && setProfileDialogUser(null)}
      />
      </div>
    </TooltipProvider>
  );
}

// Music tab now uses shared component

// Channels tab removed

type Mute = { id: string; targetEmail: string; channels?: string[] | null; expires_at?: string | null };
function ModerationTab() {
  const [mutes, setMutes] = useState<Mute[]>([]);
  const [target, setTarget] = useState("");
  const [channels, setChannels] = useState("");
  const [duration, setDuration] = useState("");
  const [q, setQ] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [rows, setRows] = useState<Array<{ displayName?: string|null; name?: string|null; email: string }>>([]);
  const runSearch = useCallback(async () => {
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}&limit=50`, { cache:'no-store' }).then(r=>r.json()).catch(()=>({ users: [] }));
      const list = Array.isArray(res?.users) ? res.users : [];
      setRows(list.map((u: { displayName?: string|null; name?: string|null; email?: string })=> ({ displayName: u?.displayName||null, name: u?.name||null, email: String(u?.email||"") })));
    } finally { setSearchLoading(false); }
  }, [q]);
  useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/admin/mutes',{cache:'no-store'}).then(r=>r.json()); setMutes(r?.mutes||[]);}catch{}})(); },[]);
  useEffect(()=>{
    const t = setTimeout(runSearch, 250);
    let es: EventSource | null = null;
    (async ()=>{
      try {
        es = new EventSource(`/api/admin/users/live?q=${encodeURIComponent(q)}&limit=50`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data || '{}');
            const users = Array.isArray(data?.users) ? data.users : [];
            setRows(users.map((u: { displayName?: string|null; name?: string|null; email?: string })=> ({ displayName: u?.displayName||null, name: u?.name||null, email: String(u?.email||"") })));
          } catch {}
        };
        es.onerror = () => { try { es?.close(); } catch {} };
      } catch {}
    })();
    return ()=> { clearTimeout(t); try { es?.close(); } catch {} };
  }, [q, runSearch]);
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Mute user</div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input value={target} onChange={(e)=>setTarget(e.target.value)} placeholder="target email" className="rounded bg-white/5 px-3 py-2 text-sm" />
        <input value={channels} onChange={(e)=>setChannels(e.target.value)} placeholder="channels (comma) or empty for global" className="rounded bg-white/5 px-3 py-2 text-sm" />
        <input value={duration} onChange={(e)=>setDuration(e.target.value)} placeholder="duration seconds (optional)" className="rounded bg-white/5 px-3 py-2 text-sm" />
        <Button className="px-3 py-2 text-sm" onClick={async()=>{
          if (!target) return;
          try {
            const payload: { targetEmail: string; channels?: string[]; durationSeconds?: number } = { targetEmail: target };
            if (channels.trim()) payload.channels = channels.split(',').map(s=>s.trim()).filter(Boolean);
            if (duration.trim()) payload.durationSeconds = Number(duration);
            await fetch('/api/admin/mutes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            const r=await fetch('/api/admin/mutes',{cache:'no-store'}).then(r=>r.json()); setMutes(r?.mutes||[]);
          } catch {}
        }}>Mute</Button>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Find user</div>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Search users by name or email" className="flex-1" />
          <Button size="sm" onClick={runSearch} disabled={searchLoading}>{searchLoading? 'Searching…' : 'Search'}</Button>
        </div>
        <div className="border rounded">
          <div className="grid grid-cols-2 gap-2 px-3 py-2 text-xs text-white/60 border-b">
            <div>Name</div>
            <div>Email</div>
          </div>
          <ul className="max-h-60 overflow-y-auto divide-y">
            {rows.map((u)=> (
              <li key={u.email} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm items-center cursor-pointer hover:bg-white/5"
                onClick={()=>{ setTarget(u.email); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {} }}
                title="Click to use this email"
                aria-label={`Use ${u.email}`}>
                <div className="truncate">{u.displayName || u.name || '—'}</div>
                <div className="truncate font-mono">{u.email}</div>
              </li>
            ))}
            {!rows.length ? (
              <li className="px-3 py-2 text-sm text-white/60">No users found</li>
            ) : null}
          </ul>
        </div>
      </div>
      <div className="text-sm font-medium">Current mutes</div>
      <ul className="space-y-1 text-sm">
        {mutes.map((m: Mute)=> (
          <li key={m.id} className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
            <span>{m.targetEmail} {Array.isArray(m.channels)&&m.channels?.length?`(${m.channels.join(',')})`:'(global)'} {m.expires_at?`until ${m.expires_at}`:''}</span>
            <Button variant="ghost" className="text-xs px-2 py-1" onClick={async()=>{ await fetch('/api/admin/mutes',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: m.targetEmail })}); const r=await fetch('/api/admin/mutes',{cache:'no-store'}).then(r=>r.json()); setMutes(r?.mutes||[]); }}>Unmute</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Announcement = { id?: string; title: string; content: string; level?: 'info'|'update'|'warning'; published?: boolean; created_at?: string };
function AnnouncementsTab() {
  const [list, setList] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [level, setLevel] = useState<'info'|'update'|'warning'>('info');
  const [published, setPublished] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  useEffect(()=>{ (async()=>{ try{ const r = await fetch('/api/announcements?all=1&limit=50', { cache: 'no-store' }).then(r=>r.json()); setList(Array.isArray(r?.announcements)? r.announcements : []);}catch{}})(); },[]);
  async function refresh(){ try{ const r = await fetch('/api/announcements?all=1&limit=50', { cache: 'no-store' }).then(r=>r.json()); setList(Array.isArray(r?.announcements)? r.announcements : []);}catch{} }
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">New announcement</div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-start">
        <Input className="sm:col-span-1" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Title" />
        <Select defaultValue={level} onValueChange={(v)=> setLevel(v as 'info'|'update'|'warning')}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="update">update</SelectItem>
            <SelectItem value="warning">warning</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/70">Published</span>
          <Switch checked={published} onCheckedChange={(v)=> setPublished(!!v)} />
        </div>
        <Button className="h-9" disabled={busy} onClick={async()=>{
          if (!title || !content) { toast.error('Title and content required'); return; }
          setBusy(true);
          try{ const res = await fetch('/api/announcements',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, content, level, published }) }); if (!res.ok){ const d=await res.json().catch(()=>({})); toast.error(d?.error||'Failed'); return; } setTitle(''); setContent(''); setLevel('info'); setPublished(true); await refresh(); toast.success('Announcement created'); } finally { setBusy(false); }
        }}>Create</Button>
      </div>
      <Textarea value={content} onChange={(e)=>setContent(e.target.value)} placeholder="Content (supports plain text)" rows={4} />
      <div className="text-sm font-medium">All announcements</div>
      <ul className="space-y-2">
        {list.map((a)=> (
          <li key={a.id || a.title} className="rounded bg-white/5 border border-[color:var(--border)] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium truncate">{a.title}</div>
              <div className="flex items-center gap-2">
                <span className="text-2xs px-2 py-0.5 rounded bg-white/10">{a.level || 'info'}</span>
                <span className="text-2xs px-2 py-0.5 rounded bg-white/10">{a.published ? 'published' : 'draft'}</span>
                <Button variant="ghost" className="text-xs px-2 py-1" onClick={async()=>{ const id=a.id; if(!id) return; await fetch('/api/announcements',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, published: !a.published }) }); await refresh(); }}>{a.published ? 'Unpublish' : 'Publish'}</Button>
                <Button variant="ghost" className="text-xs px-2 py-1" onClick={async()=>{ const id=a.id; if(!id) return; const t = await promptToast({ title: 'New title', initialValue: a.title, confirmText: 'Save' }); if (t === null) return; const c = await promptToast({ title: 'New content', initialValue: a.content, confirmText: 'Save' }); if (c === null) return; await fetch('/api/announcements',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, title: t, content: c }) }); await refresh(); toast.success('Announcement updated'); }}>Edit</Button>
                <Button variant="ghost" className="text-xs px-2 py-1 text-red-300" onClick={async()=>{ const id=a.id; if(!id) return; const ok = await confirmToast({ title: 'Delete announcement?', message: 'This cannot be undone.' }); if(!ok) return; await fetch(`/api/announcements?id=${encodeURIComponent(id)}`, { method:'DELETE' }); await refresh(); toast.success('Announcement deleted'); }}>Delete</Button>
              </div>
            </div>
            <div className="text-xs text-white/80 whitespace-pre-wrap">{a.content}</div>
          </li>
        ))}
        {!list.length ? (<li className="text-sm text-white/60">No announcements yet.</li>) : null}
      </ul>
    </div>
  );
}

function NewTemplateButton(){
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [falModelSlug, setFalModelSlug] = useState("fal-ai/gemini-25-flash-image/edit");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [adminImageFiles, setAdminImageFiles] = useState<File[]>([]);
  const [imageWidth, setImageWidth] = useState<number>(1280);
  const [imageHeight, setImageHeight] = useState<number>(1280);
  const [imageSizeEdited, setImageSizeEdited] = useState<boolean>(false);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [adminPreviews, setAdminPreviews] = useState<string[]>([]);
  const builtIn = useMemo(() => new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]), []);
  const [tokenConfigs, setTokenConfigs] = useState<Record<string, { kind: 'input' | 'select' | 'color'; options: string[]; defaultValue?: string }>>({});
  const [selectedThumbAdminIndex, setSelectedThumbAdminIndex] = useState<number | null>(null);
  const [templateFixedAspect, setTemplateFixedAspect] = useState<boolean>(true);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [allowVehicle, setAllowVehicle] = useState<boolean>(true);
  const [allowUser, setAllowUser] = useState<boolean>(true);
  const [proOnly, setProOnly] = useState<boolean>(false);
  const [status, setStatus] = useState<'draft' | 'public'>('draft');
  const [maxUploadImages, setMaxUploadImages] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [videoCfg, setVideoCfg] = useState<AdminVideoConfig | null>({ enabled: false, prompt: '', duration: '5', resolution: '1080p', aspect_ratio: 'auto', camera_fixed: false, seed: null, fps: 24, previewKey: null });
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [missingItems, setMissingItems] = useState<string[]>([]);
  async function uploadAdmin(file: File, subfolder: string): Promise<string | null> {
    const form = new FormData();
    form.append('file', file);
    form.append('path', `templates/${subfolder}`);
    form.append('scope', 'admin');
    try { const res = await fetch('/api/storage/upload', { method:'POST', body: form }); const data = await res.json(); return data?.key || null; } catch { return null; }
  }
  // Auto-detect unknown tokens from prompt
  useEffect(()=>{
    const raw = Array.from((prompt.match(/\[([A-Z0-9_]+)\]/g) || [])).map((m)=> m.replace(/^[\[]|[\]]$/g, ""));
    const unique = Array.from(new Set(raw));
    const unknown = unique.filter((k)=> !builtIn.has(k));
    setTokenConfigs((prev)=>{
      const next: Record<string, { kind: 'input' | 'select' | 'color'; options: string[]; defaultValue?: string }> = {};
      for (const k of unknown) next[k] = prev[k] || { kind: 'input', options: [] };
      return next;
    });
  }, [prompt, builtIn]);

  // Build previews for thumbnail/admin images
  useEffect(()=>{
    // Thumbnail
    try { if (thumbPreview) URL.revokeObjectURL(thumbPreview); } catch {}
    if (thumbnailFile) {
      try { setThumbPreview(URL.createObjectURL(thumbnailFile)); } catch { setThumbPreview(null); }
    } else {
      setThumbPreview(null);
    }
    // Admin previews
    try { adminPreviews.forEach((u)=>{ try { URL.revokeObjectURL(u); } catch {} }); } catch {}
    const urls = adminImageFiles.map((f)=>{ try { return URL.createObjectURL(f); } catch { return ""; } }).filter(Boolean);
    setAdminPreviews(urls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnailFile, adminImageFiles]);

  // Derive aspect ratio from first admin image when fixed toggle is on
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      if (!templateFixedAspect) { setAspectRatio(null); return; }
      const f = adminImageFiles[0];
      if (!f) { setAspectRatio(null); return; }
      try {
        const url = URL.createObjectURL(f);
        const img = new window.Image();
        await new Promise<void>((resolve, reject)=>{ img.onload = ()=>resolve(); img.onerror=()=>reject(new Error('img')); img.src=url; });
        if (!cancelled) setAspectRatio(img.naturalWidth && img.naturalHeight ? (img.naturalWidth / img.naturalHeight) : null);
        try { URL.revokeObjectURL(url); } catch {}
      } catch { if (!cancelled) setAspectRatio(null); }
    })();
    return ()=>{ cancelled=true };
  }, [templateFixedAspect, adminImageFiles]);

  // Default image size from first admin image, clamped to 1024..4096 and scaled retaining AR
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      if (!adminImageFiles.length || imageSizeEdited) return;
      const first = adminImageFiles[0]; if (!first) return;
      try {
        const url = URL.createObjectURL(first);
        const img = new window.Image();
        await new Promise<void>((resolve, reject)=>{ img.onload=()=>resolve(); img.onerror=()=>reject(new Error('img')); img.src=url; });
        const ow = Math.max(1, img.naturalWidth||img.width||0);
        const oh = Math.max(1, img.naturalHeight||img.height||0);
        const min=1024, max=4096;
        const sMin = Math.max(min/ow, min/oh);
        const sMax = Math.min(max/ow, max/oh);
        let s = sMin; if (sMin > sMax) s = sMax; if (!Number.isFinite(s) || s<=0) s=1;
        const w = Math.max(min, Math.min(max, Math.round(ow * s)));
        const h = Math.max(min, Math.min(max, Math.round(oh * s)));
        if (!cancelled) { setImageWidth(w); setImageHeight(h); }
        try { URL.revokeObjectURL(url); } catch {}
      } catch {}
    })();
    return ()=>{ cancelled=true };
  }, [adminImageFiles, imageSizeEdited]);
  
  function validateAndSave() {
    // Check for basic required fields first
    if (!name || !prompt) { toast.error('Name and prompt are required'); return; }
    
    // Check for missing thumbnail or admin images
    const missing: string[] = [];
    const hasThumbnail = !!(thumbnailFile || selectedThumbAdminIndex !== null);
    const hasAdminImages = adminImageFiles.length > 0;
    
    if (!hasThumbnail) missing.push('Thumbnail');
    if (!hasAdminImages) missing.push('Admin Images');
    
    if (missing.length > 0) {
      setMissingItems(missing);
      setShowWarningDialog(true);
      return;
    }
    
    // If everything is present, proceed with save
    save();
  }
  
  async function save() {
    if (!name || !prompt) { toast.error('Name and prompt are required'); return; }
    if (!allowVehicle && !allowUser) { toast.error('Enable at least one image source (car or user).'); return; }
    if (maxUploadImages !== '' && (!Number.isFinite(Number(maxUploadImages)) || Number(maxUploadImages) <= 0)) { toast.error('Required images must be a positive number'); return; }
    // Validate dropdown tokens have >= 2 options
    for (const [key, cfg] of Object.entries(tokenConfigs)) {
      if (cfg.kind === 'select') {
        const opts = (cfg.options || []).filter((x)=>String(x||'').trim().length>0);
        if (opts.length < 2) { toast.error(`Token ${key} requires at least 2 options.`); return; }
      }
    }
    // Compute hashes to dedupe thumbnail against admin images (storage-saving)
    let thumbHex: string | null = null;
    let adminHexes: string[] = [];
    try {
      if (thumbnailFile) {
        const buf = new Uint8Array(await thumbnailFile.arrayBuffer());
        const digest = await crypto.subtle.digest('SHA-256', buf);
        thumbHex = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
      }
      if (adminImageFiles.length) {
        const arrs = await Promise.all(adminImageFiles.map((f)=> f.arrayBuffer()));
        adminHexes = await Promise.all(arrs.map(async (ab)=>{
          const dg = await crypto.subtle.digest('SHA-256', new Uint8Array(ab));
          return Array.from(new Uint8Array(dg)).map(b=>b.toString(16).padStart(2,'0')).join('');
        }));
      }
    } catch {}
    setBusy(true);
    try {
      let thumbnailKey: string | undefined = undefined;
      const adminImageKeys: string[] = [];
      for (const f of adminImageFiles) {
        const key = await uploadAdmin(f, 'images');
        if (key) adminImageKeys.push(key.replace(/^admin\//,''));
      }
      // Choose thumbnail: prefer explicitly selected admin image if set
      if (selectedThumbAdminIndex !== null && adminImageKeys[selectedThumbAdminIndex]) {
        thumbnailKey = adminImageKeys[selectedThumbAdminIndex];
      } else if (thumbHex && adminHexes.length) {
        const matchIdx = adminHexes.findIndex((h)=> h === thumbHex);
        if (matchIdx >= 0 && adminImageKeys[matchIdx]) {
          // Reuse the matching admin image as thumbnail; skip uploading thumbnail file
          thumbnailKey = adminImageKeys[matchIdx];
        }
      }
      // If still no thumbnailKey and thumbnailFile provided, upload thumbnail
      if (!thumbnailKey && thumbnailFile) {
        const key = await uploadAdmin(thumbnailFile, 'thumbnails');
        if (key) thumbnailKey = key.replace(/^admin\//,'');
      }
      const unknownVarDefs: Array<{ key: string; label: string; required: boolean; type: 'select'|'color'|'text'; options?: string[]; defaultValue?: string; }> = Object.entries(tokenConfigs).map(([key, cfg])=> ({
        key,
        label: key,
        required: false,
        type: (cfg.kind === 'select' ? 'select' : (cfg.kind === 'color' ? 'color' : 'text')) as 'select'|'color'|'text',
        options: cfg.kind === 'select' ? cfg.options : undefined,
        defaultValue: cfg.kind === 'color' && typeof (cfg as { defaultValue?: unknown }).defaultValue === 'string' ? (cfg as { defaultValue?: string }).defaultValue : undefined,
      }));
      const allowedImageSources = ([allowVehicle ? 'vehicle' : null, allowUser ? 'user' : null].filter(Boolean) as Array<'vehicle'|'user'>);
      const payload: CreateTemplatePayload = {
        name,
        description,
        prompt,
        falModelSlug,
        thumbnailKey: thumbnailKey || undefined,
        adminImageKeys,
        fixedAspectRatio: templateFixedAspect,
        aspectRatio: templateFixedAspect ? aspectRatio || undefined : undefined,
        variables: unknownVarDefs,
        allowedImageSources,
        maxUploadImages: ((): number | undefined => {
          const n = Number(maxUploadImages);
          return Number.isFinite(n) && n > 0 ? Math.min(25, Math.round(n)) : undefined;
        })(),
        video: (videoCfg || undefined),
      } as unknown as CreateTemplatePayload;
      if (proOnly) payload.proOnly = true;
      payload.status = status;
      if (/bytedance\/seedream\/v4\/edit$/i.test(falModelSlug)) payload.imageSize = { width: imageWidth, height: imageHeight };
      const res = await fetch('/api/templates', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json().catch(()=>({})); toast.error(data?.error || 'Failed to create template'); return; }
      setOpen(false); setName(""); setDescription(""); setPrompt(""); setFalModelSlug("fal-ai/gemini-25-flash-image/edit"); setThumbnailFile(null); setAdminImageFiles([]); setAllowVehicle(true); setAllowUser(true); setImageWidth(1280); setImageHeight(1280); setImageSizeEdited(false); setMaxUploadImages('');
      setProOnly(false); setStatus('draft');
      try { const ev = new CustomEvent('admin:templates:created'); window.dispatchEvent(ev); } catch {}
    } finally { setBusy(false); }
  }
  return (
    <>
      <Button size="sm" onClick={()=>setOpen(true)}>New Template</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Template name" />
              <div>
                <Select value={/bytedance\/seedream\/v4\/edit$/i.test(falModelSlug) ? 'seedream' : 'gemini'} onValueChange={(v)=> setFalModelSlug(v === 'seedream' ? 'fal-ai/bytedance/seedream/v4/edit' : 'fal-ai/gemini-25-flash-image/edit')}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Model" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini 2.5 Flash (default)</SelectItem>
                    <SelectItem value="seedream">Seedream 4.0 (Bytedance)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Foreground masking is always enabled by default; options removed */}
            <Textarea value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Description (optional)" rows={2} />
            <Textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Prompt (use tokens like [BRAND], [MODEL], [COLOR_FINISH], [ACCENTS], [COLOR_FINISH_ACCENTS], [DOMINANT_COLOR_TONE])" rows={6} />
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">Fixed aspect ratio</div>
                <div className="text-xs text-white/60">If enabled, we use the first admin image to set the aspect ratio. New images must be cropped to fit.</div>
              </div>
              <div className="flex items-center gap-2">
                {templateFixedAspect && aspectRatio ? (<div className="text-xs text-white/60">AR: {aspectRatio.toFixed(3)}</div>) : null}
                <Switch checked={templateFixedAspect} onCheckedChange={(v)=> setTemplateFixedAspect(!!v)} />
              </div>
            </div>
            {/bytedance\/seedream\/v4\/edit$/i.test(falModelSlug) ? (
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Image size</div>
                  <div className="text-xs text-white/60">Defaults to first admin image, scaled to 1024–4096 while keeping aspect ratio.</div>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" className="w-24 h-9" value={imageWidth} onChange={(e)=>{ const v = Math.round(Number(e.target.value||0)); setImageWidth(Math.max(1024, Math.min(4096, v||0))); setImageSizeEdited(true); }} placeholder="width" />
                  <span className="text-xs text-white/50">×</span>
                  <Input type="number" className="w-24 h-9" value={imageHeight} onChange={(e)=>{ const v = Math.round(Number(e.target.value||0)); setImageHeight(Math.max(1024, Math.min(4096, v||0))); setImageSizeEdited(true); }} placeholder="height" />
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">Allowed sources</div>
                <div className="text-xs text-white/60">Enable car images and/or user images (upload or workspace).</div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2"><span className="text-xs text-white/70">Car</span><Switch checked={allowVehicle} onCheckedChange={(v)=> setAllowVehicle(!!v)} /></div>
                <div className="flex items-center gap-2"><span className="text-xs text-white/70">User</span><Switch checked={allowUser} onCheckedChange={(v)=> setAllowUser(!!v)} /></div>
                <div className="flex items-center gap-2"><span className="text-xs text-white/70">Pro only</span><Switch checked={proOnly} onCheckedChange={(v)=> setProOnly(!!v)} /></div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/70">Status</span>
                  <Select value={status} onValueChange={(v)=> setStatus((v as 'draft' | 'public') || 'draft')}>
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {Object.keys(tokenConfigs).length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Detected tokens</div>
                <ul className="space-y-2">
                  {Object.entries(tokenConfigs).map(([key, cfg])=> (
                    <li key={key} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-start">
                      <div className="sm:col-span-2">
                        <div className="text-xs text-white/70">[{key}]</div>
                        <Select defaultValue={cfg.kind} onValueChange={(v)=> setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: (v as 'input'|'select'|'color'), options: prev[key]?.options || [], defaultValue: prev[key]?.defaultValue } }))}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Field type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="input">Input</SelectItem>
                            <SelectItem value="select">Dropdown</SelectItem>
                            <SelectItem value="color">Color Picker</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {cfg.kind === 'select' ? (
                        <div className="sm:col-span-3 space-y-1">
                          <div className="text-xs text-white/70">Options (add at least two)</div>
                          <div className="flex gap-2">
                            <Input placeholder="Add option" onKeyDown={(e)=>{
                              if (e.key === 'Enter') {
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val) setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: 'select', options: [...(prev[key]?.options || []), val] } }));
                                try { (e.target as HTMLInputElement).value = ""; } catch {}
                              }
                            }} />
                            <Button variant="ghost" size="sm" className="text-xs" onClick={(e)=>{
                              e.preventDefault();
                              const el = (e.currentTarget.previousSibling as HTMLInputElement | null);
                              const val = (el && 'value' in el) ? String((el as HTMLInputElement).value || '').trim() : '';
                              if (val) setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: 'select', options: [...(prev[key]?.options || []), val] } }));
                              try { if (el && 'value' in el) (el as HTMLInputElement).value = ''; } catch {}
                            }}>Add</Button>
                          </div>
                          {(cfg.options || []).length ? (
                            <div className="flex flex-wrap gap-1">
                              {(cfg.options || []).map((opt, idx)=> (
                                <span key={`${opt}-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 text-xs">
                                  {opt}
                                  <Button variant="ghost" size="sm" className="ml-1 h-5 px-1 text-white/60 hover:text-white" onClick={()=> setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: 'select', options: (prev[key]?.options || []).filter((o,i)=> i!==idx) } }))}>×</Button>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {cfg.kind === 'color' ? (
                        <div className="sm:col-span-3 space-y-1">
                          <div className="text-xs text-white/70">Default color (optional)</div>
                          <div className="flex items-center gap-2">
                            <input type="color" value={cfg.defaultValue || '#ffffff'} onChange={(e)=> setTokenConfigs((prev)=> ({ ...prev, [key]: { ...prev[key], kind: 'color', defaultValue: e.target.value, options: prev[key]?.options || [] } }))} className="h-9 w-12 rounded bg-transparent border border-[color:var(--border)]" />
                            <Input className="w-36" value={cfg.defaultValue || ''} onChange={(e)=> setTokenConfigs((prev)=> ({ ...prev, [key]: { ...prev[key], kind: 'color', defaultValue: e.target.value, options: prev[key]?.options || [] } }))} placeholder="#ffffff" />
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <AdminTemplateImages
              mode="create"
              adminPreviews={adminPreviews}
              selectedThumbAdminIndex={selectedThumbAdminIndex}
              thumbPreview={thumbPreview}
              onDropAdminFiles={(files)=> setAdminImageFiles((prev)=> [...prev, ...files])}
              onRemoveAdminIndex={(index)=> setAdminImageFiles((prev)=> prev.filter((_, idx)=> idx!==index))}
              onSetThumbFromAdminIndex={(index)=> setSelectedThumbAdminIndex(index)}
              onDropThumbFile={(file)=> { setSelectedThumbAdminIndex(null); setThumbnailFile(file); }}
              onClearThumb={()=> { setThumbnailFile(null); setSelectedThumbAdminIndex(null); }}
              onDownloadThumb={()=>{
                try {
                  const url = thumbPreview || (selectedThumbAdminIndex !== null ? adminPreviews[selectedThumbAdminIndex]! : '');
                  if (url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'thumbnail.jpg';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(()=>{ try{ document.body.removeChild(a);}catch{} }, 1000);
                  }
                } catch {}
              }}
            />
          </div>
          {/* Video generation config (shared component) */}
          <AdminTemplateVideo value={videoCfg as AdminVideoConfig} onChange={(next)=> setVideoCfg(next as AdminVideoConfig)} />
          
          <DialogFooter>
            <Button size="sm" onClick={validateAndSave} disabled={busy}>{busy? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing Template Assets</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div className="mb-2">The following items are missing from this template:</div>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {missingItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="mt-3">
                  Templates without these assets may not display properly. Do you want to continue anyway?
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowWarningDialog(false); save(); }}>
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<TemplateDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortBy, setSortBy] = useState<'recent'|'favorites'>('recent');
  const [filterBy, setFilterBy] = useState<'all'|'favorites'|'video'>('all');
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        setLoading(true);
        const qs: string[] = [];
        if (sortBy === 'favorites') qs.push('sort=most_favorited');
        if (filterBy === 'favorites') qs.push('filter=favorites');
        if (filterBy === 'video') qs.push('filter=video');
        const q = qs.length ? `?${qs.join('&')}` : '';
        const res = await fetch(`/api/templates${q}`, { cache:'no-store' }).then(r=>r.json());
        const list = Array.isArray(res?.templates) ? res.templates : [];
        async function resolveThumb(keyRaw?: string | null): Promise<string | undefined>{
          if (!keyRaw || typeof keyRaw !== 'string') return undefined;
          const key = keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`;
          const cacheKey = `carclout:thumb:${key}`;
          try {
            const cached = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null;
            if (cached) {
              const obj = JSON.parse(cached) as { url?: string; ts?: number };
              const ttlMs = 10*60*1000; if (obj?.url && obj?.ts && Date.now() - obj.ts < ttlMs) return obj.url;
            }
          } catch {}
          try {
            const url = await (await import('@/lib/view-url-client')).getViewUrl(key, 'admin');
            if (url) { try { if (typeof window !== 'undefined') sessionStorage.setItem(cacheKey, JSON.stringify({ url, ts: Date.now() })); } catch {} return url; }
          } catch {}
          return undefined;
        }
        const out = await Promise.all(list.map(async (t: TemplateDisplay)=> ({
          id: t?.id,
          name: t?.name,
          description: t?.description,
          slug: t?.slug,
          thumbnailKey: (t as unknown as { thumbnailKey?: string })?.thumbnailKey,
          thumbUrl: await resolveThumb((t as unknown as { thumbnailKey?: string })?.thumbnailKey),
          blurhash: typeof (t as { blurhash?: unknown })?.blurhash === 'string' ? (t as { blurhash: string }).blurhash : undefined,
          variables: Array.isArray(t?.variables)?t.variables:[],
          prompt: String(t?.prompt||''),
          falModelSlug: String(t?.falModelSlug || 'fal-ai/bytedance/seedream/v4/edit'),
          fixedAspectRatio: !!t?.fixedAspectRatio,
          aspectRatio: typeof t?.aspectRatio === 'number' ? Number(t?.aspectRatio) : undefined,
          proOnly: !!(t as unknown as { proOnly?: boolean })?.proOnly,
          status: ((t as unknown as { status?: unknown })?.status === 'draft' || (t as unknown as { status?: unknown })?.status === 'public') ? (t as unknown as { status: 'draft' | 'public' }).status : 'draft',
          rembg: t?.rembg || null,
          allowedImageSources: Array.isArray(t?.allowedImageSources) ? t.allowedImageSources : ['vehicle','user'],
          maxUploadImages: typeof (t as { maxUploadImages?: unknown })?.maxUploadImages === 'number' ? Number((t as { maxUploadImages?: number }).maxUploadImages) : undefined,
          imageSize: (t as { imageSize?: { width: number; height: number } | null })?.imageSize || null,
          favoriteCount: Number((t as { favoriteCount?: number })?.favoriteCount || 0),
          adminImageKeys: Array.isArray((t as unknown as { adminImageKeys?: string[] })?.adminImageKeys) ? ((t as unknown as { adminImageKeys?: string[] }).adminImageKeys as string[]) : [],
          video: (t as unknown as { video?: unknown })?.video as unknown,
          created_at: (t as unknown as { created_at?: string })?.created_at,
        })));
        if (!cancelled) setTemplates(out);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return ()=>{cancelled=true};
  },[refreshKey, sortBy, filterBy]);
  useEffect(()=>{
    function onCreated(){ setRefreshKey((v)=> v+1); }
    window.addEventListener('admin:templates:created', onCreated as EventListener);
    return ()=> window.removeEventListener('admin:templates:created', onCreated as EventListener);
  },[]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TemplateDisplay | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTemplate, setTestTemplate] = useState<TemplateDisplay | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/70">Manage templates</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-white/70">Filter</div>
          <Select value={filterBy} onValueChange={(v)=> setFilterBy((v as 'all'|'favorites'|'video') || 'all')}>
            <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="favorites">My favourites</SelectItem>
              <SelectItem value="video">Video only</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-white/70">Sort</div>
          <Select value={sortBy} onValueChange={(v)=> setSortBy((v as 'recent'|'favorites') || 'recent')}>
            <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue placeholder="Most recent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="favorites">Most favourited</SelectItem>
            </SelectContent>
          </Select>
          <NewTemplateButton />
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-stretch">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg overflow-hidden bg-white/5 border border-[color:var(--border)]">
              <Skeleton className="w-full aspect-[3/4]" />
              <div className="p-2">
                <Skeleton className="h-4 w-2/5" />
                <div className="mt-2 flex items-center gap-2">
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            </div>
          ))}
          <div className="hidden lg:block rounded-lg overflow-hidden bg-white/5 border border-[color:var(--border)]">
            <Skeleton className="w-full aspect-[3/4]" />
            <div className="p-2">
              <Skeleton className="h-4 w-2/5" />
              <div className="mt-2 flex items-center gap-2">
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          </div>
          <div className="hidden lg:block rounded-lg overflow-hidden bg-white/5 border border-[color:var(--border)]">
            <Skeleton className="w-full aspect-[3/4]" />
            <div className="p-2">
              <Skeleton className="h-4 w-2/5" />
              <div className="mt-2 flex items-center gap-2">
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-white/60">No templates yet. Create one to get started.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-stretch">
          {templates.map((t: TemplateDisplay)=> (
            <ContextMenu key={t.id || t.slug}>
              <ContextMenuTrigger asChild>
                <div className="relative">
                  {t.status === 'draft' && (
                    <div className="absolute top-2 right-2 z-10 bg-yellow-500/90 text-black text-xs font-semibold px-2 py-0.5 rounded">
                      Draft
                    </div>
                  )}
                  <TemplateCard
                    data={{ id: t.id, name: t.name, description: t.description, slug: t.slug, thumbUrl: t.thumbUrl, blurhash: t.blurhash, createdAt: (t as unknown as { created_at?: string })?.created_at, favoriteCount: (t as { favoriteCount?: number })?.favoriteCount, proOnly: !!t.proOnly, isVideoTemplate: Boolean(t.video?.enabled) }}
                    showNewBadge={true}
                    showLike={false}
                    showFavoriteCount={true}
                    onClick={()=>{ setActive(t); setOpen(true); }}
                  />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); setTestTemplate(t); setTestOpen(true); }}>Test Template</ContextMenuItem>
                <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); setActive(t); setOpen(true); }}>Edit</ContextMenuItem>
                <ContextMenuItem onSelect={async()=>{
                  const ok = await confirmToast({ title: `Delete template "${t.name}"?`, message: 'This action cannot be undone.' });
                  if (!ok) return;
                  await fetch(`/api/templates?id=${encodeURIComponent(t.id || '')}&slug=${encodeURIComponent(t.slug || '')}`, { method:'DELETE' });
                  setRefreshKey((v)=>v+1);
                  toast.success('Template deleted');
                }}>Delete</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{active?.name || 'Template'}</DialogTitle>
          </DialogHeader>
          {active ? (
            <AdminEditTemplate template={active} onSaved={()=>{ setOpen(false); setRefreshKey((v)=> v+1); }} />
          ) : (
            <div className="text-sm text-white/70">No template selected</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Template: {testTemplate?.name || 'Template'}</DialogTitle>
          </DialogHeader>
          {testTemplate ? (
            <UseTemplateContent template={{
              id: testTemplate.id,
              name: testTemplate.name,
              desc: testTemplate.description,
              thumbUrl: testTemplate.thumbUrl,
              slug: testTemplate.slug,
              variables: testTemplate.variables,
              prompt: testTemplate.prompt,
              favoriteCount: testTemplate.favoriteCount,
              isFavorited: false,
              fixedAspectRatio: testTemplate.fixedAspectRatio,
              aspectRatio: testTemplate.aspectRatio,
              allowedImageSources: testTemplate.allowedImageSources,
              autoOpenDesigner: testTemplate.autoOpenDesigner,
              maxUploadImages: testTemplate.maxUploadImages,
              video: testTemplate.video,
            }} />
          ) : (
            <div className="text-sm text-white/70">No template selected</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

//
/*
function AdminTestTemplate({ template }: { template: TemplateDisplay }){
  const [source, setSource] = useState<'vehicle'|'upload'|'workspace'>(()=>{
    const srcs: string[] = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user'];
    return srcs.includes('vehicle') ? 'vehicle' : 'upload';
  });
  const [vehiclePhotos, setVehiclePhotos] = useState<string[]>([]);
  const [profileVehicles, setProfileVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(null);
  const [browseSelected, setBrowseSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [varState, setVarState] = useState<Record<string,string>>({});
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [upscales, setUpscales] = useState<Array<{ key: string; url: string }>>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [upscaleBusy, setUpscaleBusy] = useState<boolean>(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<string[] | null>(null);
  const [masking, setMasking] = useState<boolean>(false);
  // Designer state
  const [designing, setDesigning] = useState<boolean>(false);
  const [_designBgUrl, _setDesignBgUrl] = useState<string | null>(null);
  const [_designFgUrl, _setDesignFgUrl] = useState<string | null>(null);
  const [_designMaskUrl, _setDesignMaskUrl] = useState<string | null>(null);

  useEffect(()=>{
    (async()=>{
      try {
        const profile = await fetch('/api/profile',{cache:'no-store'}).then(r=>r.json());
        const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? (profile.profile.vehicles as Vehicle[]) : [];
        setProfileVehicles(vehicles);
        const keys: string[] = (() => {
          const flat = vehicles.flatMap((v)=> Array.isArray((v as unknown as { photos?: string[] }).photos) ? ((v as unknown as { photos?: string[] }).photos as string[]) : []);
          if (flat.length) return flat;
          return Array.isArray(profile?.profile?.carPhotos) ? profile.profile.carPhotos : [];
        })();
        setVehiclePhotos(keys);
        const primary = keys.find(Boolean) || null; setSelectedVehicleKey(primary);
      } catch {}
    })();
  },[]);

  useEffect(()=>{
    function onProfileUpdated(){
      (async()=>{
        try {
          const profile = await fetch('/api/profile',{cache:'no-store'}).then(r=>r.json());
          const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? (profile.profile.vehicles as Vehicle[]) : [];
          setProfileVehicles(vehicles);
          const keys: string[] = (() => {
            const flat = vehicles.flatMap((v)=> Array.isArray((v as unknown as { photos?: string[] }).photos) ? ((v as unknown as { photos?: string[] }).photos as string[]) : []);
            if (flat.length) return flat;
            return Array.isArray(profile?.profile?.carPhotos) ? profile.profile.carPhotos : [];
          })();
          setVehiclePhotos(keys);
          if (!keys.includes(selectedVehicleKey || '')) {
            setSelectedVehicleKey(keys.find(Boolean) || null);
          }
        } catch {}
      })();
    }
    window.addEventListener('profile-updated', onProfileUpdated as EventListener);
    return ()=> window.removeEventListener('profile-updated', onProfileUpdated as EventListener);
  },[selectedVehicleKey]);

  // Prefill defaults for color variables from template definitions (without overriding user input)
  useEffect(()=>{
    try {
      const tokensInPrompt = new Set(String(template?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m:string)=> m.replace(/^[\[]|[\]]$/g,'')) || []);
      const defs: TemplateVariableDef[] = Array.isArray(template?.variables) ? (template.variables as TemplateVariableDef[]) : [];
      if (!defs.length) return;
      const next: Record<string,string> = { ...varState };
      let changed = false;
      for (const d of defs) {
        const key = String(d?.key || '').trim();
        if (!key) continue;
        if (tokensInPrompt.size && !tokensInPrompt.has(key)) continue;
        const type = String(d?.type || 'text');
        if (type === 'color') {
          const def = typeof d?.defaultValue === 'string' ? (d.defaultValue as string) : '';
          if (def && !next[key]) { next[key] = def; changed = true; }
        }
      }
      if (changed) setVarState(next);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, template?.slug]);

  useEffect(()=>{
    const srcs: string[] = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user'];
    // If current selection is no longer allowed, or when template changes, clamp/reset
    if (!srcs.includes('user') && (source === 'upload' || source === 'workspace')) {
      setSource(srcs.includes('vehicle') ? 'vehicle' : 'upload');
    } else if (!srcs.includes('vehicle') && source === 'vehicle') {
      setSource('upload');
    } else if (srcs.includes('vehicle') && source !== 'vehicle' && !srcs.includes('user')) {
      setSource('vehicle');
    }
  }, [template?.id, template?.slug, source, template?.allowedImageSources]);


  function baseSlug(v: Vehicle): string { if (!v) return ''; const name = `${v.make||''} ${v.model||''}`.trim().toLowerCase(); return name.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function uniqueSlugForIndex(list: Vehicle[], index:number): string { const v = list[index]; if (!v) return ''; const base = baseSlug(v); let prior=0; for (let i=0;i<index;i++){ const u=list[i]; if (u&&u.make===v.make&&u.model===v.model&&u.type===v.type) prior++; } const suf = prior>0?`-${prior}`:''; return `${base}${suf}`; }
  function findVehicleForSelected(): Vehicle | null { if (!selectedVehicleKey || !profileVehicles.length) return null; const idx = selectedVehicleKey.indexOf('/vehicles/'); if (idx===-1) return null; const sub = selectedVehicleKey.slice(idx); const m = sub.match(/\/vehicles\/([^/]+)\//); const slug = m?.[1] || ''; const slugs = profileVehicles.map((_:Vehicle,i:number)=> uniqueSlugForIndex(profileVehicles as Vehicle[], i)); const at = slugs.findIndex((s:string)=> s===slug); return at>=0 ? profileVehicles[at] : null; }

  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const form = new FormData(); form.append('file', file); form.append('path','library'); const res = await fetch('/api/storage/upload',{ method:'POST', body: form }); const data = await res.json(); if (data?.key) setBrowseSelected(data.key); } finally { setUploading(false); } }
  async function handleUploadFiles(files: File[]) { const file = Array.isArray(files) ? files[0] : (files as unknown as File[])[0]; if (!file) return; setUploading(true); try { const form = new FormData(); form.append('file', file); form.append('path','library'); const res = await fetch('/api/storage/upload',{ method:'POST', body: form }); const data = await res.json(); if (data?.key) setBrowseSelected(data.key); } finally { setUploading(false); } }

  async function getUrlForKey(key: string): Promise<string | null> { try { const { getViewUrl } = await import('@/lib/view-url-client'); return await getViewUrl(key); } catch { return null; } }

  async function readImageDims(url: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        img.onerror = () => resolve(null);
        img.src = url;
      } catch { resolve(null); }
    });
  }

  function ratioMismatch(actual: number, expected: number): boolean {
    const tolerance = 0.02;
    return Math.abs(actual / expected - 1) > tolerance;
  }

  async function generate(){ if (!template) return; setResultUrl(null);
    // Preflight validations without showing generating UI
    try {
      const r = await fetch('/api/credits', { cache: 'no-store' }).then(r=>r.json());
      const c = typeof r?.credits === 'number' ? Number(r.credits) : 0;
      if (!Number.isFinite(c) || c < 6) { toast.error('Not enough credits to generate. Top up in Billing.'); return; }
    } catch {}
    const userImageKeys: string[] = [];
    let selectedFullKey: string | null = null;
    if (source==='vehicle') {
      if (!selectedVehicleKey) { toast.error('Select a vehicle image'); return; }
      selectedFullKey = selectedVehicleKey;
      // Extract path under users/<id>/
      const m = selectedVehicleKey.match(/^users\/[^/]+\/(.+)$/);
      const rel = m ? m[1] : selectedVehicleKey.replace(/^users\//,'');
      userImageKeys.push(rel.replace(/^\/+/,''));
      const v = findVehicleForSelected(); if (!v || !v.make || !v.model || !v.colorFinish) { toast.error('Please add a vehicle with brand, model, and body color/finish in your profile.'); return; }
    } else if (source==='workspace' || source==='upload') {
      const k = browseSelected; if (!k) { toast.error(source==='workspace' ? 'Select a workspace image' : 'Upload an image'); return; }
      selectedFullKey = k;
      const m = k.match(/^users\/[^/]+\/(.+)$/);
      const rel = m ? m[1] : k.replace(/^users\//,'');
      userImageKeys.push(rel.replace(/^\/+/,''));
    }
    // Aspect ratio enforcement
    if (template?.fixedAspectRatio && typeof template?.aspectRatio === 'number' && selectedFullKey) {
      try {
        const url = await getUrlForKey(selectedFullKey);
        if (url) {
          const dims = await readImageDims(url);
          if (dims && dims.w > 0 && dims.h > 0) {
            const ar = dims.w / dims.h;
            if (ratioMismatch(ar, Number(template.aspectRatio))) {
              setPendingKeys([]);
              // Use same-origin proxy for cropping to avoid CORS/tainted canvas
              setCropUrl(`/api/storage/file?key=${encodeURIComponent(selectedFullKey)}`);
              setCropOpen(true);
              return; // wait for crop flow
            }
          }
        }
      } catch {}
    }
    // Proceed without cropping
    const variables: Record<string,string> = {};
    const tokensInPrompt = new Set(String(template?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m:string)=> m.replace(/^[\[]|[\]]$/g,'')) || []);
    if (source !== 'vehicle') {
      const builtinNeeded = ['BRAND','MODEL','COLOR_FINISH','ACCENTS'].filter((k)=> tokensInPrompt.has(k));
      const missing: string[] = [];
      for (const k of builtinNeeded){ const val = varState[k] || ''; if (val) variables[k]=val; else missing.push(k); }
      if (builtinNeeded.length && missing.length){ toast.error(`Please fill: ${missing.join(', ')}`); return; }
    }
    const vars = Array.isArray(template?.variables)? (template.variables as TemplateVariableDef[]) : [];
    for (const v of vars){ const key = String(v?.key||'').trim(); if (!key || ['BRAND','MODEL','COLOR_FINISH','ACCENTS','COLOR_FINISH_ACCENTS'].includes(key)) continue; if (!tokensInPrompt.has(key)) continue; const val = varState[key] || ''; if (val) variables[key]=val; }
    // Now we actually start generating: show busy UI
    setBusy(true);
    try {
      const payload: GeneratePayload = { templateId: template?.id, templateSlug: template?.slug, userImageKeys, variables };
      const res = await fetch('/api/templates/generate',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); let data: { url?: string; key?: string; error?: string } = {}; try { data = await res.json(); } catch { data = {}; } if (!res.ok) { toast.error(data?.error || 'Generation failed'); return; } if (data?.url) setResultUrl(String(data.url)); if (data?.key) setResultKey(String(data.key)); if (data?.url) setActiveUrl(String(data.url)); if (data?.key) setActiveKey(String(data.key)); setUpscales([]);
    } finally { setBusy(false); }
  }

  function blobToDataUrl(blob: Blob): Promise<string> { return new Promise((resolve)=>{ const fr = new FileReader(); fr.onloadend = ()=> resolve(String(fr.result||'')); fr.readAsDataURL(blob); }); }

  async function onCroppedBlob(blob: Blob){
    setCropOpen(false);
    const dataUrl = await blobToDataUrl(blob);
    const variables: Record<string,string> = {};
    const tokensInPrompt = new Set(String(template?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m:string)=> m.replace(/^[\[]|[\]]$/g,'')) || []);
    if (source !== 'vehicle') {
      const builtinNeeded = ['BRAND','MODEL','COLOR_FINISH','ACCENTS'].filter((k)=> tokensInPrompt.has(k));
      const missing: string[] = [];
      for (const k of builtinNeeded){ const val = varState[k] || ''; if (val) variables[k]=val; else missing.push(k); }
      if (builtinNeeded.length && missing.length){ toast.error(`Please fill: ${missing.join(', ')}`); setBusy(false); setPendingKeys(null); setCropUrl(null); return; }
    }
    const vars = Array.isArray(template?.variables)? (template.variables as TemplateVariableDef[]) : [];
    for (const v of vars){ const key = String(v?.key||'').trim(); if (!key || ['BRAND','MODEL','COLOR_FINISH','ACCENTS','COLOR_FINISH_ACCENTS'].includes(key)) continue; if (!tokensInPrompt.has(key)) continue; const val = varState[key] || ''; if (val) variables[key]=val; }
    setBusy(true);
    try {
      const payload: GeneratePayload = { templateId: template?.id, templateSlug: template?.slug, userImageKeys: pendingKeys || [], userImageDataUrls: [dataUrl], variables };
      const res = await fetch('/api/templates/generate',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); let data: { url?: string; key?: string; error?: string } = {}; try { data = await res.json(); } catch { data = {}; } if (!res.ok) { toast.error(data?.error || 'Generation failed'); return; } if (data?.url) setResultUrl(String(data.url)); if (data?.key) setResultKey(String(data.key));
    } finally {
      setBusy(false);
      setPendingKeys(null);
      setCropUrl(null);
    }
  }

  async function openDesigner(){
    try {
      // Prefer generated image (resultKey) if present; otherwise fallback to currently selected source
      let bgKey: string | null = (activeKey || resultKey) || null;
      if (!bgKey) {
        if (source==='vehicle') bgKey = selectedVehicleKey; else bgKey = browseSelected;
      }
      if (!bgKey) { toast.error('Select or generate an image first.'); return; }
      const { getViewUrl } = await import('@/lib/view-url-client');
      const bg = await getViewUrl(bgKey);
      if (!bg) { toast.error('Could not fetch image'); return; }
      setBusy(true); setMasking(true);
      const rem = await fetch('/api/tools/rembg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2_key: bgKey, model: (template?.rembg?.model as 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait') || 'General Use (Heavy)', operating_resolution: (template?.rembg?.operating_resolution as '1024x1024'|'2048x2048') || '2048x2048', output_format: (template?.rembg?.output_format as 'png'|'webp') || 'png', refine_foreground: typeof template?.rembg?.refine_foreground === 'boolean' ? !!template.rembg.refine_foreground : true, output_mask: !!template?.rembg?.output_mask })
      }).then(r=>r.json()).catch(()=>({}));
      const fg = rem?.image?.url || null; const mk = rem?.mask_image?.url || null; if (!fg) { toast.error(rem?.error || 'Foreground mask failed'); return; }
      _setDesignBgUrl(bg); _setDesignFgUrl(fg); _setDesignMaskUrl(mk || null); setDesigning(true);
    } finally { setBusy(false); setMasking(false); }
  }

  // Always jump into Designer once a result is available
  useEffect(()=>{
    try {
      if (resultKey && !designing) {
        openDesigner();
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  return (
    <div className="space-y-4">
      {busy ? (
        <div className="p-10 min-h-[16rem] grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Lottie animationData={carLoadAnimation as unknown} loop style={{ width: 280, height: 170 }} />
            <div className="text-sm text-white/80">{masking ? 'Cutting out the car…' : 'Generating… this may take a moment'}</div>
          </div>
        </div>
      ) : designing && (activeKey || resultKey) ? (
        <div className="space-y-3">
          <Designer
            bgKey={(activeKey || resultKey) as string}
            rembg={{ enabled: true, model: (template?.rembg?.model as 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait') || 'General Use (Heavy)', operating_resolution: (template?.rembg?.operating_resolution as '1024x1024'|'2048x2048') || '2048x2048', output_format: (template?.rembg?.output_format as 'png'|'webp') || 'png', refine_foreground: typeof template?.rembg?.refine_foreground === 'boolean' ? !!template.rembg.refine_foreground : true, output_mask: !!template?.rembg?.output_mask }}
            onClose={()=> setDesigning(false)}
            onSave={async(blob)=>{
              try {
                const filename = `design-${Date.now()}.png`;
                const file = new File([blob], filename, { type: 'image/png' });
                const form = new FormData();
                form.append('file', file, filename);
                form.append('path', 'library');
                const res = await fetch('/api/storage/upload', { method:'POST', body: form });
                if (!res.ok) { try { const d=await res.json(); toast.error(d?.error||'Failed to save'); } catch { toast.error('Failed to save'); } return; }
                setDesigning(false);
              } catch {}
            }}
            saveLabel={'Save'}
            aspectRatio={typeof template?.aspectRatio === 'number' ? Number(template?.aspectRatio) : undefined}
            onReplaceBgKey={(newKey, newUrl)=>{ try { if (newKey) { setActiveKey(newKey); if (newUrl) setActiveUrl(newUrl); } } catch {} }}
          />
        </div>
      ) : resultUrl ? (
        <div className="space-y-3">
          <div className="w-full">
            {/* eslint-disable-next-line @next/next/no-img-element * /}
            <img src={(activeUrl || resultUrl)} alt="result" className="w-full h-auto rounded" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button onClick={()=>{ setResultUrl(null); }}>Try again</Button>
            <div className="flex items-center gap-2">
              {true ? (
                <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" onClick={openDesigner}>Add text</Button>
              ) : null}
              <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" disabled={upscaleBusy || !resultKey} onClick={async()=>{
                if (!resultKey) return;
                setUpscaleBusy(true);
                try {
                  let payload: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: String(resultKey) };
                  try {
                    const { getViewUrl } = await import('@/lib/view-url-client');
                    const url: string | null = await getViewUrl(String(resultKey));
                    if (url) {
                      const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img=new Image(); img.onload=()=> resolve({ w: img.naturalWidth||img.width, h: img.naturalHeight||img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
                      if (dims && dims.w>0 && dims.h>0) { payload = { r2_key: String(resultKey), original_width: dims.w, original_height: dims.h }; }
                    }
                  } catch {}
                  const res = await fetch('/api/tools/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  const data = await res.json().catch(()=>({}));
                  if (res.status === 402) { toast.error('Not enough credits. Top up in Billing.'); return; }
                  if (!res.ok || !data?.url || !data?.key) { toast.error(data?.error || 'Upscale failed'); return; }
                  const entry = { key: String(data.key), url: String(data.url) };
                  setUpscales((prev)=> [...prev, entry]);
                  setActiveKey(entry.key);
                  setActiveUrl(entry.url);
                } finally { setUpscaleBusy(false); }
              }}>{upscales.length ? 'Upscale again' : 'Upscale'}</Button>
            <Button onClick={async()=>{
              try {
                const r = await fetch((activeUrl || resultUrl), { cache:'no-store' });
                const blob = await r.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `image-${Date.now()}.jpg`;
                document.body.appendChild(a);
                a.click();
                setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
              } catch {}
            }}>Download</Button>
            </div>
          </div>
          {upscales.length ? (
            <div className="space-y-2">
              {upscales.map((u, idx)=> (
                <div key={u.key} className="flex items-center gap-2">
                  <div className="text-xs text-white/70">Attempt {idx+1}</div>
                  <Select defaultValue={`up-${idx}`} onValueChange={(v)=>{
                    if (v === 'orig') { setActiveKey(resultKey); setActiveUrl(resultUrl); }
                    else { setActiveKey(u.key); setActiveUrl(u.url); }
                  }}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Choose image" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="orig">Original</SelectItem>
                      <SelectItem value={`up-${idx}`}>Upscale #{idx+1}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="text-xs text-white/60">Designer will use the currently selected image.</div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
      {(() => { const tokensInPrompt = new Set(String(template?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m:string)=> m.replace(/^[\[]|[\]]$/g,'')) || []); const builtinNeeded = (source !== 'vehicle') ? ['BRAND','MODEL','COLOR_FINISH','ACCENTS'].filter((k)=> tokensInPrompt.has(k)) : []; const customDefs: TemplateVariableDef[] = Array.isArray(template?.variables) ? (template.variables as TemplateVariableDef[]).filter((v:TemplateVariableDef)=> tokensInPrompt.has(String(v?.key || '')) && !['BRAND','BRAND_CAPS','MODEL','COLOR_FINISH','ACCENTS','COLOR_FINISH_ACCENTS'].includes(String(v?.key||''))) : []; if (!builtinNeeded.length && !customDefs.length) return null; return (<div className="space-y-2"><div className="text-sm font-medium">Options</div><div className="space-y-2">{builtinNeeded.map((key)=> (<div key={key} className="space-y-1"><div className="text-xs text-white/70">{key.replace(/_/g,' ').toLowerCase().replace(/\b\w/g,(c)=>c.toUpperCase())}</div><Input value={varState[key]||''} onChange={(e)=> setVarState(prev=>({ ...prev, [key]: e.target.value }))} placeholder={key} /></div>))}{customDefs.map((v:TemplateVariableDef)=>{ const key = String(v?.key||'').trim(); if (!key) return null; const type = String(v?.type||'text'); const label = String(v?.label||key); if (type==='select' && Array.isArray(v?.options) && v.options.length){ return (<div key={key} className="space-y-1"><div className="text-xs text-white/70">{label}</div><Select value={varState[key]||''} onValueChange={(val)=> setVarState(prev=>({ ...prev, [key]: val }))}><SelectTrigger className="h-9"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger><SelectContent>{v.options.map((opt:string,i:number)=>(<SelectItem key={`${key}-${i}`} value={opt}>{opt}</SelectItem>))}</SelectContent></Select></div>); } if (type==='color'){ return (<div key={key} className="space-y-1"><div className="text-xs text-white/70">{label}</div><div className="flex items-center gap-2"><input type="color" value={varState[key]||'#ffffff'} onChange={(e)=> setVarState(prev=>({ ...prev, [key]: e.target.value }))} className="h-9 w-12 rounded bg-transparent border border-[color:var(--border)]" /><Input className="w-36" value={varState[key]||'#ffffff'} onChange={(e)=> setVarState(prev=>({ ...prev, [key]: e.target.value }))} placeholder="#ffffff" /></div></div>); } return (<div key={key} className="space-y-1"><div className="text-xs text-white/70">{label}</div><Input value={varState[key]||''} onChange={(e)=> setVarState(prev=>({ ...prev, [key]: e.target.value }))} placeholder={label} /></div>); })}</div></div>); })()}

      <div className="space-y-2">
        <div className="text-sm font-medium">Source</div>
        <Select value={source} onValueChange={(v)=>setSource(v as 'vehicle'|'upload'|'workspace')}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select source" /></SelectTrigger>
          <SelectContent>
            {(Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user']).includes('vehicle') ? (
            <SelectItem value="vehicle">Your vehicles</SelectItem>
            ) : null}
            {(Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user']).includes('user') ? (
              <>
            <SelectItem value="upload">Upload image</SelectItem>
            <SelectItem value="workspace">Browse library</SelectItem>
              </>
            ) : null}
          </SelectContent>
        </Select>
        {source==='vehicle' ? (
          <div className="space-y-2">
            {profileVehicles.length ? (
              <div className="flex items-center gap-2">
                <div className="text-xs text-white/70">Vehicle</div>
                <Select value={(() => { const v = findVehicleForSelected(); if (!v) return ''; const i = profileVehicles.indexOf(v); return String(i); })()} onValueChange={(v)=>{ const idx = parseInt(v, 10); const vobj = profileVehicles[idx]; if (!vobj) return; const slug = uniqueSlugForIndex(profileVehicles as Array<{ make:string; model:string; type:string }>, idx); const first = vehiclePhotos.find(k=> (k||'').includes(`/vehicles/${slug}/`)) || null; setSelectedVehicleKey(first); }}>
                  <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>
                    {profileVehicles.map((v,i)=> (<SelectItem key={`${v.make}-${v.model}-${i}`} value={String(i)}>{v.make} {v.model} ({v.type})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-white/70">No vehicles found. <Button size="sm" variant="secondary" onClick={()=>{ try { window.dispatchEvent(new CustomEvent('open-profile')); setTimeout(()=>{ try { window.dispatchEvent(new CustomEvent('highlight-vehicles')); } catch {} }, 300); } catch {} }}>Add vehicle</Button></div>
            )}
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-2">
                {vehiclePhotos.length ? vehiclePhotos.map((k)=> (
                  <button key={k} onClick={()=>setSelectedVehicleKey(k)} className="relative focus:outline-none shrink-0 w-28">
                    <div className={`w-28 rounded p-0.5 ${selectedVehicleKey===k ? 'bg-primary' : 'bg-[color:var(--border)]'}`}>
                      <div className="rounded overflow-hidden"><AdminVehicleImage storageKey={k} /></div>
                    </div>
                  </button>
                )) : (
                  <div className="text-sm text-white/60">No vehicle photos found. Upload in profile.</div>
                )}
              </div>
            </div>
          </div>
        ) : source==='upload' ? (
          <div className="space-y-2"><DropZone accept="image/*" onDrop={handleUploadFiles} disabled={uploading}><div className="flex flex-col items-center gap-2 py-10"><UploadIcon className="w-[1.25rem] h-[1.25rem] text-white/70" /><div className="text-sm text-white/80">Drag and drop an image</div><div className="text-xs text-white/60">or click to browse</div></div></DropZone>{uploading ? <div className="text-sm text-white/60">Uploading…</div> : null}{browseSelected ? <div className="text-xs text-white/60">Uploaded: {browseSelected}</div> : null}</div>
        ) : (
          <div className="h-[300px] border border-[color:var(--border)] rounded p-2 overflow-hidden"><R2FileTree onFileSelect={(k)=> setBrowseSelected(k)} selectedKeys={browseSelected ? [browseSelected] : []} /></div>
        )}
      </div>

      <div><Button className="w-full" onClick={generate} disabled={busy}>Generate</Button></div>
        </>
      )}
      <FixedAspectCropper
        open={cropOpen}
        imageUrl={cropUrl}
        aspectRatio={typeof template?.aspectRatio === 'number' ? Number(template.aspectRatio) : 1}
        title="Crop image to match template"
        onCancel={()=>{ setCropOpen(false); setCropUrl(null); setPendingKeys(null); }}
        onCropped={onCroppedBlob}
      />
    </div>
  );
}
*/

function AdminEditTemplate({ template, onSaved }: { template: TemplateDisplay; onSaved?: ()=>void }){
  const [name, setName] = useState<string>(String(template?.name || ''));
  const [falModelSlug, setFalModelSlug] = useState<string>(String(template?.falModelSlug || 'fal-ai/gemini-25-flash-image/edit'));
  const [description, setDescription] = useState<string>(String(template?.description || ''));
  const [prompt, setPrompt] = useState<string>(String(template?.prompt || ''));
  const [busy, setBusy] = useState(false);
  const builtIn = useMemo(() => new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]), []);
  const [tokenConfigs, setTokenConfigs] = useState<Record<string, { kind: 'input' | 'select' | 'color'; options: string[]; defaultValue?: string }>>({});
  const [editorFixedAspect, setEditorFixedAspect] = useState<boolean>(!!template?.fixedAspectRatio);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(typeof template?.aspectRatio === 'number' ? Number(template.aspectRatio) : undefined);
  const [imageWidth, setImageWidth] = useState<number>(()=>{ try{ const w = Number((template?.imageSize?.width) || 1280); return Math.max(1024, Math.min(4096, Math.round(w))); } catch { return 1280; } });
  const [imageHeight, setImageHeight] = useState<number>(()=>{ try{ const h = Number((template?.imageSize?.height) || 1280); return Math.max(1024, Math.min(4096, Math.round(h))); } catch { return 1280; } });
  const [allowVehicle, setAllowVehicle] = useState<boolean>(() => {
    try { const a = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user']; return a.includes('vehicle'); } catch { return true; }
  });
  const [allowUser, setAllowUser] = useState<boolean>(() => {
    try { const a = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user']; return a.includes('user'); } catch { return true; }
  });
  const [proOnly, setProOnly] = useState<boolean>(!!template?.proOnly);
  const [status, setStatus] = useState<'draft' | 'public'>((template?.status === 'draft' || template?.status === 'public') ? template.status : 'draft');
  const [maxUploadImages, setMaxUploadImages] = useState<number | ''>(()=>{ try { const n = Number(template?.maxUploadImages || 0); return Number.isFinite(n) && n>0 ? n : ''; } catch { return ''; } });
  
  const [videoCfg, setVideoCfg] = useState<AdminVideoConfig | null>(template?.video as unknown as AdminVideoConfig || null);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [missingItems, setMissingItems] = useState<string[]>([]);
  // Images editing state
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbViewUrl, setThumbViewUrl] = useState<string | null>(null);
  const [clearThumb, setClearThumb] = useState<boolean>(false);
  const [adminExistingKeys, setAdminExistingKeys] = useState<string[]>(Array.isArray(template?.adminImageKeys) ? (template!.adminImageKeys as string[]) : []);
  const [adminExistingViews, setAdminExistingViews] = useState<Record<string,string>>({});
  const [adminNewFiles, setAdminNewFiles] = useState<File[]>([]);
  const [adminNewPreviews, setAdminNewPreviews] = useState<string[]>([]);
  const [selectedThumbAdminIndex, setSelectedThumbAdminIndex] = useState<number | null>(null); // from new uploads
  const [selectedThumbExistingKey, setSelectedThumbExistingKey] = useState<string | null>(null);

  const resetImageStateFromTemplate = useCallback(()=>{
    try {
      setThumbFile(null);
      setThumbPreview(null);
      setClearThumb(false);
      setAdminNewFiles([]);
      setAdminNewPreviews([]);
      setSelectedThumbAdminIndex(null);
      setSelectedThumbExistingKey(null);
      setAdminExistingKeys(Array.isArray(template?.adminImageKeys) ? (template!.adminImageKeys as string[]) : []);
    } catch {}
  }, [template]);

  useEffect(()=>{ resetImageStateFromTemplate(); }, [template?.id, template?.slug, resetImageStateFromTemplate]);

  useEffect(()=>{
    // Build preview for thumb file when file changes; cleanup revokes created URL
    if (!thumbFile) { setThumbPreview(null); return; }
    let url: string | null = null;
    try {
      url = URL.createObjectURL(thumbFile);
      setThumbPreview(url);
    } catch {
      setThumbPreview(null);
    }
    return () => {
      try { if (url) URL.revokeObjectURL(url); } catch {}
    };
  }, [thumbFile]);

  useEffect(()=>{
    // Resolve current thumbnail view URL
    (async()=>{
      try {
        const keyRel = (template?.thumbnailKey || '').trim();
        if (!keyRel) { setThumbViewUrl(null); return; }
        const keyFull = keyRel.startsWith('admin/') ? keyRel : `admin/${keyRel}`;
        const { getViewUrl } = await import('@/lib/view-url-client');
        const url = await getViewUrl(keyFull, 'admin');
        setThumbViewUrl(typeof url === 'string' ? String(url) : null);
      } catch { setThumbViewUrl(null); }
    })();
  }, [template?.thumbnailKey]);

  useEffect(()=>{
    // Generate previews when new admin files change; cleanup revokes previous URLs
    const next: string[] = [];
    if (adminNewFiles.length) {
      for (const f of adminNewFiles) {
        try { next.push(URL.createObjectURL(f)); } catch {}
      }
    }
    setAdminNewPreviews(next);
    return () => {
      try { next.forEach((u)=> { try { URL.revokeObjectURL(u); } catch {} }); } catch {}
    };
  }, [adminNewFiles]);

  async function resolveAdminView(relKey: string): Promise<string | null> {
    try {
      const keyFull = relKey.startsWith('admin/') ? relKey : `admin/${relKey}`;
      const { getViewUrl } = await import('@/lib/view-url-client');
      const url = await getViewUrl(keyFull, 'admin');
      return typeof url === 'string' ? String(url) : null;
    } catch { return null; }
  }

  function ensureImageFilename(name: string | null | undefined): string {
    const base = String(name || 'image').trim() || 'image';
    return /\.[a-zA-Z0-9]{2,4}$/.test(base) ? base : `${base}.jpg`;
  }

  async function downloadUrl(url: string, filename?: string) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = ensureImageFilename(filename || 'image');
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ try { document.body.removeChild(a);} catch {} }, 1000);
    } catch {}
  }

  async function downloadAdminKey(relKey: string) {
    try {
      const keyFull = relKey.startsWith('admin/') ? relKey : `admin/${relKey}`;
      const scopeParam = `&scope=admin`;
      const name = relKey.split('/').pop() || 'image';
      const url = `/api/storage/file?key=${encodeURIComponent(keyFull)}${scopeParam}&download=1`;
      await downloadUrl(url, name);
    } catch {}
  }

  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      const entries = await Promise.all(adminExistingKeys.map(async (k)=> [k, await resolveAdminView(k)] as const));
      if (!cancelled) {
        const map: Record<string,string> = {};
        for (const [k, v] of entries) map[k] = v || '';
        setAdminExistingViews(map);
      }
    })();
    return ()=>{ cancelled = true; };
  }, [adminExistingKeys]);

  async function uploadAdmin(file: File, subfolder: string): Promise<string | null> {
    const form = new FormData();
    form.append('file', file);
    form.append('path', `templates/${subfolder}`);
    form.append('scope', 'admin');
    try { const res = await fetch('/api/storage/upload', { method:'POST', body: form }); const data = await res.json(); return data?.key || null; } catch { return null; }
  }

  useEffect(()=>{
    setName(String(template?.name || ''));
    setFalModelSlug(String(template?.falModelSlug || 'fal-ai/gemini-25-flash-image/edit'));
    setDescription(String(template?.description || ''));
    setPrompt(String(template?.prompt || ''));
    setEditorFixedAspect(!!template?.fixedAspectRatio);
    setAspectRatio(typeof template?.aspectRatio === 'number' ? Number(template.aspectRatio) : undefined);
    try { const w = Number((template?.imageSize?.width) || 1280); setImageWidth(Math.max(1024, Math.min(4096, Math.round(w)))); } catch {}
    try { const h = Number((template?.imageSize?.height) || 1280); setImageHeight(Math.max(1024, Math.min(4096, Math.round(h)))); } catch {}
    try {
      const srcs = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user'];
      setAllowVehicle(srcs.includes('vehicle'));
      setAllowUser(srcs.includes('user'));
    } catch {}
    setProOnly(!!template?.proOnly);
    setStatus((template?.status === 'draft' || template?.status === 'public') ? template.status : 'draft');
    try { const n = Number(template?.maxUploadImages || 0); setMaxUploadImages(Number.isFinite(n) && n>0 ? n : ''); } catch {}
    try { setVideoCfg(template?.video as unknown as AdminVideoConfig || null); } catch {}
  }, [template]);

  // Detect unknown tokens from prompt and seed/edit token configs
  useEffect(()=>{
    const raw = Array.from((prompt.match(/\[([A-Z0-9_]+)\]/g) || [])).map((m)=> m.replace(/^[\[]|[\]]$/g, ""));
    const unique = Array.from(new Set(raw));
    const unknown = unique.filter((k)=> !builtIn.has(k));
    setTokenConfigs((prev)=>{
      const next: Record<string, { kind: 'input' | 'select' | 'color'; options: string[]; defaultValue?: string }> = {};
      for (const key of unknown) {
        if (prev[key]) { next[key] = prev[key]; continue; }
        // Seed from existing template variables when available
        let kind: 'input' | 'select' | 'color' = 'input';
        let options: string[] = [];
        let defaultValue: string | undefined = undefined;
        try {
          const found = Array.isArray(template?.variables) ? (template.variables as TemplateVariableDef[]).find((v: TemplateVariableDef)=> String(v?.key||'').trim() === key) : null;
          if (found) {
            const t = String((found as { type?: string })?.type || 'text');
            if (t === 'select') { kind = 'select'; options = Array.isArray((found as { options?: unknown[] })?.options) ? ((found as { options?: string[] }).options as string[]) : []; }
            else if (t === 'color') { kind = 'color'; const d = (found as { defaultValue?: unknown })?.defaultValue; if (typeof d === 'string') defaultValue = d; }
          }
        } catch {}
        next[key] = { kind, options, defaultValue };
      }
      return next;
    });
  }, [prompt, template, builtIn]);

  function validateAndSave() {
    const id = String(template?.id || '');
    if (!id) { toast.error('Missing template id'); return; }
    if (!name.trim() || !prompt.trim()) { toast.error('Name and prompt are required'); return; }
    
    // Check for missing thumbnail or admin images
    const missing: string[] = [];
    
    // Check if there's any thumbnail (existing, new file, or selected from admin images)
    const hasThumbnail = !!(
      (!clearThumb && template?.thumbnailKey) || // existing thumbnail not cleared
      thumbFile || // new thumbnail file
      selectedThumbExistingKey || // selected from existing admin images
      selectedThumbAdminIndex !== null // selected from new admin images
    );
    
    // Check if there are any admin images (existing or new)
    const hasAdminImages = (adminExistingKeys.length > 0) || (adminNewFiles.length > 0);
    
    if (!hasThumbnail) missing.push('Thumbnail');
    if (!hasAdminImages) missing.push('Admin Images');
    
    if (missing.length > 0) {
      setMissingItems(missing);
      setShowWarningDialog(true);
      return;
    }
    
    // If everything is present, proceed with save
    save();
  }

  async function save(){
    const id = String(template?.id || '');
    if (!id) { toast.error('Missing template id'); return; }
    if (!name.trim() || !prompt.trim()) { toast.error('Name and prompt are required'); return; }
    if (!allowVehicle && !allowUser) { toast.error('Enable at least one image source (car or user).'); return; }
    // Validate dropdown tokens have >= 2 options
    for (const [key, cfg] of Object.entries(tokenConfigs)) {
      if (cfg.kind === 'select') {
        const opts = (cfg.options || []).filter((x)=> String(x||'').trim().length > 0);
        if (opts.length < 2) { toast.error(`Token ${key} requires at least 2 options.`); return; }
      }
    }
    if (maxUploadImages !== '' && (!Number.isFinite(Number(maxUploadImages)) || Number(maxUploadImages) <= 0)) { toast.error('Max images must be a positive number'); return; }
    setBusy(true);
    try{
      // Compute hashes for dedupe between thumbnail and new admin images
      let thumbHex: string | null = null;
      let adminHexes: string[] = [];
      try {
        if (thumbFile) {
          const buf = new Uint8Array(await thumbFile.arrayBuffer());
          const digest = await crypto.subtle.digest('SHA-256', buf);
          thumbHex = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
        }
        if (adminNewFiles.length) {
          const arrs = await Promise.all(adminNewFiles.map((f)=> f.arrayBuffer()));
          adminHexes = await Promise.all(arrs.map(async (ab)=>{
            const dg = await crypto.subtle.digest('SHA-256', new Uint8Array(ab));
            return Array.from(new Uint8Array(dg)).map(b=>b.toString(16).padStart(2,'0')).join('');
          }));
        }
      } catch {}

      // Upload new admin images
      const uploadedAdminKeys: string[] = [];
      for (const f of adminNewFiles) {
        const key = await uploadAdmin(f, 'images');
        if (key) uploadedAdminKeys.push(key.replace(/^admin\//, ''));
      }
      // Build final adminImageKeys list
      const nextAdminKeys: string[] = [...adminExistingKeys.filter(Boolean), ...uploadedAdminKeys];

      // Determine thumbnail key
      let nextThumbKey: string | null | undefined = undefined; // undefined => leave as-is
      if (clearThumb) {
        nextThumbKey = null;
      } else if (selectedThumbExistingKey) {
        nextThumbKey = selectedThumbExistingKey;
      } else if (selectedThumbAdminIndex !== null && uploadedAdminKeys[selectedThumbAdminIndex]) {
        nextThumbKey = uploadedAdminKeys[selectedThumbAdminIndex] as string;
      } else if (thumbHex && adminHexes.length) {
        const matchIdx = adminHexes.findIndex((h)=> h === thumbHex);
        if (matchIdx >= 0 && uploadedAdminKeys[matchIdx]) {
          nextThumbKey = uploadedAdminKeys[matchIdx] as string;
        }
      }
      // If still not determined and a new thumbnail file is provided, upload it
      if (typeof nextThumbKey === 'undefined' && thumbFile) {
        const up = await uploadAdmin(thumbFile, 'thumbnails');
        if (up) nextThumbKey = up.replace(/^admin\//,''); else nextThumbKey = undefined;
      }

      const unknownVarDefs = Object.entries(tokenConfigs).map(([key, cfg])=> ({
        key,
        label: key,
        required: false,
        type: cfg.kind === 'select' ? 'select' : (cfg.kind === 'color' ? 'color' : 'text'),
        options: cfg.kind === 'select' ? cfg.options : undefined,
        defaultValue: cfg.kind === 'color' && typeof (cfg as { defaultValue?: unknown }).defaultValue === 'string' ? (cfg as { defaultValue?: string }).defaultValue : undefined,
      }));
      const allowedImageSources = [allowVehicle ? 'vehicle' : null, allowUser ? 'user' : null].filter(Boolean);
      const body: Record<string, unknown> = {
        id,
        name: name.trim(),
        description: description || '',
        prompt: prompt.trim(),
        falModelSlug: falModelSlug || undefined,
        variables: unknownVarDefs,
        imageSize: { width: imageWidth, height: imageHeight },
        fixedAspectRatio: editorFixedAspect,
        aspectRatio: editorFixedAspect ? (typeof aspectRatio === 'number' ? Number(aspectRatio) : undefined) : undefined,
        allowedImageSources,
        proOnly: !!proOnly,
        status,
        maxUploadImages: ((): number | undefined => {
          const n = Number(maxUploadImages);
          return Number.isFinite(n) && n > 0 ? Math.min(25, Math.round(n)) : undefined;
        })(),
        video: (videoCfg as unknown),
      };
      // Include admin images update
      body.adminImageKeys = nextAdminKeys;
      // Include thumbnail update only if changed/explicitly set
      if (clearThumb) body.thumbnailKey = null;
      else if (typeof nextThumbKey === 'string') body.thumbnailKey = nextThumbKey;
      else if (typeof nextThumbKey === 'undefined' && !thumbFile && !selectedThumbExistingKey && selectedThumbAdminIndex === null) {
        // leave unchanged
      }
      const res = await fetch('/api/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) { toast.error(data?.error || 'Failed to update template'); return; }
      if (onSaved) onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input value={name} onChange={(e)=> setName(e.target.value)} placeholder="Template name" />
        <div>
          <Select value={/bytedance\/seedream\/v4\/edit$/i.test(falModelSlug) ? 'seedream' : 'gemini'} onValueChange={(v)=> setFalModelSlug(v === 'seedream' ? 'fal-ai/bytedance/seedream/v4/edit' : 'fal-ai/gemini-25-flash-image/edit')}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Model" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini 2.5 Flash (default)</SelectItem>
              <SelectItem value="seedream">Seedream 4.0 (Bytedance)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <AdminTemplateImages
        mode="edit"
        adminExistingKeys={adminExistingKeys}
        adminExistingViews={adminExistingViews}
        onRemoveExistingKey={(key)=> setAdminExistingKeys((prev)=> prev.filter((x)=> x!==key))}
        onDownloadExistingKey={(key)=> downloadAdminKey(key)}
        adminNewPreviews={adminNewPreviews}
        onRemoveNewAdminIndex={(index)=> setAdminNewFiles((prev)=> prev.filter((_, idx)=> idx!==index))}
        onDropAdminFiles={(files)=> setAdminNewFiles((prev)=> [...prev, ...files])}
        selectedThumbExistingKey={selectedThumbExistingKey}
        selectedThumbAdminIndex={selectedThumbAdminIndex}
        thumbPreview={thumbPreview}
        thumbViewUrl={thumbViewUrl}
        onSetThumbExisting={(key)=>{ setSelectedThumbExistingKey(key); setSelectedThumbAdminIndex(null); setThumbFile(null); setClearThumb(false); }}
        onSetThumbAdminIndex={(index)=>{ setSelectedThumbAdminIndex(index); setSelectedThumbExistingKey(null); setThumbFile(null); setClearThumb(false); }}
        onDropThumbFile={(file)=>{ setSelectedThumbExistingKey(null); setSelectedThumbAdminIndex(null); setClearThumb(false); setThumbFile(file); }}
        onClearThumb={()=>{ setThumbFile(null); setSelectedThumbExistingKey(null); setSelectedThumbAdminIndex(null); setThumbViewUrl(null); setClearThumb(true); }}
        onDownloadThumbExistingOrView={()=>{ if (selectedThumbExistingKey) downloadAdminKey(selectedThumbExistingKey); else if (template?.thumbnailKey) downloadAdminKey(String(template.thumbnailKey)); else if (thumbViewUrl) { const name = ensureImageFilename((template?.thumbnailKey || '').split('/').pop() || 'thumbnail'); downloadUrl(thumbViewUrl, name); } }}
      />
      {/* Foreground masking is always enabled by default; options removed */}
      <Textarea value={description} onChange={(e)=> setDescription(e.target.value)} placeholder="Description (optional)" rows={2} />
      <Textarea value={prompt} onChange={(e)=> setPrompt(e.target.value)} placeholder="Prompt" rows={6} />
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Fixed aspect ratio</div>
          <div className="text-xs text-white/60">If enabled, users must crop uploads to the template&apos;s aspect ratio.</div>
        </div>
        <div className="flex items-center gap-2">
          {editorFixedAspect && typeof aspectRatio === 'number' ? (<div className="text-xs text-white/60">AR: {Number(aspectRatio).toFixed(3)}</div>) : null}
          <Switch checked={editorFixedAspect} onCheckedChange={(v)=> setEditorFixedAspect(!!v)} />
        </div>
      </div>
      {/bytedance\/seedream\/v4\/edit$/i.test(falModelSlug) ? (
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="text-sm font-medium">Image size</div>
            <div className="text-xs text-white/60">Width and height must be between 1024 and 4096. Keep the template&apos;s intended aspect ratio.</div>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" className="w-24 h-9" value={imageWidth} onChange={(e)=> setImageWidth(Math.max(1024, Math.min(4096, Math.round(Number(e.target.value||0))))) } placeholder="width" />
            <span className="text-xs text-white/50">×</span>
            <Input type="number" className="w-24 h-9" value={imageHeight} onChange={(e)=> setImageHeight(Math.max(1024, Math.min(4096, Math.round(Number(e.target.value||0))))) } placeholder="height" />
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Allowed sources</div>
          <div className="text-xs text-white/60">Enable car images and/or user images (upload or workspace).</div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><span className="text-xs text-white/70">Car</span><Switch checked={allowVehicle} onCheckedChange={(v)=> setAllowVehicle(!!v)} /></div>
          <div className="flex items-center gap-2"><span className="text-xs text-white/70">User</span><Switch checked={allowUser} onCheckedChange={(v)=> setAllowUser(!!v)} /></div>
          <div className="flex items-center gap-2"><span className="text-xs text-white/70">Pro only</span><Switch checked={proOnly} onCheckedChange={(v)=> setProOnly(!!v)} /></div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/70">Status</span>
            <Select value={status} onValueChange={(v)=> setStatus((v as 'draft' | 'public') || 'draft')}>
              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Video generation config (shared component) */}
      <AdminTemplateVideo value={videoCfg as AdminVideoConfig} onChange={(next)=>{
        try { setVideoCfg(next as AdminVideoConfig); } catch {}
      }} />
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Required images</div>
          <div className="text-xs text-white/60">How many images a user must provide to use this template. They can mix sources (upload, vehicles, workspace).</div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" className="w-24 h-9" value={maxUploadImages} onChange={(e)=>{ const v = e.target.value; if (v==='') setMaxUploadImages(''); else setMaxUploadImages(Math.max(1, Math.min(25, Math.round(Number(v)||0)))); }} placeholder="e.g. 1" />
        </div>
      </div>
      
      {Object.keys(tokenConfigs).length ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">Detected tokens</div>
          <ul className="space-y-2">
            {Object.entries(tokenConfigs).map(([key, cfg])=> (
              <li key={key} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-start">
                <div className="sm:col-span-2">
                  <div className="text-xs text-white/70">[{key}]</div>
                  <Select defaultValue={cfg.kind} onValueChange={(v)=> setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: (v as 'input'|'select'|'color'), options: prev[key]?.options || [], defaultValue: prev[key]?.defaultValue } }))}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Field type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="input">Input</SelectItem>
                      <SelectItem value="select">Dropdown</SelectItem>
                      <SelectItem value="color">Color Picker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cfg.kind === 'select' ? (
                  <div className="sm:col-span-3 space-y-1">
                    <div className="text-xs text-white/70">Options (add at least two)</div>
                    <div className="flex gap-2">
                      <Input placeholder="Add option" onKeyDown={(e)=>{
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: 'select', options: [...(prev[key]?.options || []), val] } }));
                          try { (e.target as HTMLInputElement).value = ""; } catch {}
                        }
                      }} />
                      <Button variant="ghost" size="sm" className="text-xs" onClick={(e)=>{
                        e.preventDefault();
                        const el = (e.currentTarget.previousSibling as HTMLInputElement | null);
                        const val = (el && 'value' in el) ? String((el as HTMLInputElement).value || '').trim() : '';
                        if (val) setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: 'select', options: [...(prev[key]?.options || []), val] } }));
                        try { if (el && 'value' in el) (el as HTMLInputElement).value = ''; } catch {}
                      }}>Add</Button>
                    </div>
                    {(cfg.options || []).length ? (
                      <div className="flex flex-wrap gap-1">
                        {(cfg.options || []).map((opt, idx)=> (
                          <span key={`${opt}-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 text-xs">
                            {opt}
                            <Button variant="ghost" size="sm" className="ml-1 h-5 px-1 text-white/60 hover:text-white" onClick={()=> setTokenConfigs((prev)=> ({ ...prev, [key]: { kind: 'select', options: (prev[key]?.options || []).filter((o,i)=> i!==idx) } }))}>×</Button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {cfg.kind === 'color' ? (
                  <div className="sm:col-span-3 space-y-1">
                    <div className="text-xs text-white/70">Default color (optional)</div>
                    <div className="flex items-center gap-2">
                      <input type="color" value={cfg.defaultValue || '#ffffff'} onChange={(e)=> setTokenConfigs((prev)=> ({ ...prev, [key]: { ...prev[key], kind: 'color', defaultValue: e.target.value, options: prev[key]?.options || [] } }))} className="h-9 w-12 rounded bg-transparent border border-[color:var(--border)]" />
                      <Input className="w-36" value={cfg.defaultValue || ''} onChange={(e)=> setTokenConfigs((prev)=> ({ ...prev, [key]: { ...prev[key], kind: 'color', defaultValue: e.target.value, options: prev[key]?.options || [] } }))} placeholder="#ffffff" />
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex justify-end"><Button size="sm" onClick={validateAndSave} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></div>
      
      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing Template Assets</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div className="mb-2">The following items are missing from this template:</div>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {missingItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="mt-3">
                  Templates without these assets may not display properly. Do you want to continue anyway?
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowWarningDialog(false); save(); }}>
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

//
