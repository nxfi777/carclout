'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardLivestreamsPage() {
  return (
    <div className="p-6 flex-1 flex min-h-0 overflow-hidden">
      <div className="w-full h-full min-h-0 flex items-center justify-center">
        <Card className="max-w-[36rem] text-center">
          <CardHeader>
            <CardTitle>Livestreams</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              We&apos;re putting the finishing touches on livestreams. Check back again soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/*
Original implementation preserved for later:

'use client';

import { useEffect, useState } from 'react';
import LivestreamPanel from '@/components/livestream-panel';

export default function DashboardLivestreamsPage() {
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [isCohost, setIsCohost] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await fetch('/api/livestream/status', { cache: 'no-store' }).then((r) => r.json());
        if (mounted) setIsLive(!!s?.isLive);
      } catch { if (mounted) setIsLive(false); }
      try {
        const p = await fetch('/api/livestream/permissions', { cache: 'no-store' }).then((r) => r.json());
        if (mounted) setIsCohost(!!p?.isCohost);
      } catch { if (mounted) setIsCohost(false); }
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

  if (isLive === null || isCohost === null) return <div className="p-6">Checking livestreams…</div>;
  if (!isLive && !isCohost) return <div className="p-6 text-white/80">No livestreams right now, check back later.</div>;
  return (
    <div className="p-3 flex-1 flex min-h-0 overflow-hidden">
      <div className="w-full h-full min-h-0">
        <LivestreamPanel />
      </div>
    </div>
  );
}
*/


