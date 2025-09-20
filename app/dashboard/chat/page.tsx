"use client";
import { Suspense, useEffect, useState, useRef, useMemo } from "react";
// Removed Stream chat; bespoke Surreal chat implementation
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardWorkspacePanel } from "@/components/dashboard-workspace-panel";
import LivestreamPanel from "@/components/livestream-panel";
import SubscriptionGate from "@/components/subscription-gate";
import TabsViewFancy from "@/components/ui/tabs-view-fancy";
import Lottie from "lottie-react";
import fireAnimation from "@/public/fire.json";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import FeatureRequestsPanel from "@/components/feature-requests-panel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { confirmToast } from "@/components/ui/toast-helpers";
import { Skeleton } from "@/components/ui/skeleton";
import { CarFront, SquarePen } from "lucide-react";
import Chevron from "@/components/ui/chevron";

type ChatMessage = {
  id?: string
  tempId?: string
  text: string
  userName: string
  userEmail?: string
  created_at?: string
  status?: 'sent' | 'pending' | 'failed'
}

type ForgeView = "chat" | "forge" | "livestream";
type NonChatView = Exclude<ForgeView, "chat">;
type ChannelPerms = { slug: string; name?: string; requiredReadRole?: 'user' | 'staff' | 'admin'; requiredReadPlan?: 'base' | 'premium' | 'ultra'; locked?: boolean; locked_until?: string | null };

function DashboardChatPageInner() {
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [channels, setChannels] = useState<ChannelPerms[]>([]);
  const [active, setActive] = useState<string>("general");
  const [activeChatType, setActiveChatType] = useState<"channel" | "dm">("channel");
  const [activeDm, setActiveDm] = useState<{ email: string; name?: string; image?: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [forgeView, setForgeView] = useState<ForgeView>("chat");
  const [_lastNonChatView, setLastNonChatView] = useState<NonChatView>("forge");
  const [forgeTab] = useState<"workspace" | "content">("workspace");
  const [presence, setPresence] = useState<{ email?: string; name?: string; image?: string; status: string; role?: string; plan?: string }[]>([]);
  const [dmConversations, setDmConversations] = useState<{ email: string; name?: string; image?: string }[]>([]);
  const [me, setMe] = useState<{ email?: string; role?: string; plan?: string; name?: string } | null>(null);
  const [muted] = useState<{ active: boolean; reason?: string } | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dmTtlSeconds, setDmTtlSeconds] = useState<number>(24*60*60);
  // Helper: on mobile, close channels sidebar after navigating
  const closeChannelsIfMobile = () => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 768) setShowChannels(false);
    } catch {}
  };
  // Open sidebars by default on desktop (md and up)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setShowChannels(true);
        setShowMembers(true);
      }
    } catch {}
  }, []);
  const flagEmojis = useMemo(() => {
    const codes = [
      "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
      "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
      "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
      "DE","DJ","DK","DM","DO","DZ",
      "EC","EE","EG","EH","ER","ES","ET",
      "FI","FJ","FK","FM","FO","FR",
      "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
      "HK","HM","HN","HR","HT","HU",
      "ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT",
      "JE","JM","JO","JP",
      "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ",
      "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
      "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
      "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ",
      "OM",
      "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY",
      "QA",
      "RE","RO","RS","RU","RW",
      "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
      "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
      "UA","UG","UM","US","UY","UZ",
      "VA","VC","VE","VG","VI","VN","VU",
      "WF","WS",
      "YE","YT",
      "ZA","ZM","ZW",
      "XK"
    ];
    const base = 127397; // regional indicator offset
    return codes.map((cc) => {
      const u = cc.toUpperCase();
      if (u.length !== 2) return "";
      return String.fromCodePoint(u.charCodeAt(0) + base, u.charCodeAt(1) + base);
    }).filter(Boolean);
  }, []);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        // parallelize initial fetches
        const [meRes, channelsRes, messagesRes, presenceRes, convRes, blocksRes, dmTtlRes] = await Promise.allSettled([
          fetch('/api/me', { cache: 'no-store' }).then(r=>r.json()),
          fetch('/api/chat/channels').then(r=>r.json()),
          fetch(`/api/chat/messages?channel=general`).then(r=>r.json()),
          fetch('/api/presence', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({users:[]})),
          fetch('/api/chat/dm/conversations', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({conversations:[]})),
          fetch('/api/blocks', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({blocked:[]})),
          fetch('/api/chat/dm/settings', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({ ttlSeconds: 86400 })),
        ]);
        if (mounted && meRes.status === 'fulfilled') setMe({ email: meRes.value?.email, role: meRes.value?.role, plan: meRes.value?.plan, name: meRes.value?.name });
        if (mounted && channelsRes.status === 'fulfilled') setChannels((channelsRes.value.channels || []).map((x: { slug: string; name?: string; requiredReadRole?: ChannelPerms['requiredReadRole']; requiredRole?: ChannelPerms['requiredReadRole']; requiredReadPlan?: ChannelPerms['requiredReadPlan']; locked?: boolean; locked_until?: string | null })=> ({ slug: String(x.slug), name: x.name, requiredReadRole: x.requiredReadRole || x.requiredRole, requiredReadPlan: x.requiredReadPlan, locked: !!x.locked, locked_until: x.locked_until || null })));
        if (mounted && messagesRes.status === 'fulfilled') setMessages(((messagesRes.value.messages || []) as Array<{ id?: string; text: string; userName: string; userEmail?: string; created_at?: string }>).map((mm) => ({ ...mm, status: 'sent' })));
        if (mounted && presenceRes.status === 'fulfilled') setPresence(presenceRes.value.users || []);
        if (mounted && convRes.status === 'fulfilled') {
          const self = String(meRes.status === 'fulfilled' ? meRes.value?.email || '' : '').toLowerCase();
          const convs = Array.isArray(convRes.value.conversations) ? convRes.value.conversations : [];
          const filtered = convs.filter((c: { email: string }) => String(c?.email || '').toLowerCase() !== self);
          setDmConversations(filtered.slice(0, 50));
        }
        if (mounted && blocksRes.status === 'fulfilled') setBlocked(Array.isArray(blocksRes.value?.blocked) ? blocksRes.value.blocked : []);
        if (mounted && dmTtlRes.status === 'fulfilled') {
          const v = Number(dmTtlRes.value?.ttlSeconds);
          if (Number.isFinite(v)) setDmTtlSeconds(Math.max(0, Math.floor(v)));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  // Sync view with URL query param (defaults to chat if none)
  useEffect(() => {
    const raw = (searchParams.get("view") || "chat");
    const mapped = ["studio", "generative", "downloads"].includes(raw) ? "chat" : raw;
    const v = mapped as ForgeView;
    if (["chat", "forge", "livestream"].includes(v)) {
      setForgeView(v);
      if (v !== "chat") setLastNonChatView(v as NonChatView);
    }
  }, [searchParams]);

  // Default to General chat; if it's not available, fall back to Hooks page
  useEffect(() => {
    if (loading) return;
    try {
      const viewParam = searchParams.get("view");
      const hasGeneral = channels.some((c) => c.slug === "general");
      if ((!viewParam || viewParam === "chat") && !hasGeneral) {
        setForgeView("forge");
        setLastNonChatView("forge");
        router.replace("/dashboard/hooks");
      }
    } catch {}
  }, [loading, channels, searchParams, router]);

  // Refresh messages when profile is updated so names reflect latest
  useEffect(() => {
    function onProfileUpdated() {
      (async () => {
        setLoading(true);
        try {
          const m = await fetch(`/api/chat/messages?channel=${encodeURIComponent(active)}`).then(r=>r.json());
          setMessages((m.messages || []).map((mm: { id?: string; text: string; userName: string; userEmail?: string; created_at?: string }) => ({ ...mm, status: 'sent' })));
          const pres = await fetch('/api/presence', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({users:[]}));
          setPresence(pres.users || []);
          // Also refresh DM conversations so names update immediately
          try {
            const conv = await fetch('/api/chat/dm/conversations', { cache: 'no-store' }).then(r=>r.json());
            const self = String(me?.email || '').toLowerCase();
            const convs = Array.isArray(conv?.conversations) ? conv.conversations : [];
            const filtered = convs.filter((c: { email: string }) => String(c?.email || '').toLowerCase() !== self);
            setDmConversations(filtered.slice(0, 50));
          } catch {}
        } finally {
          setLoading(false);
        }
      })();
    }
    window.addEventListener('profile-updated', onProfileUpdated as EventListener);
    const onDmHiddenChanged = async () => {
      try {
        const conv = await fetch('/api/chat/dm/conversations', { cache: 'no-store' }).then(r=>r.json());
        const self = String(me?.email || '').toLowerCase();
        const convs = Array.isArray(conv?.conversations) ? conv.conversations : [];
        const filtered = convs.filter((c: { email: string }) => String(c?.email || '').toLowerCase() !== self);
        setDmConversations(filtered.slice(0, 50));
      } catch {}
    };
    window.addEventListener('dm-hidden-changed', onDmHiddenChanged as EventListener);
    return () => {
      window.removeEventListener('profile-updated', onProfileUpdated as EventListener);
      window.removeEventListener('dm-hidden-changed', onDmHiddenChanged as EventListener);
    };
  }, [active, me?.email]);

  // Presence polling + heartbeat
  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let beat: ReturnType<typeof setInterval> | null = null;
    async function initSSE() {
      try {
        const snapshot = await fetch('/api/presence', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({users:[]}));
        if (mounted) setPresence(snapshot.users || []);
      } catch {}
      es = new EventSource('/api/presence/live');
      es.onmessage = (ev) => {
        try {
          const { user } = JSON.parse(ev.data);
          if (!user?.email) return;
          setPresence(prev => {
            const others = prev.filter(u => u.email !== user.email);
            const merged = { email: user.email, name: user.name, image: user.image, status: user.presence_status || 'online', role: user.role, plan: user.plan };
            return [merged, ...others];
          });
        } catch {}
      };
      es.onerror = () => {
        try { es?.close(); } catch {}
        setTimeout(() => { if (mounted) initSSE(); }, 3000);
      };
      beat = setInterval(() => { fetch('/api/presence/heartbeat', { method: 'POST' }).catch(()=>{}); }, 60000);
    }
    initSSE();
    return () => {
      mounted = false;
      try { es?.close(); } catch {}
      if (beat) clearInterval(beat);
    };
  }, []);

  function tempId() {
    try { return crypto.randomUUID() } catch { return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  }

  const [confirmOpen, setConfirmOpen] = useState<null | { type: 'purge', count: number }>(null);
  const [featureOpen, setFeatureOpen] = useState(false);

  function FeatureRequestInlineForm() {
    const [busy, setBusy] = useState(false);
    const [canCreate, setCanCreate] = useState<boolean | null>(null);
    const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null);
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch('/api/feature-requests?meta=1', { cache: 'no-store' }).then(r=>r.json());
          if (!cancelled) {
            setCanCreate(!!r?.canCreate);
            setNextAllowedAt(r?.nextAllowedAt || null);
          }
        } catch {}
      })();
      return () => { cancelled = true; };
    }, []);
    function cooldownTextFor(iso: string | null) {
      if (!iso) return null;
      try {
        const ts = Date.parse(iso);
        if (!Number.isFinite(ts)) return null;
        const ms = ts - Date.now();
        if (ms <= 0) return null;
        const hrs = Math.ceil(ms / (60 * 60 * 1000));
        if (hrs >= 24) { const d = Math.ceil(hrs / 24); return `You can post again in ~${d} day${d===1?'':'s'}.`; }
        return `You can post again in ~${hrs} hour${hrs===1?'':'s'}.`;
      } catch { return null; }
    }
    return (
      <div className="rounded border border-[color:var(--border)]/70 bg-[color:var(--card)] p-3">
        <div className="text-sm font-medium mb-2">Suggest a feature</div>
        <div className="space-y-2">
          <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Short title" className="w-full rounded bg-white/5 px-3 py-2 text-sm" />
          <textarea value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Optional details" className="w-full rounded bg-white/5 px-3 py-2 text-sm min-h-[6em]" />
          <div className="flex items-center gap-2">
            <button type="button" className="px-3 py-2 rounded bg-primary text-black text-sm disabled:opacity-60" disabled={busy || !title.trim() || canCreate === false} onClick={async()=>{
              setBusy(true);
              try {
                const r = await fetch('/api/feature-requests', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: title.trim(), description: desc.trim() || undefined }) });
                const j = await r.json();
                if (!r.ok) {
                  if (j?.nextAllowedAt) setNextAllowedAt(j.nextAllowedAt);
                  throw new Error(j?.error || 'Failed to create');
                }
                setTitle(""); setDesc("");
                try { window.dispatchEvent(new CustomEvent('feature-request-created', { detail: j?.request })); } catch {}
              } catch {}
              finally { setBusy(false); }
            }}> {busy ? 'Submitting…' : 'Submit'} </button>
            {canCreate === false && cooldownTextFor(nextAllowedAt) ? (
              <span className="text-xs text-white/60">{cooldownTextFor(nextAllowedAt)}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  async function tryHandleSlashCommand(input: string): Promise<boolean> {
    const raw = String(input || "").trim();
    if (!raw.startsWith('/')) return false;
    const [cmd, ...rest] = raw.slice(1).split(/\s+/);
    const name = (cmd || '').toLowerCase();

    if (name === 'purge') {
      if (me?.role !== 'admin') {
        // Non-admin: not a command; allow sending plain message
        return false;
      }
      if (activeChatType !== 'channel') {
        toast.error('Use /purge in a channel.');
        return true;
      }
      const nRaw = rest[0];
      let n = 10;
      if (typeof nRaw === 'string' && /^(\d+)$/.test(nRaw)) n = Math.max(1, Math.min(500, parseInt(nRaw, 10)));
      setConfirmOpen({ type: 'purge', count: n });
      return true;
    }

    if (name === 'lock') {
      if (me?.role !== 'admin') return false;
      if (activeChatType !== 'channel') { toast.error('Use /lock in a channel.'); return true; }
      const minutesRaw = rest[0];
      let minutes: number | undefined = undefined;
      if (typeof minutesRaw === 'string' && /^(\d+)$/.test(minutesRaw)) minutes = Math.max(1, parseInt(minutesRaw, 10));
      try {
        setChatLoading(true);
        const r = await fetch('/api/admin/chat/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: active, minutes }) }).then(r=>r.json());
        if (r?.channel) {
          setChannels(prev => prev.map(c => c.slug === active ? { ...c, locked: !!r.channel.locked, locked_until: r.channel.locked_until || null } : c));
          toast.success(minutes ? `Channel locked for ${minutes} min.` : 'Channel locked.');
        } else {
          toast.error('Failed to lock channel.');
        }
      } catch {
        toast.error('Failed to lock channel.');
      } finally {
        setChatLoading(false);
      }
      return true;
    }

    if (name === 'unlock') {
      if (me?.role !== 'admin') return false;
      if (activeChatType !== 'channel') { toast.error('Use /unlock in a channel.'); return true; }
      try {
        setChatLoading(true);
        const r = await fetch('/api/admin/chat/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: active }) }).then(r=>r.json());
        if (r?.channel) {
          setChannels(prev => prev.map(c => c.slug === active ? { ...c, locked: false, locked_until: null } : c));
          toast.success('Channel unlocked.');
        } else {
          toast.error('Failed to unlock channel.');
        }
      } catch {
        toast.error('Failed to unlock channel.');
      } finally {
        setChatLoading(false);
      }
      return true;
    }

    if (name === 'mute') {
      if (me?.role !== 'admin') return false;
      if (activeChatType !== 'channel') { toast.error('Use /mute in a channel.'); return true; }
      const targetRaw = rest[0];
      if (!targetRaw) { toast.error('Usage: /mute [email or name] [minutes?]'); return true; }
      const minutesRaw = rest[1];
      let minutes: number | undefined = undefined;
      if (typeof minutesRaw === 'string' && /^(\d+)$/.test(minutesRaw)) minutes = Math.max(1, parseInt(minutesRaw, 10));
      let targetEmail = '';
      const val = String(targetRaw);
      if (val.includes('@')) {
        targetEmail = val.toLowerCase();
      } else {
        // Try resolve by presence first
        const byPresence = presence.find(u => (u.name || '').toLowerCase() === val.toLowerCase() || (u.email || '').toLowerCase() === val.toLowerCase());
        if (byPresence?.email) targetEmail = String(byPresence.email).toLowerCase();
        if (!targetEmail) {
          try {
            const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(val)}&limit=1`).then(r=>r.json());
            const u = Array.isArray(res?.users) ? res.users[0] : null;
            if (u?.email) targetEmail = String(u.email).toLowerCase();
          } catch {}
        }
      }
      if (!targetEmail) { toast.error('Could not resolve user.'); return true; }
      if (targetEmail && me?.email && targetEmail.toLowerCase() === me.email.toLowerCase()) { toast.error('You cannot mute yourself.'); return true; }
      try {
        const payload: { targetEmail: string; channels: string[]; durationSeconds?: number } = { targetEmail, channels: [active] };
        if (minutes) payload.durationSeconds = minutes * 60;
        await fetch('/api/admin/mutes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        toast.success(minutes ? `Muted ${targetEmail} for ${minutes} min in #${active}` : `Muted ${targetEmail} in #${active}`);
      } catch {
        toast.error('Failed to mute user.');
      }
      return true;
    }

    toast.error('Unknown command.');
    return true;
  }

  async function sendMessage(text: string, temp?: string) {
    if (muted?.active) {
      toast.error('You are muted and cannot send messages.');
      return;
    }
    const tid = temp || tempId();
    setMessages(prev => {
      const exists = prev.find(m => m.tempId === tid);
      if (exists) {
        return prev.map(m => m.tempId === tid ? { ...m, status: 'pending' } : m);
      }
      const display = (me?.name && !/@/.test(String(me.name))) ? me.name : (me?.email || 'You');
      return [...prev, { tempId: tid, text, userName: display, status: 'pending', userEmail: me?.email }];
    });

    try {
      if (activeChatType === 'dm' && activeDm?.email) {
        const r = await fetch('/api/chat/dm/messages', { method:'POST', body: JSON.stringify({ targetEmail: activeDm.email, text }) }).then(r=>r.json());
        setMessages(prev => prev.map(m => m.tempId === tid ? { ...m, id: r.message?.id?.id?.toString?.() || r.message?.id || m.id, text: r.message?.text || text, userName: r.message?.userName || m.userName, created_at: r.message?.created_at, status: 'sent' } : m));
        setDmConversations(prev => prev.some(c => c.email === activeDm.email) ? prev : [{ email: activeDm.email, name: activeDm.name || activeDm.email, image: activeDm.image }, ...prev]);
      } else {
        const r = await fetch('/api/chat/messages', { method:'POST', body: JSON.stringify({ channel: active, text }) }).then(r=>r.json());
        setMessages(prev => prev.map(m => m.tempId === tid ? { ...m, id: r.message?.id?.id?.toString?.() || r.message?.id || m.id, text: r.message?.text || text, userName: r.message?.userName || m.userName, created_at: r.message?.created_at, status: 'sent' } : m));
      }
    } catch {
      setMessages(prev => prev.map(m => m.tempId === tid ? { ...m, status: 'failed' } : m));
    }
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = before + emoji + after;
    const cursor = start + emoji.length;
    input.focus();
    try { input.setSelectionRange(cursor, cursor); } catch {}
  }

  // Subscribe to live updates for active chat (channel or DM)
  useEffect(() => {
    if (forgeView !== 'chat') return;
    let es: EventSource | null = null;
    // Only fetch snapshot here if we don't already have messages for the active target
    const needSnapshot = messages.length === 0;
    if (needSnapshot) setChatLoading(true);
    (async () => {
      if (activeChatType === 'dm' && activeDm?.email) {
        if (needSnapshot) {
        const m: { messages?: { id?: string; text: string; userName: string; userEmail?: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(activeDm.email)}`).then(r=>r.json());
        setMessages((m.messages || []).map((mm) => ({ ...mm, status: 'sent' })));
        setChatLoading(false);
        }
        es = new EventSource(`/api/chat/dm/live?user=${encodeURIComponent(activeDm.email)}`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            const row = data?.result || data?.record || data;
            const text = row?.text;
            let userName: string | undefined = row?.senderName;
            // Never show email as name; if email-like, mask to 'Member'
            if (!userName || /@/.test(String(userName))) userName = 'Member';
            if (row?.senderEmail && blocked.includes(row.senderEmail)) return;
            if (!text || !userName) return;
            setMessages(prev => [...prev, { text, userName, userEmail: row?.senderEmail, status: 'sent', created_at: row?.created_at, id: row?.id?.id?.toString?.() || row?.id }]);
          } catch {}
        };
        es.onerror = () => { try { es?.close(); } catch {}; };
      } else {
        if (needSnapshot) {
        const m: { messages?: { id?: string; text: string; userName: string; userEmail?: string; created_at?: string }[] } = await fetch(`/api/chat/messages?channel=${encodeURIComponent(active)}`).then(r=>r.json());
        setMessages((m.messages || []).map((mm) => ({ ...mm, status: 'sent' })));
        setChatLoading(false);
        }
        es = new EventSource(`/api/chat/live?channel=${encodeURIComponent(active)}`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            const row = data?.result || data?.record || data;
            const text = row?.text;
            let userName: string | undefined = row?.userName;
            if (!userName || /@/.test(String(userName))) userName = 'Member';
            if (row?.userEmail && blocked.includes(row.userEmail)) return;
            if (!text || !userName) return;
            setMessages(prev => [...prev, { text, userName, userEmail: row?.userEmail, status: 'sent', created_at: row?.created_at, id: row?.id?.id?.toString?.() || row?.id }]);
          } catch {}
        };
        es.onerror = () => { try { es?.close(); } catch {}; };
      }
    })();
    return () => { try { es?.close(); } catch {}; };
  }, [active, activeChatType, activeDm?.email, forgeView, blocked, messages.length]);

  function canAccessByRole(userRole?: 'user' | 'staff' | 'admin', required?: 'user' | 'staff' | 'admin') {
    if (!required) return true;
    if (!userRole) return false;
    if (required === 'user') return true;
    if (required === 'staff') return userRole === 'staff' || userRole === 'admin';
    if (required === 'admin') return userRole === 'admin';
    return false;
  }
  function canonicalPlan(p?: string | null): 'base' | 'premium' | 'ultra' | null {
    const s = (p || '').toLowerCase();
    if (s === 'ultra' || s === 'pro') return 'ultra';
    if (s === 'premium') return 'premium';
    if (s === 'base' || s === 'basic' || s === 'minimum') return 'base';
  return null;
}

// default export placed at end of module
  function canAccessByPlan(userPlan?: string | null, required?: 'base' | 'premium' | 'ultra') {
    if (!required) return true;
    const p = canonicalPlan(userPlan);
    if (!p) return false;
    if (required === 'base') return p === 'base' || p === 'premium' || p === 'ultra';
    if (required === 'premium') return p === 'premium' || p === 'ultra';
    if (required === 'ultra') return p === 'ultra';
    return false;
  }
  const activeChannelPerms = channels.find(c => c.slug === active);
  const isChannelLocked = useMemo(() => {
    if (!activeChannelPerms || activeChatType === 'dm') return false;
    const lockedFlag = !!activeChannelPerms.locked;
    const until = activeChannelPerms.locked_until;
    let locked = lockedFlag;
    if (!locked && typeof until === 'string' && until) {
      const ts = Date.parse(until);
      if (Number.isFinite(ts) && ts > Date.now()) locked = true;
    }
    return locked;
  }, [activeChannelPerms, activeChatType]);
  const lockedForMe = (isChannelLocked && me?.role !== 'admin' && activeChatType === 'channel');
  function DmTtlNotice({ self, ttlSeconds }: { self?: boolean; ttlSeconds: number }) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [val, setVal] = useState(ttlSeconds);
    useEffect(() => { setVal(ttlSeconds); }, [ttlSeconds]);
    const label = self ? 'Messages stay forever' : (ttlSeconds <= 0 ? 'Messages stay forever' : `Messages auto-delete after ${Math.round(ttlSeconds/3600)}h`);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-[color:var(--border)]/60">
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="p-3 w-64">
          <div className="text-xs mb-2">Direct messages auto-delete by default. Change your preference:</div>
          <div className="flex flex-col gap-2">
            {[24, 48, 72, 0].map((hrs)=> (
              <label key={hrs} className="text-xs inline-flex items-center gap-2">
                <input type="radio" name="dm-ttl" className="accent-[color:var(--primary)]" checked={hrs===0 ? val<=0 : val===hrs*3600} onChange={()=> setVal(hrs===0 ? 0 : hrs*3600)} />
                <span>{hrs===0 ? 'Never auto-delete' : `${hrs} hours`}</span>
              </label>
            ))}
            <div className="flex items-center justify-end gap-2 mt-1">
              <button className="text-xs px-2 py-1 rounded bg-white/5 border border-[color:var(--border)]/60" onClick={()=> setOpen(false)}>Close</button>
              <button disabled={saving} className="text-xs px-2 py-1 rounded bg-primary text-black disabled:opacity-60" onClick={async()=>{
                setSaving(true);
                try {
                  const r = await fetch('/api/chat/dm/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ttlSeconds: val }) }).then(r=>r.json());
                  const v = Number(r?.ttlSeconds);
                  if (Number.isFinite(v)) setDmTtlSeconds(Math.max(0, Math.floor(v)));
                  toast.success('DM expiry preference updated');
                  setOpen(false);
                } catch {
                } finally {
                  setSaving(false);
                }
              }}>Save</button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  const filterByChannelAccess = (u: { role?: string; plan?: string; status?: string; email?: string; name?: string; image?: string }) => {
    if (!activeChannelPerms || activeChatType === 'dm') return true;
    const okRole = canAccessByRole(u.role as 'user' | 'staff' | 'admin' | undefined, activeChannelPerms.requiredReadRole);
    const okPlan = canAccessByPlan(u.plan as 'base' | 'premium' | 'ultra' | undefined, activeChannelPerms.requiredReadPlan);
    return okRole && okPlan;
  };
  // Treat online group as any non-offline user (online, idle, dnd; invisible stays in offline list)
  const onlineUsers = presence
    .filter(u => (u.status !== 'offline' && u.status !== 'invisible'))
    .filter(filterByChannelAccess)
    .map(u => ({
      email: u.email as string | undefined,
      name: (u.name || u.email || '') as string,
      image: u.image as string | undefined,
      status: (u.status === 'idle' ? 'idle' : u.status === 'dnd' ? 'dnd' : 'online') as 'online' | 'idle' | 'dnd',
      role: u.role as string | undefined,
      plan: u.plan as string | undefined,
    }))
    .filter(u => !!u.name)
    .slice(0,30);
  const offlineUsers = presence
    .filter(u => (u.status === 'offline' || u.status === 'invisible'))
    .filter(filterByChannelAccess)
    .map(u => ({ email: u.email as string | undefined, name: (u.name || u.email || '') as string, image: u.image as string | undefined, role: u.role as string | undefined, plan: u.plan as string | undefined }))
    .filter(u => !!u.name)
    .slice(0,50);

  // Group helpers for elegant ordering: Admins → Pro → Members
  const isProPlan = (p?: string) => canonicalPlan(p) === 'ultra';
  const onlineAdmins = onlineUsers.filter(u => (u.role || '').toLowerCase() === 'admin');
  const onlinePros = onlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && isProPlan(u.plan || undefined));
  const onlineBase = onlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && !isProPlan(u.plan || undefined));
  const offlineAdmins = offlineUsers.filter(u => (u.role || '').toLowerCase() === 'admin');
  const offlinePros = offlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && isProPlan(u.plan || undefined));
  const offlineBase = offlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && !isProPlan(u.plan || undefined));

  // Use inline gridTemplateColumns to avoid Tailwind JIT missing dynamic arbitrary values
  const gridTemplateColumns = useMemo(() => {
    if (forgeView !== 'chat') return '1fr';
    const left = showChannels ? '280px ' : '';
    const right = (showMembers && activeChatType === 'channel') ? ' 300px' : '';
    return `${left}1fr${right}`;
  }, [forgeView, showChannels, showMembers, activeChatType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-6rem)]">
        <Lottie animationData={fireAnimation} loop className="w-24 h-24 -mt-[8vh]" />
      </div>
    );
  }

  return (
    <div className={"relative grid h-[calc(100dvh-6rem)] min-h-[calc(100dvh-6rem)] min-w-0"} style={{ gridTemplateColumns }}>
        <SubscriptionGate />
        {forgeView === 'chat' && showChannels ? (
        <aside className="h-full min-h-0 border-r border-[color:var(--border)] overflow-y-auto p-2 bg-[var(--card)] md:static absolute inset-0 z-40"> 
          {/* Mobile close */}
                  <button className="md:hidden absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[color:var(--border)]/60 bg-white/5 hover:bg-white/10 text-xs" onClick={() => setShowChannels(false)} aria-label="Close channels">
            <span className="sr-only">Close</span>
                    <Chevron direction="left" className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold px-2 mb-2">Channels {me?.plan === 'pro' ? <span className="ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">Pro</span> : null}</div>
          <ul className="space-y-1">
            {channels.filter(c=>c.slug !== 'livestream').map((c)=> (
              <li key={c.slug}>
                <button onClick={async()=>{
                  if (c.slug === 'pro' && canonicalPlan(me?.plan) !== 'ultra') {
                    try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {}
                    return;
                  }
                  setActiveChatType('channel');
                  setActive(c.slug);
                  setActiveDm(null);
                  setForgeView('chat');
                  router.push('/dashboard/chat');
                  setChatLoading(true);
                  if (c.slug === 'request-a-feature') {
                    setMessages([]);
                  } else {
                    const m: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/messages?channel=${c.slug}`).then(r=>r.json());
                    setMessages((m.messages||[]).map((mm)=>({...mm,status:'sent'})));
                  }
                  setChatLoading(false);
                }} className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${forgeView==='chat' && activeChatType==='channel' && active===c.slug ? `bg-white/10 ${c.slug==='pro' ? 'ring-1 ring-[#ff6a00]/40' : ''}` : `hover:bg-white/5 ${c.slug==='pro' ? 'ring-1 ring-transparent hover:ring-[#ff6a00]/30' : ''}`}`}>
                  <span className={`${c.slug==='pro' ? 'text-[#ff6a00]' : ''}`}>#{c.slug}</span>
                  {c.slug === 'pro' && canonicalPlan(me?.plan) !== 'ultra' ? (
                    <span title="Pro required" className="ml-1 inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] bg-white/10">🔒</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="text-sm font-semibold px-2 mt-4 mb-2">Direct Messages</div>
          <ul className="space-y-1">
            {dmConversations.map((u)=> {
              const p = presence.find(pp => (pp.email || '').toLowerCase() === (u.email || '').toLowerCase());
              const isAdm = (p?.role || '').toLowerCase() === 'admin';
              const isPro = (() => { const s = (p?.plan || '').toLowerCase(); return canonicalPlan(s) === 'ultra'; })();
              return (
              <li key={u.email}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e)=>{
                        e.preventDefault();
                        e.stopPropagation();
                        const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                        try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                      }}
                      onKeyDown={(e)=>{
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          try { (e.currentTarget as HTMLElement).click(); } catch {}
                        }
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${forgeView==='chat' && activeChatType==='dm' && activeDm?.email===u.email? 'bg-white/10' : 'hover:bg-white/5'}`}
                    >
                      <Avatar className="size-5">
                        <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                        <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                      </Avatar>
                        <span className={`truncate ${isAdm ? 'text-[#ef4444]' : (isPro ? 'text-[#ff6a00]' : '')}`}>{u.name || u.email}</span>
                        {isAdm ? (
                          <span className="ml-auto text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[#ef4444]/30">Admin</span>
                        ) : (isPro ? (
                          <span className="ml-auto text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">Pro</span>
                        ) : null)}
                        <button
                          title="Close conversation"
                          aria-label="Close conversation"
                          className="ml-2 text-xs px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-[color:var(--border)]/60"
                          onClick={async (e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              await fetch('/api/chat/dm/hidden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otherEmail: u.email }) });
                              setDmConversations(prev => prev.filter(c => c.email !== u.email));
                              // If closing the active DM, switch back to last channel
                              setActiveChatType('channel');
                              setActive('general');
                              setActiveDm(null);
                              setMessages([]);
                            } catch {}
                          }}
                        >
                          ×
                        </button>
                    </div>
                  </ContextMenuTrigger>
                  <UserContextMenu
                    meEmail={me?.email}
                    email={u.email}
                    name={u.name || u.email}
                    activeChannel={active}
                    blocked={blocked}
                    onBlockedChange={setBlocked}
                    isAdmin={me?.role === 'admin'}
                      userRole={p?.role}
                      userPlan={p?.plan}
                    onStartDm={async (email, name) => {
                  setActiveChatType('dm');
                      setActiveDm({ email, name, image: u.image });
                  setForgeView('chat');
                  router.push('/dashboard/chat');
                  closeChannelsIfMobile();
                  setChatLoading(true);
                      const m: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                  setMessages((m.messages||[]).map((mm)=>({...mm,status:'sent'})));
                  setChatLoading(false);
                      // Unhide if previously hidden
                      try { await fetch('/api/chat/dm/hidden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otherEmail: email }) }); } catch {}
                      setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                    }}
                  />
                </ContextMenu>
              </li>
              );
            })}
          </ul>
        </aside>
        ) : null}
        <section className="flex flex-col min-w-0 min-h-0 h-full">
          {forgeView === 'chat' && (
            <>
              <div className="h-12 flex items-center justify-between px-3 border-b border-[color:var(--border)]">
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs px-2 py-1 rounded hover:bg-white/5"
                    title={showChannels ? 'Hide channels' : 'Show channels'}
                    onClick={()=> setShowChannels(v=>{
                      const next = !v;
                      try { if (next && typeof window !== 'undefined' && window.innerWidth < 768) setShowMembers(false); } catch {}
                      return next;
                    })}
                  >
                    <Chevron direction={showChannels ? "left" : "right"} className="h-4 w-4 transition-transform" />
                  </button>
                  <div className="flex items-center gap-2">
                    {activeChatType === 'dm' ? (
                      (()=>{
                        const dp = activeDm?.email ? presence.find(u => (u.email || '').toLowerCase() === (activeDm!.email || '').toLowerCase()) : undefined;
                        const isAdm = (dp?.role || '').toLowerCase() === 'admin';
                        const isPro = (() => { const s = (dp?.plan || '').toLowerCase(); return canonicalPlan(s) === 'ultra'; })();
                        const name = activeDm?.name || activeDm?.email || 'self';
                        return (
                          <span className="inline-flex items-center gap-2">
                            <span className={`${isAdm ? 'text-[#ef4444]' : (isPro ? 'text-[#ff6a00]' : '')}`}>@{name}</span>
                            {isAdm ? (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[#ef4444]/30">Admin</span>
                            ) : null}
                            {/* Ephemeral TTL indicator */}
                            <DmTtlNotice self={!!(me?.email && activeDm?.email && me.email.toLowerCase() === activeDm.email.toLowerCase())} ttlSeconds={dmTtlSeconds} />
                          </span>
                        );
                      })()
                    ) : (
                      `#${active}`
                    )}
                    {activeChatType === 'channel' && isChannelLocked ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-[color:var(--border)]/60" title="Channel is locked">
                        🔒 Locked
                      </span>
                    ) : null}
                  </div>
                </div>
                {activeChatType === 'channel' ? (
                  <button className="text-xs px-2 py-1 rounded hover:bg-white/5" onClick={()=> setShowMembers(v=>{
                    const next = !v;
                    try { if (next && typeof window !== 'undefined' && window.innerWidth < 768) setShowChannels(false); } catch {}
                    return next;
                  })}>{showMembers ? 'Hide Members' : 'Show Members'}</button>
                ) : null}
              </div>
              {/* Admin confirmation dialogs */}
              <AlertDialog open={!!confirmOpen} onOpenChange={(o)=>{ if(!o) setConfirmOpen(null); }}>
                <AlertDialogContent>
                  <AlertDialogTitle>Confirm action</AlertDialogTitle>
                  <AlertDialogDescription>
                    {confirmOpen?.type === 'purge' ? `Purge last ${confirmOpen.count} messages in #${active}? This cannot be undone.` : ''}
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={()=> setConfirmOpen(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async()=>{
                      if (confirmOpen?.type === 'purge') {
                        setConfirmOpen(null);
                        setChatLoading(true);
                        try {
                          await fetch('/api/admin/chat/purge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: active, limit: confirmOpen.count }) });
                        } catch {}
                        try {
                          const m: { messages?: { id?: string; text: string; userName: string; userEmail?: string; created_at?: string }[] } = await fetch(`/api/chat/messages?channel=${encodeURIComponent(active)}`).then(r=>r.json());
                          setMessages((m.messages || []).map((mm) => ({ ...mm, status: 'sent' })));
                        } catch {}
                        setChatLoading(false);
                      }
                    }}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
                {muted?.active ? (
                  <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
                    You are currently muted. Your messages will not be delivered.
                  </div>
                ) : null}
                {activeChatType === 'dm' && me?.email && activeDm?.email && activeDm.email.toLowerCase() === me.email.toLowerCase() ? (
                  <div className="text-xs text-white/80 bg-white/5 border border-[color:var(--border)]/60 rounded px-3 py-2">
                    Here&apos;s your personal private chat. Only you can see these messages.
                  </div>
                ) : null}
                {chatLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Lottie animationData={fireAnimation} loop className="w-20 h-20 mt-8" />
                  </div>
                ) : (
                  active === 'request-a-feature' ? (
                    <FeatureRequestsPanel showForm={false} />
                  ) : messages.map((m)=> {
                    const p = (m.userEmail ? presence.find(u => (u.email || '').toLowerCase() === (m.userEmail || '').toLowerCase()) : undefined);
                    const isAdminName = (p?.role || '').toLowerCase() === 'admin';
                    const isProName = (() => { const s = (p?.plan || '').toLowerCase(); return canonicalPlan(s) === 'ultra'; })();
                    const nameColorClass = isAdminName ? 'text-[#ef4444]' : (isProName ? 'text-[#ff6a00]' : 'text-white/60');
                    const decoBase = isAdminName ? 'decoration-[#ef4444]/30 hover:decoration-[#ef4444]/60' : (isProName ? 'decoration-[#ff6a00]/30 hover:decoration-[#ff6a00]/60' : 'decoration-white/20 hover:decoration-white/60');
                    return (
                    <ContextMenu key={m.id || m.tempId}>
                      <ContextMenuTrigger asChild>
                        <div className="text-sm flex items-center gap-2">
                          {m.userEmail ? (
                            <button
                                className={`${nameColorClass} mr-1 underline underline-offset-2 ${decoBase} cursor-pointer`}
                              onClick={(e)=>{
                                e.preventDefault();
                                e.stopPropagation();
                                // Left-click should open the same context menu. Dispatch a synthetic contextmenu event.
                                const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                                try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                              }}
                            >
                              {m.userName}
                            </button>
                          ) : (
                            <span className="text-white/60 mr-1">{m.userName}</span>
                          )}
                          <span className={m.status==='pending' ? 'opacity-70' : ''}>{m.text}</span>
                          {m.status==='failed' ? (
                            <button className="text-xs text-red-400 underline" onClick={()=>sendMessage(m.text, m.tempId)}>Retry</button>
                          ) : null}
                          {m.status==='pending' ? (
                            <svg className="animate-spin size-3 text-white/60" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a 8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
                          ) : null}
                        </div>
                      </ContextMenuTrigger>
                      {m.userEmail ? (
                        <UserContextMenu
                          meEmail={me?.email}
                          email={m.userEmail}
                          name={m.userName}
                          activeChannel={active}
                          blocked={blocked}
                          onBlockedChange={setBlocked}
                          isAdmin={me?.role === 'admin'}
                          userRole={p?.role}
                          userPlan={p?.plan}
                          onStartDm={async (email, name) => {
                            setActiveChatType('dm');
                            setActiveDm({ email, name, image: undefined });
                            setForgeView('chat');
                            router.push('/dashboard/chat');
                            closeChannelsIfMobile();
                            setChatLoading(true);
                            const mm: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                            setMessages((mm.messages||[]).map((x)=>({...x,status:'sent'})));
                            setChatLoading(false);
                            setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: undefined }, ...prev]);
                          }}
                        />
                      ) : null}
                    </ContextMenu>
                    );
                  })
                )}
              </div>
              <form className="p-3 border-t border-[color:var(--border)] flex gap-2" onSubmit={async (e)=>{
                e.preventDefault();
                const text = inputRef.current?.value || "";
                if (!text) return;
                if (text.trim().startsWith('/')) { const handled = await tryHandleSlashCommand(text); inputRef.current!.value = ""; if (handled) return; }
                if (muted?.active) return;
                inputRef.current!.value="";
                if (active === 'request-a-feature') return; // no chat send in feature channel
                await sendMessage(text);
              }}>
                {active === 'request-a-feature' ? (
                  <div className="w-full">
                    <Collapsible open={featureOpen} onOpenChange={setFeatureOpen}>
                      <div className="flex items-center gap-2 w-full">
                        <CollapsibleTrigger asChild>
                          <button type="button" className="px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm border border-[color:var(--border)]/60">
                            {featureOpen ? 'Hide request form' : 'Request a feature'}
                          </button>
                        </CollapsibleTrigger>
                        {!featureOpen ? (
                          <span className="text-xs text-white/60">Pro can post daily; others weekly.</span>
                        ) : null}
                      </div>
                      <CollapsibleContent className="pt-2">
                        <FeatureRequestInlineForm />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : (
                  <>
                    <input ref={inputRef} className="flex-1 rounded bg-white/5 px-3 py-2 text-sm disabled:opacity-60" placeholder={activeChatType==='dm' ? `Message @${activeDm?.name || activeDm?.email || 'self'}` : `Message #${active}`} disabled={lockedForMe} />
                    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" className="hidden md:inline-flex items-center justify-center px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm" title="Insert emoji" aria-label="Insert emoji">
                          😊
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" sideOffset={8} className="p-2 w-72 max-h-[20rem] overflow-y-auto">
                        <div className="grid grid-cols-8 gap-2">
                          {[
                            // Smileys & emotion
                            "😀","😁","😂","🤣","😊","😇","🙂","😉",
                            "🥰","😍","😘","😗","😙","😚","😋","😛",
                            "😜","🤪","😝","🫠","🤗","🤩","🤔","🫨",
                            "🤨","😐","😑","😶","🙄","😏","😣","😥",
                            "😮","🤐","😯","😪","😫","🥱","😴","😌",
                            "😤","😮‍💨","😓","😢","😭","😡","🤬","🥵",
                            "🥶","🤮","🤢","🤧","😷","🤕","🤒","🤥",
                            "🤯","🤠","😎","🥳","🥺","🫠","🫨","🫥",
                            // People & gestures
                            "👍","👎","👏","🙌","🙏","🤝","🤞","✌️",
                            "🤘","🤙","💪","🫶","👉","👈","👆","👇",
                            "🫵","👋","✋","🖐️","🤚","✍️","🤌","🫰",
                            "🫳","🫴","👀","🫡","🤝","🤲","🙇","💁",
                            // Hearts & symbols
                            "❤️","🧡","💛","💚","💙","💜","🖤","🤍",
                            "🤎","💖","💗","💓","💞","💕","💘","💝",
                            "✨","🎉","🎊","🎁","🥇","⭐️","🌟","⚡️",
                            "✅","❌","❓","❗","⭕","🔴","🟢","🔵",
                            "🟡","🟣","🟤","⚪","⚫","🟥","🟧","🟨",
                            // Fun/memes
                            "💯","🗿","💀","☠️","🤡","🧠","🧩","🛠️",
                            "🔥","🚀","🧨","🎯","🪄","🌀","💡","📎",
                            // Animals & food (a few)
                            "🐶","🐱","🦊","🐼","🦄","🍕","🍔","☕️",
                            // Weather & celestial
                            "☀️","🌙","☁️","🌧️","🌈","❄️","🌊","🌋",
                            // Flags
                            ...flagEmojis
                          ].map((e, i)=> (
                            <button key={`${e}-${i}`} type="button" className="text-xl leading-none rounded hover:bg-white/10 p-1" onClick={()=>{ insertEmoji(e); setEmojiOpen(false); }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button type="submit" className="px-3 py-2 rounded bg-primary text-black text-sm disabled:opacity-60" disabled={!!muted?.active || lockedForMe}>Send</button>
                  </>
                )}
              </form>
            </>
          )}
          {forgeView === 'forge' && (
            <div className="p-3 flex-1 flex min-h-0 overflow-hidden">
              <div className="w-full h-full min-h-0">
                {forgeTab === 'workspace' ? <DashboardWorkspacePanel /> : <TabsViewFancy />}
              </div>
            </div>
          )}
          {forgeView === 'livestream' && (
            <div className="p-3 flex-1 flex min-h-0 overflow-hidden">
              <div className="w-full h-full min-h-0">
                <LivestreamPanel />
              </div>
            </div>
          )}
        </section>
        {showMembers && forgeView === 'chat' && activeChatType === 'channel' ? (
          <aside className="h-full min-h-0 border-l border-[color:var(--border)] overflow-y-auto p-3 bg-[var(--popover)] space-y-3 md:static absolute inset-0 z-40">
            {/* Header row: left chevron, right-aligned Online count */}
            <div className="flex items-center gap-2">
              <button className="md:hidden inline-flex items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-white/5 hover:bg-white/10 size-7" onClick={() => setShowMembers(false)} aria-label="Hide members">
                <Chevron direction="left" className="h-4 w-4" />
              </button>
              <div className="ml-auto text-sm font-semibold text-right w-full">Online <span className="text-white/50">({onlineUsers.length})</span></div>
            </div>
            <ul className="space-y-1 text-sm">
              {chatLoading ? (
                <li className="animate-pulse">
                  <div className="h-4 w-full bg-white/10 rounded" />
                </li>
              ) : (
                <>
                  {onlineAdmins.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ef4444]">Admins</li>
                  ) : null}
                  {onlineAdmins.map((u) => (
                  <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                          e.preventDefault();
                          e.stopPropagation();
                          const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                          try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className={`size-2 rounded-full ${u.status==='dnd' ? 'bg-red-400' : u.status==='idle' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className={`truncate text-right text-[#ef4444]`}>{u.name}</span>
                          <Avatar className="size-5">
                            <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                            <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                          </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                        <UserContextMenu
                          meEmail={me?.email}
                          email={u.email}
                          name={u.name}
                          activeChannel={active}
                          blocked={blocked}
                          onBlockedChange={setBlocked}
                          isAdmin={me?.role === 'admin'}
                          userRole={u.role}
                          userPlan={u.plan}
                          onStartDm={async (email, name) => {
                          setActiveChatType('dm');
                            setActiveDm({ email, name, image: u.image });
                          setForgeView('chat');
                          router.push('/dashboard/chat');
                          closeChannelsIfMobile();
                          setChatLoading(true);
                            const mm: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                            setMessages((mm.messages||[]).map((x)=>({...x,status:'sent'})));
                          setChatLoading(false);
                            setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                          }}
                        />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                  {onlinePros.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ff6a00]">Pro</li>
                  ) : null}
                  {onlinePros.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className={`size-2 rounded-full ${u.status==='dnd' ? 'bg-red-400' : u.status==='idle' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className={`truncate text-right text-[#ff6a00]`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                              setActiveDm({ email, name, image: u.image });
                              setForgeView('chat');
                              router.push('/dashboard/chat');
                              closeChannelsIfMobile();
                              setChatLoading(true);
                              const mm: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                              setMessages((mm.messages||[]).map((x)=>({...x,status:'sent'})));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                          ) : null}
                      </ContextMenu>
                    </li>
                  ))}
                  {onlineBase.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-white/60">Members</li>
                          ) : null}
                  {onlineBase.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                          }}>
                            <span className={`size-2 rounded-full ${u.status==='dnd' ? 'bg-red-400' : u.status==='idle' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className={`truncate text-right`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                          </button>
                        </ContextMenuTrigger>
                        {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                              setActiveDm({ email, name, image: u.image });
                              setForgeView('chat');
                              router.push('/dashboard/chat');
                              setChatLoading(true);
                              const mm: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                              setMessages((mm.messages||[]).map((x)=>({...x,status:'sent'})));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                </>
              )}
              {!chatLoading && onlineUsers.length === 0 ? <li className="text-white/50">No one here yet</li> : null}
            </ul>
            <div className="text-sm font-semibold pt-2 text-right">Offline</div>
            <ul className="space-y-1 text-sm text-white/60">
              {chatLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="animate-pulse">
                    <div className="h-4 w-full bg-white/10 rounded" />
                  </li>
                ))
              ) : (
                <>
                  {offlineAdmins.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ef4444]">Admins</li>
                  ) : null}
                  {offlineAdmins.map((u) => (
                  <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                          e.preventDefault();
                          e.stopPropagation();
                          const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                          try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className="size-2 rounded-full bg-white/30"></span>
                            <span className={`truncate text-right text-[#ef4444]`}>{u.name}</span>
                          <Avatar className="size-5">
                            <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                            <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                          </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                        <UserContextMenu
                          meEmail={me?.email}
                          email={u.email}
                          name={u.name}
                          activeChannel={active}
                          blocked={blocked}
                          onBlockedChange={setBlocked}
                          isAdmin={me?.role === 'admin'}
                          userRole={u.role}
                          userPlan={u.plan}
                          onStartDm={async (email, name) => {
                          setActiveChatType('dm');
                            setActiveDm({ email, name, image: u.image });
                          setForgeView('chat');
                          router.push('/dashboard/chat');
                          closeChannelsIfMobile();
                          setChatLoading(true);
                            const mm: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                            setMessages((mm.messages||[]).map((x)=>({...x,status:'sent'})));
                          setChatLoading(false);
                            setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                          }}
                        />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                  {offlinePros.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ff6a00]">Pro</li>
                  ) : null}
                  {offlinePros.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className="size-2 rounded-full bg-white/30"></span>
                            <span className={`truncate text-right text-[#ff6a00]`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                              setActiveDm({ email, name, image: u.image });
                              setForgeView('chat');
                              router.push('/dashboard/chat');
                              setChatLoading(true);
                              const mm: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                              setMessages((mm.messages||[]).map((x)=>({...x,status:'sent'})));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                          ) : null}
                      </ContextMenu>
                    </li>
                  ))}
                  {offlineBase.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-white/60">Members</li>
                          ) : null}
                  {offlineBase.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                          }}>
                            <span className="size-2 rounded-full bg-white/30"></span>
                            <span className={`truncate text-right`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                          </button>
                        </ContextMenuTrigger>
                        {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                              setActiveDm({ email, name, image: u.image });
                              setForgeView('chat');
                              router.push('/dashboard/chat');
                              setChatLoading(true);
                              const mm: { messages?: { id?: string; text: string; userName: string; created_at?: string }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json());
                              setMessages((mm.messages||[]).map((x)=>({...x,status:'sent'})));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                </>
              )}
            </ul>
          </aside>
        ) : null}
    </div>
  );
}

function UserContextMenu({ meEmail, email, name, activeChannel, blocked, onBlockedChange, isAdmin, onStartDm, userRole, userPlan }: { meEmail?: string; email: string; name: string; activeChannel: string; blocked: string[]; onBlockedChange: React.Dispatch<React.SetStateAction<string[]>>; isAdmin?: boolean; onStartDm?: (email: string, name: string) => Promise<void> | void; userRole?: string; userPlan?: string }) {
  const [profile, setProfile] = useState<{ name?: string; image?: string; vehicles?: Array<{ make?: string; model?: string }>; photos?: string[]; bio?: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string,string>>({});
  const [loadingProfile, setLoadingProfile] = useState(true);
  const isSelf = (meEmail || '').toLowerCase() === (email || '').toLowerCase();
  const isAdminUser = (userRole || '').toLowerCase() === 'admin';
  const isProUser = (() => { const s = (userPlan || '').toLowerCase(); return s === 'pro' || s === 'ultra'; })();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/chat-profile?email=${encodeURIComponent(email)}`).then(r=>r.json());
        if (!cancelled) setProfile(res || null);
        const keys = Array.isArray(res?.photos) ? res.photos as string[] : [];
        for (const key of keys) {
          try {
            const v = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key }) }).then(r=>r.json());
            if (typeof v?.url === 'string') setPreviews(prev => ({ ...prev, [key]: v.url }));
          } catch {}
        }
      } catch {}
      finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);
  return (
    <ContextMenuContent className="w-72">
      <div className="flex items-center gap-3 px-2 py-1.5">
        <Avatar className="size-8">
          <AvatarImage src={profile?.image} alt={profile?.name || name} />
          <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-5" /></AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`text-sm font-medium truncate ${isAdminUser ? 'text-[#ef4444]' : (isProUser ? 'text-[#ff6a00]' : '')}`}>{profile?.name || name}</div>
            {isAdminUser ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[#ef4444]/30">Admin</span>
            ) : null}
            {!isAdminUser && isProUser ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">Pro</span>
            ) : null}
          </div>
          {isSelf ? <div className="text-[10px] text-white/60">This is how others see your chat profile</div> : null}
        </div>
        
      </div>
      {typeof profile?.bio === 'string' && profile.bio.trim() ? (
        <div className="px-2 pb-1 text-xs text-white/80 whitespace-pre-wrap">{profile.bio}</div>
      ) : null}
      <div className="px-2 pb-1 flex items-center gap-2">
        <button
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 border border-[color:var(--border)]/60 cursor-pointer"
          onClick={()=> onStartDm?.(email, profile?.name || name)}
        >
          {isSelf ? 'Open your private chat' : `Message @${profile?.name || name}`}
          </button>
        {!isSelf ? (
          <button
            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 border border-[color:var(--border)]/60 cursor-pointer"
            onClick={async ()=>{
              try {
                await fetch('/api/chat/dm/hidden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otherEmail: email }) });
                // Optimistically remove from sidebar by dispatching a simple event for parent to refetch
                try { window.dispatchEvent(new CustomEvent('dm-hidden-changed')); } catch {}
                toast.success('Conversation closed');
              } catch {}
            }}
            title="Close conversation"
            aria-label="Close conversation"
          >
            Close
          </button>
        ) : null}
        {(profile?.name || name) ? (
          <button
            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 border border-[color:var(--border)]/60 cursor-pointer"
            onClick={()=>{
              const handle = String(profile?.name || name || '').replace(/^@+/, '');
              if (!handle) return;
              window.open(`https://instagram.com/${encodeURIComponent(handle)}`, '_blank', 'noopener,noreferrer');
            }}
            title="Open Instagram"
            aria-label="Open Instagram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM18 6.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z" />
            </svg>
          </button>
      ) : null}
      {isSelf ? (
        <button
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 border border-[color:var(--border)]/60 cursor-pointer"
          onClick={()=>{ try { window.dispatchEvent(new CustomEvent('open-profile')); } catch {} }}
          title="Edit profile"
          aria-label="Edit profile"
        >
          <SquarePen className="size-3.5" />
        </button>
      ) : null}
      </div>
      {loadingProfile ? (
        <div className="px-2 py-1">
          <div className="text-xs text-white/60 mb-1">Vehicles</div>
          <div className="flex flex-wrap gap-1 text-xs">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
      ) : Array.isArray(profile?.vehicles) && profile!.vehicles!.length > 0 ? (
        <div className="px-2 py-1">
          <div className="text-xs text-white/60 mb-1">Vehicles</div>
          <div className="flex flex-wrap gap-1 text-xs">
            {profile!.vehicles!.slice(0,6).map((v: { make?: string; model?: string }, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-[color:var(--border)]/60">{v.make} {v.model}</span>
            ))}
          </div>
        </div>
      ) : null}
      {Array.isArray(profile?.photos) && profile!.photos!.length > 0 ? (
        <div className="px-2 py-1">
          <div className="text-xs text-white/60 mb-1">Photos</div>
          <ul className="grid grid-cols-3 gap-1">
            {profile!.photos!.slice(0,6).map((k: string) => (
              <li key={k} className="aspect-square rounded overflow-hidden bg-black/20">
                {previews[k] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[k]} alt="Car" className="w-full h-full object-cover" />
                ) : (
                  <Skeleton className="w-full h-full" />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ContextMenuSeparator />
      {isAdmin && meEmail && meEmail.toLowerCase() !== email.toLowerCase() ? (
        <>
          <ContextMenuItem onClick={async()=>{ const ok = await confirmToast({ title: `Mute ${name} globally?` }); if(!ok) return; try{ await fetch('/api/admin/mutes',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email })}); toast.success('Muted'); } catch {} }}>Mute globally</ContextMenuItem>
          <ContextMenuItem onClick={async()=>{ const ok = await confirmToast({ title: `Mute ${name} in #${activeChannel}?` }); if(!ok) return; try{ await fetch('/api/admin/mutes',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email, channels: [activeChannel] })}); toast.success('Muted'); } catch {} }}>Mute in #{activeChannel}</ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      {meEmail && meEmail.toLowerCase() !== email.toLowerCase() ? (
        blocked.includes(email) ? (
          <ContextMenuItem onClick={async()=>{ try{ await fetch('/api/blocks',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email })}); onBlockedChange(prev=>prev.filter(e=>e!==email)); } catch {} }}>Unblock</ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={async()=>{ try{ await fetch('/api/blocks',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email })}); onBlockedChange(prev=>[...prev, email]); } catch {} }}>Block</ContextMenuItem>
        )
      ) : null}
      {meEmail && meEmail.toLowerCase() !== email.toLowerCase() ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={async()=>{ try{ await fetch('/api/chat/dm/hidden',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ otherEmail: email })}); try { window.dispatchEvent(new CustomEvent('dm-hidden-changed')); } catch {}; toast.success('Conversation closed'); } catch {} }}>Close conversation</ContextMenuItem>
        </>
      ) : null}
    </ContextMenuContent>
  );
}



export default function DashboardChatPage() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}> 
      <DashboardChatPageInner />
    </Suspense>
  );
}
