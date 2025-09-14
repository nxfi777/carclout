"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect as _useEffect } from "react";
import { useState as _useState } from "react";
import { Button } from "@/components/ui/button";
import PlanSelector from "@/components/plan-selector";

type MeResponse = { name?: string; email?: string; plan?: string | null } | { error: string };

export default function WelcomePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState<string>("");
  const [carPhotos, setCarPhotos] = useState<string[]>([]);
  const [chatProfilePhotos, setChatProfilePhotos] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string,string>>({});
  const [bio, setBio] = useState<string>("");
  const appliedParamsRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meRes = await fetch('/api/me', { cache: 'no-store' });
        if (meRes.status === 401) {
          router.replace('/auth/signin');
          return;
        }
        const me: MeResponse = await meRes.json();
        const plan = ("plan" in (me as Record<string, unknown>) ? (me as Record<string, unknown>).plan : null) as string | null | undefined;
        const displayName = ("name" in (me as Record<string, unknown>) && typeof (me as Record<string, unknown>).name === 'string'
          ? String((me as Record<string, unknown>).name)
          : ("email" in (me as Record<string, unknown>) ? String((me as Record<string, unknown>).email) : ""));
        if (mounted) setName(displayName);
        const isSubscribed = plan === 'minimum' || plan === 'basic' || plan === 'pro';
        if (isSubscribed) {
          router.replace('/dashboard/home');
          return;
        }
        // Apply any onboarding params after login (once)
        if (!appliedParamsRef.current) {
          appliedParamsRef.current = true;
          const handle = params.get('name') || '';
          const chosenPlan = params.get('plan') || '';
          try {
            if (handle) {
              await fetch('/api/profile', { method: 'POST', body: JSON.stringify({ name: sanitizeInstagramHandle(handle) }) });
            }
          } catch {}
          // If a plan was preselected before signup, auto-start checkout now
          if (chosenPlan === 'minimum' || chosenPlan === 'pro') {
            try {
              const res = await fetch('/api/billing/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: chosenPlan }) });
              const json = await res.json().catch(()=>({}));
              if (json?.url) {
                window.location.assign(json.url);
                return;
              }
            } catch {}
          }
        }
        try {
          const prof = await fetch('/api/profile', { cache: 'no-store' }).then(r=>r.json());
          if (mounted) {
            setCarPhotos(Array.isArray(prof?.profile?.carPhotos) ? prof.profile.carPhotos : []);
            setChatProfilePhotos(Array.isArray(prof?.profile?.chatProfilePhotos) ? prof.profile.chatProfilePhotos : []);
            setBio(typeof prof?.profile?.bio === 'string' ? prof.profile.bio : '');
          }
        } catch {}
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [router, params]);

  function sanitizeInstagramHandle(input: string): string {
    const withoutAt = input.toLowerCase().replace(/^@+/, "");
    const filtered = withoutAt.replace(/[^a-z0-9._]/g, "");
    return filtered.slice(0, 30);
  }

  if (checking) return null;

  return (
    <main className="container mx-auto px-[1rem] py-[2rem]">
      <section className="max-w-4xl mx-auto text-center space-y-3 mb-[2rem]">
        <h1 className="text-2xl md:text-3xl font-semibold">Welcome{ name ? `, ${name.split(' ')[0]}` : '' } 👋</h1>
        <p className="text-sm md:text-base text-white/70">Choose a plan to unlock your dashboard. You can upgrade or cancel anytime.</p>
      </section>
      <section className="max-w-5xl mx-auto">
        <PlanSelector />
        {/* Optional: Quick bio */}
        <div className="mt-[2rem]">
          <h2 className="text-lg font-semibold mb-2">Optional: Add a short bio</h2>
          <div className="text-xs text-muted-foreground mb-2">This appears in your chat profile and context menu.</div>
          <textarea
            value={bio}
            onChange={(e)=> setBio(e.target.value.slice(0, 500))}
            placeholder="Tell others a bit about you or your build (max 500 chars)"
            className="w-full rounded bg-white/5 px-3 py-2 text-sm min-h-[6rem]"
          />
          <div className="text-xs text-muted-foreground mb-2">{bio.length}/500</div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={async()=>{ try{ await fetch('/api/profile', { method:'POST', body: JSON.stringify({ bio }) }); } catch {} }}>Save bio</Button>
          </div>
        </div>
        {/* Optional: Quick selection of chat profile photos for new users */}
        <div className="mt-[2rem]">
          <h2 className="text-lg font-semibold mb-2">Optional: Pick photos for your chat profile</h2>
          <div className="text-xs text-muted-foreground mb-2">Choose up to 6 vehicle photos to display alongside your name in chat.</div>
          <WelcomeChatPhotoPicker
            allKeys={carPhotos}
            selected={chatProfilePhotos}
            onChange={setChatProfilePhotos}
            previews={previews}
            onNeedPreview={async(keys:string[])=>{
              for (const key of keys) {
                if (previews[key]) continue;
                try {
                  const res = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key }) }).then(r=>r.json());
                  if (typeof res?.url === 'string') setPreviews(prev=>({ ...prev, [key]: res.url }));
                } catch {}
              }
            }}
            onSave={async()=>{
              try { await fetch('/api/profile', { method:'POST', body: JSON.stringify({ chatProfilePhotos }) }); } catch {}
            }}
          />
        </div>
      </section>
    </main>
  );
}

function WelcomeChatPhotoPicker({ allKeys, selected, onChange, previews, onNeedPreview, onSave }: { allKeys: string[]; selected: string[]; onChange: (next: string[]) => void; previews: Record<string,string>; onNeedPreview: (keys: string[]) => Promise<void>; onSave: () => Promise<void> }) {
  const MAX = 6;
  _useEffect(() => {
    const need = (allKeys || []).filter(k => !previews[k]).slice(0, 24);
    if (need.length) { onNeedPreview(need); }
  }, [allKeys, previews, onNeedPreview]);
  function toggle(key: string) {
    const isSel = selected.includes(key);
    if (isSel) onChange(selected.filter(k => k !== key));
    else if (selected.length < MAX) onChange([...selected, key]);
  }
  if (!Array.isArray(allKeys) || allKeys.length === 0) return null;
  return (
    <div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {allKeys.map((k)=>{
          const url = previews[k];
          const isSel = selected.includes(k);
          return (
            <li key={k} className={`relative rounded-md overflow-hidden border ${isSel ? 'ring-2 ring-primary' : 'border-[color:var(--border)]'}`}>
              <button type="button" className="block w-full h-full" onClick={()=>toggle(k)}>
                <div className="aspect-square bg-black/20">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="Car" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted-foreground">
                      <svg className="animate-spin size-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <div>Selected {selected.length}/{MAX}</div>
        <Button size="sm" variant="outline" onClick={onSave}>Save</Button>
      </div>
    </div>
  );
}


