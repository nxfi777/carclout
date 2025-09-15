"use client";
import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardWorkspacePanel } from "@/components/dashboard-workspace-panel";
import MusicSuggestions from "@/components/music/music-suggestions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DropZone } from "@/components/ui/drop-zone";
import { Switch } from "@/components/ui/switch";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer
} from "recharts";
import dynamic from "next/dynamic";
import carLoadAnimation from "@/public/carload.json";
import { R2FileTree } from "@/components/ui/file-tree";
import { Skeleton } from "@/components/ui/skeleton";
import FixedAspectCropper from "@/components/ui/fixed-aspect-cropper";
import TextBehindEditor from "@/components/templates/text-behind-editor";
import { toast } from "sonner";
import { confirmToast, promptToast } from "@/components/ui/toast-helpers";

// Disable SSR for Lottie
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

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
  variables?: TemplateVariableDef[];
  prompt?: string;
  falModelSlug?: string;
  fixedAspectRatio?: boolean;
  aspectRatio?: number;
  allowedImageSources?: Array<'vehicle' | 'user'>;
  imageSize?: { width: number; height: number } | null;
  favoriteCount?: number;
  rembg?: {
    enabled?: boolean;
    model?: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait';
    operating_resolution?: '1024x1024' | '2048x2048';
    output_format?: 'png' | 'webp';
    refine_foreground?: boolean;
    output_mask?: boolean;
  } | null;
};

type Vehicle = { make: string; model: string; type: string; colorFinish?: string; accents?: string };

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
  variables: Array<{
    key: string;
    label: string;
    required: boolean;
    type: 'select' | 'color' | 'text';
    options?: string[];
    defaultValue?: string;
  }>;
  rembg: {
    enabled: boolean;
    model: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait';
    operating_resolution: '1024x1024' | '2048x2048';
    output_format: 'png' | 'webp';
    refine_foreground: boolean;
    output_mask: boolean;
  };
};

type GeneratePayload = {
  templateId?: string;
  templateSlug?: string;
  userImageKeys: string[];
  userImageDataUrls?: string[];
  variables: Record<string, string>;
};

const _BUILT_IN_TOKENS = new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]);

function AdminPageInner() {
  const [tab, setTab] = useState<"analytics" | "workspace" | "templates" | "music" | "channels" | "moderation" | "announcements">("analytics");
  const [me, setMe] = useState<{ role?: string } | null>(null);
  const searchParams = useSearchParams();
  useEffect(() => {
    (async () => {
      try { const m = await fetch('/api/me', { cache: 'no-store' }).then(r=>r.json()); setMe({ role: m?.role }); } catch {}
    })();
  }, []);
  useEffect(() => {
    const t = String(searchParams?.get('tab') || '').toLowerCase();
    if (t === 'analytics' || t === 'workspace' || t === 'templates' || t === 'music' || t === 'channels' || t === 'moderation' || t === 'announcements') {
      setTab(t as "analytics" | "workspace" | "templates" | "music" | "channels" | "moderation" | "announcements");
    } else {
      setTab('analytics');
    }
  }, [searchParams]);
  if (me?.role !== 'admin') return <div className="p-6">Forbidden</div>;
  return (
    <main className="p-6 space-y-4 bg-[var(--background)]">
      {/* Dock replaces inline tab buttons */}
      {tab === 'analytics' && <AdminAnalyticsTab />}
      {tab === 'workspace' && <DashboardWorkspacePanel scope="admin" />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'music' && <MusicSuggestions admin />}
      {tab === 'channels' && <ChannelsTab />}
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
    creditsSpent: number;
    spendingUsers: number;
    payingUsers: number;
    avgUserCostUsd: number;
    avgUserSpendUsd: number;
    subscribers: number;
  } | null>(null);
  const [series, setSeries] = useState<Array<{ date: string; revenueUsd: number; creditsSpent: number }>>([]);

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
    revenue: { label: 'Revenue (USD)', color: 'oklch(0.769 0.188 70.08)' },
    spend: { label: 'Credits Spent', color: 'oklch(0.627 0.265 303.9)' },
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Current revenue</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.totalRevenueUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">from credit top-ups</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Average user cost</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-24" /> : <div className="text-2xl font-semibold">${(metrics?.avgUserCostUsd || 0).toFixed(2)}</div>}
            <div className="text-xs text-white/60">per active spending user</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Subscribers</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-6 w-16" /> : <div className="text-2xl font-semibold">{metrics?.subscribers || 0}</div>}
            <div className="text-xs text-white/60">users with a plan</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Bestow credits</CardTitle></CardHeader>
        <CardContent>
          <GrantCreditsForm />
          <div className="mt-3">
            <UserCreditsSearch />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue and usage</CardTitle></CardHeader>
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

function UserCreditsSearch(){
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<{ displayName?: string|null; name?: string|null; email: string; credits: number }>>([]);
  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}&limit=50`, { cache:'no-store' }).then(r=>r.json()).catch(()=>({ users: [] }));
      setRows(Array.isArray(res?.users) ? res.users : []);
    } finally { setLoading(false); }
  }, [q]);
  useEffect(()=>{
    const t = setTimeout(run, 250);
    let es: EventSource | null = null;
    (async ()=>{
      try {
        es = new EventSource(`/api/admin/users/live?q=${encodeURIComponent(q)}&limit=50`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data || '{}');
            const users = Array.isArray(data?.users) ? data.users : [];
            setRows(users);
          } catch {}
        };
        es.onerror = () => { try { es?.close(); } catch {} };
      } catch {}
    })();
    return ()=> { clearTimeout(t); try { es?.close(); } catch {} };
  }, [q, run]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Search users by display name, handle, or email" className="flex-1" />
        <Button size="sm" onClick={run} disabled={loading}>{loading? 'Searching…' : 'Search'}</Button>
      </div>
      <div className="border rounded">
        <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs text-white/60 border-b">
          <div>Name</div>
          <div>Email</div>
          <div className="text-right">Credits</div>
        </div>
        <ul className="max-h-72 overflow-y-auto divide-y">
          {rows.map((u)=> (
            <li key={u.email} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm items-center">
              <div className="truncate">{u.displayName || u.name || '—'}</div>
              <div className="truncate font-mono">{u.email}</div>
              <div className="text-right">{u.credits}</div>
            </li>
          ))}
          {!rows.length ? (
            <li className="px-3 py-2 text-sm text-white/60">No users found</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

// Music tab now uses shared component

type Channel = {
  id?: string;
  slug: string;
  name?: string;
  requiredRole?: "user" | "staff" | "admin" | null;
  requiredReadRole?: "user" | "staff" | "admin" | null;
  requiredWriteRole?: "user" | "staff" | "admin" | null;
  requiredReadPlan?: "base" | "premium" | "ultra" | null;
  requiredWritePlan?: "base" | "premium" | "ultra" | null;
};
function ChannelsTab() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [name, setName] = useState("");
  const [requiredRole, setRequiredRole] = useState<string>("");
  useEffect(()=>{ (async()=>{ const r=await fetch('/api/chat/channels').then(r=>r.json()); setChannels(r?.channels||[]); })(); },[]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Channel name" className="flex-1 text-sm" />
        <Input value={requiredRole} onChange={(e)=>setRequiredRole(e.target.value)} placeholder="requiredRole (optional)" className="w-56 text-sm" />
        <Button onClick={async()=>{ if(!name) return; await fetch('/api/chat/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ name, requiredRole: requiredRole || undefined })}); setName(''); const r=await fetch('/api/chat/channels').then(r=>r.json()); setChannels(r?.channels||[]); }} className="px-3 py-2 text-sm">Create</Button>
      </div>
      {/* removed erroneous masking controls from Channels tab */}
      <ul className="space-y-1 text-sm">
        {channels.map((c: Channel)=> (
          <li key={c.id||c.slug} className="space-y-2 px-2 py-2 rounded bg-white/5">
            <div className="flex items-center justify-between">
              <span>#{c.slug}</span>
              <div className="flex items-center gap-2">
                <span className="text-white/50">{c.requiredRole || 'user'}</span>
                {c.slug !== 'general' && c.slug !== 'livestream' ? (
                  <Button variant="ghost" className="text-xs px-2 py-1" onClick={async()=>{ const ok = await confirmToast({ title: `Delete #${c.slug}?`, message: 'This action cannot be undone.' }); if(!ok) return; await fetch('/api/chat/channels', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ slug: c.slug }) }); const r=await fetch('/api/chat/channels').then(r=>r.json()); setChannels(r?.channels||[]); toast.success('Channel deleted'); }}>Delete</Button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input defaultValue={c.name || ''} placeholder="display name" className="text-sm"
                onBlur={async(e)=>{ const v=e.target.value.trim(); if (v===c.name) return; await fetch('/api/chat/channels',{method:'PATCH',headers:{'Content-Type':'application/json'}, body: JSON.stringify({ slug:c.slug, name: v })}); const r=await fetch('/api/chat/channels').then(r=>r.json()); setChannels(r?.channels||[]); }} />
              <UnifiedLevelSelect
                label="Read"
                current={computeUnifiedLevel(c, 'read')}
                onChange={async(level)=>{
                  const payload: Record<string, unknown> = { slug: c.slug };
                  if (level === '') { payload.requiredReadPlan = null; payload.requiredReadRole = null; }
                  else if (level === 'user' || level === 'admin') { payload.requiredReadRole = level; payload.requiredReadPlan = null; }
                  else { payload.requiredReadPlan = level === 'basic' ? 'base' : (level === 'premium' ? 'premium' : 'ultra'); payload.requiredReadRole = null; }
                  await fetch('/api/chat/channels',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                  const r=await fetch('/api/chat/channels').then(r=>r.json()); setChannels(r?.channels||[]);
                }}
              />
              <UnifiedLevelSelect
                label="Write"
                current={computeUnifiedLevel(c, 'write')}
                onChange={async(level)=>{
                  const payload: Record<string, unknown> = { slug: c.slug };
                  if (level === '') { payload.requiredWritePlan = null; payload.requiredWriteRole = null; }
                  else if (level === 'user' || level === 'admin') { payload.requiredWriteRole = level; payload.requiredWritePlan = null; }
                  else { payload.requiredWritePlan = level === 'basic' ? 'base' : (level === 'premium' ? 'premium' : 'ultra'); payload.requiredWriteRole = null; }
                  await fetch('/api/chat/channels',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                  const r=await fetch('/api/chat/channels').then(r=>r.json()); setChannels(r?.channels||[]);
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type UnifiedLevel = '' | 'user' | 'basic' | 'premium' | 'pro' | 'admin';
function computeUnifiedLevel(c: Channel, kind: 'read' | 'write'): UnifiedLevel {
  const role = kind === 'read' ? (c.requiredReadRole ?? c.requiredRole ?? null) : (c.requiredWriteRole ?? c.requiredRole ?? null);
  const plan = kind === 'read' ? (c.requiredReadPlan ?? null) : (c.requiredWritePlan ?? null);
  if (role === 'admin') return 'admin';
  if (role === 'user') return 'user';
  if (plan === 'base') return 'basic';
  if (plan === 'premium') return 'premium';
  if (plan === 'ultra') return 'pro';
  return '';
}

function UnifiedLevelSelect({ label, current, onChange }: { label: string; current: UnifiedLevel; onChange: (v: UnifiedLevel)=>void }) {
  return (
    <Select defaultValue={current || undefined} onValueChange={(v)=> onChange(v === 'clear' ? '' : (v as UnifiedLevel))}>
      <SelectTrigger size="sm">
        <SelectValue placeholder={`${label} level`} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="clear">clear to default</SelectItem>
        <SelectItem value="user">user</SelectItem>
        <SelectItem value="basic">basic</SelectItem>
        <SelectItem value="premium">premium</SelectItem>
        <SelectItem value="pro">pro</SelectItem>
        <SelectItem value="admin">admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

type Mute = { id: string; targetEmail: string; channels?: string[] | null; expires_at?: string | null };
function ModerationTab() {
  const [mutes, setMutes] = useState<Mute[]>([]);
  const [target, setTarget] = useState("");
  const [channels, setChannels] = useState("");
  const [duration, setDuration] = useState("");
  useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/admin/mutes',{cache:'no-store'}).then(r=>r.json()); setMutes(r?.mutes||[]);}catch{}})(); },[]);
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
  const [fixedAspect, setFixedAspect] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [allowVehicle, setAllowVehicle] = useState<boolean>(true);
  const [allowUser, setAllowUser] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  // Foreground masking (BiRefNet) options
  const [rembgEnabled, setRembgEnabled] = useState<boolean>(false);
  const [rembgModel, setRembgModel] = useState<'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait'>('General Use (Heavy)');
  const [rembgRes, setRembgRes] = useState<'1024x1024' | '2048x2048'>('2048x2048');
  const [rembgFormat, setRembgFormat] = useState<'png' | 'webp'>('png');
  const [rembgRefine, setRembgRefine] = useState<boolean>(true);
  const [rembgMask, setRembgMask] = useState<boolean>(false);
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
      if (!fixedAspect) { setAspectRatio(null); return; }
      const f = adminImageFiles[0];
      if (!f) { setAspectRatio(null); return; }
      try {
        const url = URL.createObjectURL(f);
        const img = new Image();
        await new Promise<void>((resolve, reject)=>{ img.onload = ()=>resolve(); img.onerror=()=>reject(new Error('img')); img.src=url; });
        if (!cancelled) setAspectRatio(img.naturalWidth && img.naturalHeight ? (img.naturalWidth / img.naturalHeight) : null);
        try { URL.revokeObjectURL(url); } catch {}
      } catch { if (!cancelled) setAspectRatio(null); }
    })();
    return ()=>{ cancelled=true };
  }, [fixedAspect, adminImageFiles]);

  // Default image size from first admin image, clamped to 1024..4096 and scaled retaining AR
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      if (!adminImageFiles.length || imageSizeEdited) return;
      const first = adminImageFiles[0]; if (!first) return;
      try {
        const url = URL.createObjectURL(first);
        const img = new Image();
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
  async function save() {
    if (!name || !prompt) { toast.error('Name and prompt are required'); return; }
    if (!allowVehicle && !allowUser) { toast.error('Enable at least one image source (car or user).'); return; }
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
      const unknownVarDefs: Array<{ key: string; label: string; required: boolean; type: 'select'|'color'|'text'; options?: string[]; defaultValue?: string; }> = Object.entries(tokenConfigs).map(([key, cfg])=> ({ key, label: key, required: false, type: (cfg.kind === 'select' ? 'select' : (cfg.kind === 'color' ? 'color' : 'text')) as 'select'|'color'|'text', options: cfg.kind === 'select' ? cfg.options : undefined, defaultValue: cfg.kind === 'color' && typeof (cfg as { defaultValue?: unknown }).defaultValue === 'string' && (cfg as { defaultValue?: unknown }).defaultValue ? (cfg as { defaultValue?: string }).defaultValue : undefined }));
      const allowedImageSources = ([allowVehicle ? 'vehicle' : null, allowUser ? 'user' : null].filter(Boolean) as Array<'vehicle'|'user'>);
      const rembg = { enabled: !!rembgEnabled, model: rembgModel, operating_resolution: rembgRes, output_format: rembgFormat, refine_foreground: !!rembgRefine, output_mask: !!rembgMask } as const;
      const payload: CreateTemplatePayload = { name, description, prompt, falModelSlug, thumbnailKey: thumbnailKey || undefined, adminImageKeys, fixedAspectRatio: fixedAspect, aspectRatio: aspectRatio || undefined, variables: unknownVarDefs, allowedImageSources, rembg };
      if (/bytedance\/seedream\/v4\/edit$/i.test(falModelSlug)) payload.imageSize = { width: imageWidth, height: imageHeight };
      const res = await fetch('/api/templates', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json().catch(()=>({})); toast.error(data?.error || 'Failed to create template'); return; }
      setOpen(false); setName(""); setDescription(""); setPrompt(""); setFalModelSlug("fal-ai/gemini-25-flash-image/edit"); setThumbnailFile(null); setAdminImageFiles([]); setAllowVehicle(true); setAllowUser(true); setImageWidth(1280); setImageHeight(1280); setImageSizeEdited(false);
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
            <div className="rounded border border-[color:var(--border)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Foreground masking (BiRefNet)</div>
                <Switch checked={rembgEnabled} onCheckedChange={(v)=> setRembgEnabled(!!v)} />
              </div>
              {rembgEnabled ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs text-white/70 mb-1">Model</div>
                    <Select value={rembgModel} onValueChange={(v)=> setRembgModel(v as 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait')}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select model" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General Use (Light)">General Use (Light)</SelectItem>
                        <SelectItem value="General Use (Light 2K)">General Use (Light 2K)</SelectItem>
                        <SelectItem value="General Use (Heavy)">General Use (Heavy)</SelectItem>
                        <SelectItem value="Matting">Matting</SelectItem>
                        <SelectItem value="Portrait">Portrait</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs text-white/70 mb-1">Resolution</div>
                    <Select value={rembgRes} onValueChange={(v)=> setRembgRes(v as '1024x1024'|'2048x2048')}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Resolution" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1024x1024">1024x1024</SelectItem>
                        <SelectItem value="2048x2048">2048x2048</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs text-white/70 mb-1">Output</div>
                    <Select value={rembgFormat} onValueChange={(v)=> setRembgFormat(v as 'png'|'webp')}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Format" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="png">png</SelectItem>
                        <SelectItem value="webp">webp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-white/70">Refine foreground</div>
                    <Switch checked={rembgRefine} onCheckedChange={(v)=> setRembgRefine(!!v)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-white/70">Return mask</div>
                    <Switch checked={rembgMask} onCheckedChange={(v)=> setRembgMask(!!v)} />
                  </div>
                </div>
              ) : null}
            </div>
            <Textarea value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Description (optional)" rows={2} />
            <Textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Prompt (use tokens like [BRAND], [MODEL], [COLOR_FINISH], [ACCENTS], [COLOR_FINISH_ACCENTS], [DOMINANT_COLOR_TONE])" rows={6} />
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">Fixed aspect ratio</div>
                <div className="text-xs text-white/60">If enabled, we use the first admin image to set the aspect ratio. New images must be cropped to fit.</div>
              </div>
              <div className="flex items-center gap-2">
                {fixedAspect && aspectRatio ? (<div className="text-xs text-white/60">AR: {aspectRatio.toFixed(3)}</div>) : null}
                <Switch checked={fixedAspect} onCheckedChange={(v)=> setFixedAspect(!!v)} />
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
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><span className="text-xs text-white/70">Car</span><Switch checked={allowVehicle} onCheckedChange={(v)=> setAllowVehicle(!!v)} /></div>
                <div className="flex items-center gap-2"><span className="text-xs text-white/70">User</span><Switch checked={allowUser} onCheckedChange={(v)=> setAllowUser(!!v)} /></div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-sm mb-1">Thumbnail (optional)</div>
                <DropZone accept="image/*" onDrop={(files)=> { setSelectedThumbAdminIndex(null); setThumbnailFile(files[0] || null); }}>
                  <div className="h-28 grid place-items-center text-xs text-white/70">
                    {thumbPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbPreview} alt="thumbnail" className="h-24 object-contain" />
                    ) : selectedThumbAdminIndex !== null && adminPreviews[selectedThumbAdminIndex] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={adminPreviews[selectedThumbAdminIndex]!} alt="thumbnail" className="h-24 object-contain" />
                    ) : (
                      <span>Drop an image or click to select</span>
                    )}
                  </div>
                </DropZone>
              </div>
              <div>
                <div className="text-sm mb-1">Admin images (optional)</div>
                <DropZone accept="image/*" onDrop={(files)=> setAdminImageFiles((prev)=> [...prev, ...files])}>
                  <div className="p-2 text-xs text-white/70">Drop images or click to select</div>
                </DropZone>
                {adminPreviews.length ? (
                  <ul className="mt-2 grid grid-cols-6 gap-2">
                    {adminPreviews.map((u, i)=> (
                      <li key={`${u}-${i}`} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="admin" className="w-full aspect-square object-cover rounded" />
                        <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-5 px-1.5 bg-black/60 text-white opacity-0 group-hover:opacity-100" onClick={()=> setAdminImageFiles((prev)=> prev.filter((_, idx)=> idx!==i))}>×</Button>
                        <div className="absolute bottom-1 left-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="secondary" size="sm" className="h-6 px-2 text-xs" onClick={()=> setSelectedThumbAdminIndex(i)}>Make thumbnail</Button>
                        </div>
                        {selectedThumbAdminIndex === i ? (
                          <div className="absolute top-1 left-1 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">Thumbnail</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="text-xs text-white/60">User image(s) will be appended last automatically.</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={save} disabled={busy}>{busy? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<TemplateDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortBy, setSortBy] = useState<'recent'|'favorites'>('recent');
  const [filterBy, setFilterBy] = useState<'all'|'favorites'>('all');
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        setLoading(true);
        const qs: string[] = [];
        if (sortBy === 'favorites') qs.push('sort=most_favorited');
        if (filterBy === 'favorites') qs.push('filter=favorites');
        const q = qs.length ? `?${qs.join('&')}` : '';
        const res = await fetch(`/api/templates${q}`, { cache:'no-store' }).then(r=>r.json());
        const list = Array.isArray(res?.templates) ? res.templates : [];
        async function resolveThumb(keyRaw?: string | null): Promise<string | undefined>{
          if (!keyRaw || typeof keyRaw !== 'string') return undefined;
          const key = keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`;
          const cacheKey = `ignite:thumb:${key}`;
          try {
            const cached = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null;
            if (cached) {
              const obj = JSON.parse(cached) as { url?: string; ts?: number };
              const ttlMs = 10*60*1000; if (obj?.url && obj?.ts && Date.now() - obj.ts < ttlMs) return obj.url;
            }
          } catch {}
          try {
            const v = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key, scope: 'admin' }) }).then(r=>r.json()).catch(()=>({}));
            if (v?.url) { try { if (typeof window !== 'undefined') sessionStorage.setItem(cacheKey, JSON.stringify({ url: v.url, ts: Date.now() })); } catch {} return v.url; }
          } catch {}
          return undefined;
        }
        const out = await Promise.all(list.map(async (t: TemplateDisplay)=> ({
          id: t?.id,
          name: t?.name,
          description: t?.description,
          slug: t?.slug,
          thumbnailKey: await resolveThumb(t?.thumbnailKey),
          variables: Array.isArray(t?.variables)?t.variables:[],
          prompt: String(t?.prompt||''),
          falModelSlug: String(t?.falModelSlug || 'fal-ai/bytedance/seedream/v4/edit'),
          fixedAspectRatio: !!t?.fixedAspectRatio,
          aspectRatio: typeof t?.aspectRatio === 'number' ? Number(t?.aspectRatio) : undefined,
          rembg: t?.rembg || null,
          allowedImageSources: Array.isArray(t?.allowedImageSources) ? t.allowedImageSources : ['vehicle','user'],
          imageSize: (t as { imageSize?: { width: number; height: number } | null })?.imageSize || null,
          favoriteCount: Number((t as { favoriteCount?: number })?.favoriteCount || 0),
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
  const [dialogTab, setDialogTab] = useState<'test'|'edit'>('test');
  const [active, setActive] = useState<TemplateDisplay | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/70">Manage templates</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-white/70">Filter</div>
          <Select value={filterBy} onValueChange={(v)=> setFilterBy((v as 'all'|'favorites') || 'all')}>
            <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="favorites">My favourites</SelectItem>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
        </div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-white/60">No templates yet. Create one to get started.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {templates.map((t: TemplateDisplay)=> (
            <ContextMenu key={t.id || t.slug}>
              <ContextMenuTrigger asChild>
                <button className="text-left rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 border border-[color:var(--border)] focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer" onClick={()=>{ setActive(t); setDialogTab('test'); setOpen(true); }}>
                  {t.thumbnailKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnailKey} alt={t.name} className="w-full h-auto" />
                  ) : (
                    <div className="w-full grid place-items-center text-white/60" style={{ aspectRatio: '16 / 10' }}>No preview</div>
                  )}
                  <div className="p-2">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    {t.description ? <div className="text-xs text-white/60 line-clamp-2">{t.description}</div> : null}
                    <div className="mt-1 text-[0.75rem] text-white/70">{Number((t as { favoriteCount?: number })?.favoriteCount||0)} favourite{Number((t as { favoriteCount?: number })?.favoriteCount||0)===1?'':'s'}</div>
                  </div>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); setActive(t); setDialogTab('edit'); setOpen(true); }}>Edit</ContextMenuItem>
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
          <Tabs value={dialogTab} onValueChange={(v)=> setDialogTab(v as 'test'|'edit')}>
            <TabsList>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
            </TabsList>
            <TabsContent value="test">
              {active ? (<AdminTestTemplate template={active} />) : null}
            </TabsContent>
            <TabsContent value="edit">
              {active ? (
                <AdminEditTemplate template={active} onSaved={()=>{ setOpen(false); setRefreshKey((v)=> v+1); }} />
              ) : (
                <div className="text-sm text-white/70">No template selected</div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  const [designText, setDesignText] = useState<string>('');
  const [_designFontSize, _setDesignFontSize] = useState<number>(64);
  const [_designFontColor, _setDesignFontColor] = useState<string>('#ffffff');
  const [_designFontWeight, _setDesignFontWeight] = useState<number>(800);
  const [_designX, _setDesignX] = useState<number>(50);
  const [_designY, _setDesignY] = useState<number>(80);
  const [_designGlow, _setDesignGlow] = useState<boolean>(true);
  const [_designGlowColor, _setDesignGlowColor] = useState<string>('#ffffff');
  const [_designGlowBlur, _setDesignGlowBlur] = useState<number>(18);
  const [_designShadow, _setDesignShadow] = useState<boolean>(true);
  const [_designShadowColor, _setDesignShadowColor] = useState<string>('#000000');
  const [_designShadowBlur, _setDesignShadowBlur] = useState<number>(10);
  const [_designShadowX, _setDesignShadowX] = useState<number>(0);
  const [_designShadowY, _setDesignShadowY] = useState<number>(8);

  useEffect(()=>{
    (async()=>{
      try {
        const profile = await fetch('/api/profile',{cache:'no-store'}).then(r=>r.json());
        const keys: string[] = Array.isArray(profile?.profile?.carPhotos) ? profile.profile.carPhotos : [];
        setVehiclePhotos(keys);
        const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? (profile.profile.vehicles as Vehicle[]) : [];
        setProfileVehicles(vehicles);
        const primary = keys.find(Boolean) || null; setSelectedVehicleKey(primary);
      } catch {}
    })();
  },[]);

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

  // Set default headline to vehicle brand in ALL CAPS when available
  useEffect(()=>{
    try {
      const v = ((): Vehicle | null => {
        if (source === 'vehicle') {
          return findVehicleForSelected();
        }
        // If source is not vehicle, attempt to infer from prompt variables if present
        return null;
      })();
      const brand = v?.make ? String(v.make) : '';
      if (!designText && brand) setDesignText(brand.toUpperCase());
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, selectedVehicleKey, JSON.stringify(profileVehicles)]);

  function baseSlug(v: Vehicle): string { if (!v) return ''; const name = `${v.make||''} ${v.model||''}`.trim().toLowerCase(); return name.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function uniqueSlugForIndex(list: Vehicle[], index:number): string { const v = list[index]; if (!v) return ''; const base = baseSlug(v); let prior=0; for (let i=0;i<index;i++){ const u=list[i]; if (u&&u.make===v.make&&u.model===v.model&&u.type===v.type) prior++; } const suf = prior>0?`-${prior}`:''; return `${base}${suf}`; }
  function findVehicleForSelected(): Vehicle | null { if (!selectedVehicleKey || !profileVehicles.length) return null; const idx = selectedVehicleKey.indexOf('/vehicles/'); if (idx===-1) return null; const sub = selectedVehicleKey.slice(idx); const m = sub.match(/\/vehicles\/([^/]+)\/ /); const slug = m?.[1] || ''; const slugs = profileVehicles.map((_:Vehicle,i:number)=> uniqueSlugForIndex(profileVehicles as Vehicle[], i)); const at = slugs.findIndex((s:string)=> s===slug); return at>=0 ? profileVehicles[at] : null; }

  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const form = new FormData(); form.append('file', file); form.append('path','uploads'); const res = await fetch('/api/storage/upload',{ method:'POST', body: form }); const data = await res.json(); if (data?.key) setBrowseSelected(data.key); } finally { setUploading(false); } }

  async function getUrlForKey(key: string): Promise<string | null> { try { const res = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key }) }).then(r=>r.json()); return res?.url || null; } catch { return null; } }

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
      const view = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key: bgKey }) }).then(r=>r.json()).catch(()=>({}));
      const bg = view?.url || null; if (!bg) { toast.error('Could not fetch image'); return; }
      setBusy(true); setMasking(true);
      const rem = await fetch('/api/tools/rembg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2_key: bgKey, model: (template?.rembg?.model as 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait') || 'General Use (Heavy)', operating_resolution: (template?.rembg?.operating_resolution as '1024x1024'|'2048x2048') || '2048x2048', output_format: (template?.rembg?.output_format as 'png'|'webp') || 'png', refine_foreground: typeof template?.rembg?.refine_foreground === 'boolean' ? !!template.rembg.refine_foreground : true, output_mask: !!template?.rembg?.output_mask })
      }).then(r=>r.json()).catch(()=>({}));
      const fg = rem?.image?.url || null; const mk = rem?.mask_image?.url || null; if (!fg) { toast.error(rem?.error || 'Foreground mask failed'); return; }
      _setDesignBgUrl(bg); _setDesignFgUrl(fg); _setDesignMaskUrl(mk || null); setDesigning(true);
    } finally { setBusy(false); setMasking(false); }
  }

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
          <TextBehindEditor
            bgKey={(activeKey || resultKey) as string}
            rembg={{ enabled: true, model: (template?.rembg?.model as 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait') || 'General Use (Heavy)', operating_resolution: (template?.rembg?.operating_resolution as '1024x1024'|'2048x2048') || '2048x2048', output_format: (template?.rembg?.output_format as 'png'|'webp') || 'png', refine_foreground: typeof template?.rembg?.refine_foreground === 'boolean' ? !!template.rembg.refine_foreground : true, output_mask: !!template?.rembg?.output_mask }}
            defaultHeadline={(findVehicleForSelected()?.make || '').toUpperCase()}
            onClose={()=> setDesigning(false)}
            onSave={async(blob)=>{
              try {
                const filename = `design-${Date.now()}.png`;
                const file = new File([blob], filename, { type: 'image/png' });
                const form = new FormData();
                form.append('file', file, filename);
                form.append('path', 'generations');
                const res = await fetch('/api/storage/upload', { method:'POST', body: form });
                if (!res.ok) { try { const d=await res.json(); toast.error(d?.error||'Failed to save'); } catch { toast.error('Failed to save'); } return; }
                setDesigning(false);
              } catch {}
            }}
            saveLabel={'Save to workspace'}
            aspectRatio={typeof template?.aspectRatio === 'number' ? Number(template?.aspectRatio) : undefined}
          />
        </div>
      ) : resultUrl ? (
        <div className="space-y-3">
          <div className="w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={(activeUrl || resultUrl)} alt="result" className="w-full h-auto rounded" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button onClick={()=>{ setResultUrl(null); }}>Try again</Button>
            <div className="flex items-center gap-2">
              {(template?.rembg?.enabled || template?.rembg === undefined) ? (
                <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" onClick={openDesigner}>Add text</Button>
              ) : null}
              <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" disabled={upscaleBusy || !resultKey} onClick={async()=>{
                if (!resultKey) return;
                setUpscaleBusy(true);
                try {
                  let payload: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: String(resultKey) };
                  try {
                    const v = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key: resultKey }) }).then(r=>r.json()).catch(()=>({}));
                    const url: string | null = v?.url || null;
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
            <SelectItem value="workspace">Browse workspace</SelectItem>
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
          <div className="space-y-2"><input type="file" accept="image/*" onChange={onUploadChange} disabled={uploading} />{uploading ? <div className="text-sm text-white/60">Uploading…</div> : null}{browseSelected ? <div className="text-xs text-white/60">Uploaded: {browseSelected}</div> : null}</div>
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
        title="Crop image to match aspect ratio"
        onCancel={()=>{ setCropOpen(false); setCropUrl(null); setPendingKeys(null); }}
        onCropped={onCroppedBlob}
      />
    </div>
  );
}

function AdminEditTemplate({ template, onSaved }: { template: TemplateDisplay; onSaved?: ()=>void }){
  const [name, setName] = useState<string>(String(template?.name || ''));
  const [falModelSlug, setFalModelSlug] = useState<string>(String(template?.falModelSlug || 'fal-ai/gemini-25-flash-image/edit'));
  const [description, setDescription] = useState<string>(String(template?.description || ''));
  const [prompt, setPrompt] = useState<string>(String(template?.prompt || ''));
  const [busy, setBusy] = useState(false);
  const builtIn = useMemo(() => new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]), []);
  const [tokenConfigs, setTokenConfigs] = useState<Record<string, { kind: 'input' | 'select' | 'color'; options: string[]; defaultValue?: string }>>({});
  const [fixedAspect, setFixedAspect] = useState<boolean>(!!template?.fixedAspectRatio);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(typeof template?.aspectRatio === 'number' ? Number(template.aspectRatio) : undefined);
  const [imageWidth, setImageWidth] = useState<number>(()=>{ try{ const w = Number((template?.imageSize?.width) || 1280); return Math.max(1024, Math.min(4096, Math.round(w))); } catch { return 1280; } });
  const [imageHeight, setImageHeight] = useState<number>(()=>{ try{ const h = Number((template?.imageSize?.height) || 1280); return Math.max(1024, Math.min(4096, Math.round(h))); } catch { return 1280; } });
  const [allowVehicle, setAllowVehicle] = useState<boolean>(() => {
    try { const a = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user']; return a.includes('vehicle'); } catch { return true; }
  });
  const [allowUser, setAllowUser] = useState<boolean>(() => {
    try { const a = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user']; return a.includes('user'); } catch { return true; }
  });
  const [rembgEnabled, setRembgEnabled] = useState<boolean>(!!template?.rembg?.enabled);
  const [rembgModel, setRembgModel] = useState<'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait'>(template?.rembg?.model || 'General Use (Heavy)');
  const [rembgRes, setRembgRes] = useState<'1024x1024' | '2048x2048'>(template?.rembg?.operating_resolution || '2048x2048');
  const [rembgFormat, setRembgFormat] = useState<'png' | 'webp'>(template?.rembg?.output_format || 'png');
  const [rembgRefine, setRembgRefine] = useState<boolean>(template?.rembg?.refine_foreground !== false);
  const [rembgMask, setRembgMask] = useState<boolean>(!!template?.rembg?.output_mask);

  useEffect(()=>{
    setName(String(template?.name || ''));
    setFalModelSlug(String(template?.falModelSlug || 'fal-ai/gemini-25-flash-image/edit'));
    setDescription(String(template?.description || ''));
    setPrompt(String(template?.prompt || ''));
    setFixedAspect(!!template?.fixedAspectRatio);
    setAspectRatio(typeof template?.aspectRatio === 'number' ? Number(template?.aspectRatio) : undefined);
    try { const w = Number((template?.imageSize?.width) || 1280); setImageWidth(Math.max(1024, Math.min(4096, Math.round(w)))); } catch {}
    try { const h = Number((template?.imageSize?.height) || 1280); setImageHeight(Math.max(1024, Math.min(4096, Math.round(h)))); } catch {}
    try {
      const srcs = Array.isArray(template?.allowedImageSources) ? template.allowedImageSources : ['vehicle','user'];
      setAllowVehicle(srcs.includes('vehicle'));
      setAllowUser(srcs.includes('user'));
    } catch {}
    setRembgEnabled(!!template?.rembg?.enabled);
    setRembgModel((template?.rembg?.model as 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait') || 'General Use (Heavy)');
    setRembgRes((template?.rembg?.operating_resolution as '1024x1024'|'2048x2048') || '2048x2048');
    setRembgFormat((template?.rembg?.output_format as 'png'|'webp') || 'png');
    setRembgRefine(template?.rembg?.refine_foreground !== false);
    setRembgMask(!!template?.rembg?.output_mask);
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
    setBusy(true);
    try{
      const unknownVarDefs = Object.entries(tokenConfigs).map(([key, cfg])=> ({ key, label: key, required: false, type: cfg.kind === 'select' ? 'select' : (cfg.kind === 'color' ? 'color' : 'text'), options: cfg.kind === 'select' ? cfg.options : undefined, defaultValue: cfg.kind === 'color' && typeof (cfg as { defaultValue?: unknown }).defaultValue === 'string' && (cfg as { defaultValue?: unknown }).defaultValue ? (cfg as { defaultValue?: string }).defaultValue : undefined }));
      const allowedImageSources = [allowVehicle ? 'vehicle' : null, allowUser ? 'user' : null].filter(Boolean);
      const rembg = { enabled: !!rembgEnabled, model: rembgModel, operating_resolution: rembgRes, output_format: rembgFormat, refine_foreground: !!rembgRefine, output_mask: !!rembgMask };
      const res = await fetch('/api/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: name.trim(), description: description || '', prompt: prompt.trim(), falModelSlug: falModelSlug || undefined, variables: unknownVarDefs, imageSize: { width: imageWidth, height: imageHeight }, fixedAspectRatio: !!fixedAspect, aspectRatio: fixedAspect ? (typeof aspectRatio === 'number' ? Number(aspectRatio) : undefined) : undefined, allowedImageSources, rembg })
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
      <Textarea value={description} onChange={(e)=> setDescription(e.target.value)} placeholder="Description (optional)" rows={2} />
      <Textarea value={prompt} onChange={(e)=> setPrompt(e.target.value)} placeholder="Prompt" rows={6} />
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Fixed aspect ratio</div>
          <div className="text-xs text-white/60">If enabled, users must crop uploads to the template&apos;s aspect ratio.</div>
        </div>
        <div className="flex items-center gap-2">
          {fixedAspect && typeof aspectRatio === 'number' ? (<div className="text-xs text-white/60">AR: {Number(aspectRatio).toFixed(3)}</div>) : null}
          <Switch checked={fixedAspect} onCheckedChange={(v)=> setFixedAspect(!!v)} />
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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><span className="text-xs text-white/70">Car</span><Switch checked={allowVehicle} onCheckedChange={(v)=> setAllowVehicle(!!v)} /></div>
          <div className="flex items-center gap-2"><span className="text-xs text-white/70">User</span><Switch checked={allowUser} onCheckedChange={(v)=> setAllowUser(!!v)} /></div>
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
      <div className="flex justify-end"><Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></div>
    </div>
  );
}

function AdminVehicleImage({ storageKey }: { storageKey: string }){
  const [url, setUrl] = useState<string | null>(null);
  useEffect(()=>{ let cancelled=false; (async()=>{ try{ const res = await fetch('/api/storage/view',{ method:'POST', body: JSON.stringify({ key: storageKey }) }).then(r=>r.json()); if (!cancelled && res?.url) setUrl(res.url); } catch {} })(); return ()=>{cancelled=true}; },[storageKey]);
  if (!url) return (<div className="size-full grid place-items-center"><svg className="size-8 text-white/30 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="14" rx="2"/></svg></div>);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="vehicle" className="block w-full aspect-square object-cover" />
}
