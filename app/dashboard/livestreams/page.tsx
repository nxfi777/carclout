'use client';

import { useEffect, useState } from 'react';
import LivestreamPanel from '@/components/livestream-panel';

export default function DashboardLivestreamsPage() {
  const [isLive, setIsLive] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await fetch('/api/livestream/status', { cache: 'no-store' }).then((r) => r.json());
        if (mounted) setIsLive(!!s?.isLive);
      } catch { if (mounted) setIsLive(false); }
      try {
        const es = new EventSource('/api/livestream/status/live');
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data || '{}');
            if (mounted) setIsLive(!!data?.isLive);
          } catch {}
        };
        es.onerror = () => { try { es.close(); } catch {} };
        return () => { try { es.close(); } catch {}; };
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  if (isLive === null) return <div className="p-6">Checking livestreams…</div>;
  if (!isLive) return <div className="p-6 text-white/80">No livestreams right now, check back later.</div>;
  return (
    <div className="p-3 flex-1 flex min-h-0 overflow-hidden">
      <div className="w-full h-full min-h-0">
        <LivestreamPanel />
      </div>
    </div>
  );
}


