"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type FeatureItem = {
  id: string
  title: string
  description: string | null
  created_at: string | null
  created_byName: string
  wanted: number
  notWanted: number
  myVote: 'up' | 'down' | null
}

export default function FeatureRequestsPanel({ showForm = true }: { showForm?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeatureItem[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch list + meta initially for the main panel
        const r = await fetch('/api/feature-requests', { cache: 'no-store' }).then(r=>r.json());
        if (cancelled) return;
        setItems(Array.isArray(r?.requests) ? r.requests : []);
        setCanCreate(!!r?.canCreate);
        setNextAllowedAt(r?.nextAllowedAt || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onCreated(ev: Event) {
      try {
        const d = (ev as CustomEvent).detail as FeatureItem | undefined;
        if (d && d.id) {
          setItems(prev => [d, ...prev]);
        }
      } catch {}
    }
    window.addEventListener('feature-request-created', onCreated as EventListener);
    return () => window.removeEventListener('feature-request-created', onCreated as EventListener);
  }, []);

  const cooldownText = useMemo(() => {
    if (!nextAllowedAt) return null;
    try {
      const ts = Date.parse(nextAllowedAt);
      if (!Number.isFinite(ts)) return null;
      const ms = ts - Date.now();
      if (ms <= 0) return null;
      const hrs = Math.ceil(ms / (60 * 60 * 1000));
      if (hrs >= 24) {
        const days = Math.ceil(hrs / 24);
        return `You can post again in ~${days} day${days===1?'':'s'}.`;
      }
      return `You can post again in ~${hrs} hour${hrs===1?'':'s'}.`;
    } catch {
      return null;
    }
  }, [nextAllowedAt]);

  async function submitFeature() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: desc.trim() || undefined })
      });
      const j = await r.json();
      if (!r.ok) {
        if (j?.nextAllowedAt) setNextAllowedAt(j.nextAllowedAt);
        throw new Error(j?.error || 'Failed to create');
      }
      const created = j?.request as FeatureItem | undefined;
      if (created) {
        setItems(prev => [created, ...prev]);
        setTitle("");
        setDesc("");
        setCanCreate(false);
        // If server enforces cool-down, compute a local conservative 24h window for Pro or 7d for Base would be ideal, but we rely on nextAllowedAt on refresh
      }
      toast.success('Request submitted');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to submit');
    } finally {
      setBusy(false);
    }
  }

  async function vote(id: string, stance: 'up' | 'down') {
    if (votingId) return; // prevent double-click spam
    setVotingId(id);
    try {
      const r = await fetch('/api/feature-requests/vote', { method:'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id, stance }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to vote');
      setItems(prev => prev.map(it => it.id === id ? { ...it, wanted: j?.wanted ?? it.wanted, notWanted: j?.notWanted ?? it.notWanted, myVote: j?.myVote ?? stance } : it));
    } catch (e) {
      toast.error((e as Error).message || 'Failed to vote');
    } finally {
      setVotingId(null);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header removed (channel name already indicates context) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {showForm ? (
          <Card className="bg-[color:var(--popover)] border-[color:var(--border)]/80">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Suggest a feature</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input ref={titleRef} value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Short title" className="text-sm" />
              <Textarea value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Optional details" className="text-sm min-h-[6em]" />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={submitFeature} disabled={!canCreate || !title.trim() || busy}>
                  {busy ? 'Submitting…' : 'Submit'}
                </Button>
                {!canCreate && cooldownText ? (
                  <span className="text-xs text-white/60">{cooldownText}</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="text-sm text-white/60">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-white/60">No requests yet. Be the first!</div>
        ) : (
          <ul className="space-y-2">
            {items.map(item => (
              <li key={item.id} className="rounded border border-[color:var(--border)]/70 bg-[color:var(--card)]">
                <div className="p-3 flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 w-16 shrink-0">
                    <Button variant={item.myVote==='up'? 'default':'outline'} size="sm" className="w-full" onClick={()=>vote(item.id, 'up')} disabled={votingId===item.id}>
                      ▲ {item.wanted}
                    </Button>
                    <Button variant={item.myVote==='down'? 'destructive':'outline'} size="sm" className="w-full" onClick={()=>vote(item.id, 'down')} disabled={votingId===item.id}>
                      ▼ {item.notWanted}
                    </Button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{item.title}</div>
                    {item.description ? (
                      <div className="text-sm text-white/80 whitespace-pre-wrap mt-1">{item.description}</div>
                    ) : null}
                    <div className="text-xs text-white/50 mt-2">by {item.created_byName}{item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


