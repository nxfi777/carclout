'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Role = 'admin' | 'staff' | 'user';

type LearnItem = {
  id?: string;
  kind: 'tutorial' | 'ebook' | 'recording';
  slug: string;
  title?: string;
  description?: string;
  thumbKey?: string;
  fileKey?: string;
  minRole?: Role;
  isPublic?: boolean;
};

export default function LearnPage() {
  const [items, setItems] = useState<LearnItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/learn/items', { cache: 'no-store' }).then(r=>r.json());
        if (!cancelled) setItems(Array.isArray(res?.items) ? res.items : []);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const tutorials = useMemo(() => items.filter(i => i.kind === 'tutorial'), [items]);
  const ebooks = useMemo(() => items.filter(i => i.kind === 'ebook'), [items]);
  const recordings = useMemo(() => items.filter(i => i.kind === 'recording'), [items]);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Learn</h1>
      <Tabs defaultValue="tutorials">
        <TabsList>
          <TabsTrigger value="tutorials">Tutorials</TabsTrigger>
          <TabsTrigger value="ebooks">E‑books</TabsTrigger>
          <TabsTrigger value="recordings">Livestreams</TabsTrigger>
        </TabsList>

        <TabsContent value="tutorials">
          {loading ? <div>Loading…</div> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tutorials.map((it) => (
                <LearnCard key={`tut-${it.slug}`} it={it} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ebooks">
          {loading ? <div>Loading…</div> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ebooks.map((it) => (
                <LearnCard key={`ebook-${it.slug}`} it={it} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recordings">
          {loading ? <div>Loading…</div> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recordings.map((it) => (
                <LearnCard key={`rec-${it.slug}`} it={it} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

function LearnCard({ it }: { it: LearnItem }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const k = it.thumbKey || (it.kind === 'ebook' ? `admin/learn/ebooks/${it.slug}/cover.jpg` : it.kind === 'tutorial' ? `admin/learn/tutorials/${it.slug}/thumb.jpg` : it.thumbKey);
      if (!k) return;
      try {
        const fileUrl = `/api/learn/file?key=${encodeURIComponent(k)}`;
        if (!cancelled) setThumbUrl(fileUrl);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [it.thumbKey, it.slug, it.kind]);

  function openFile() {
    const key = it.fileKey || (it.kind === 'ebook' ? `admin/learn/ebooks/${it.slug}/file.pdf` : it.kind === 'tutorial' ? `admin/learn/tutorials/${it.slug}/video.mp4` : it.fileKey);
    if (!key) return;
    const url = `/api/learn/file?key=${encodeURIComponent(key)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="w-full aspect-video bg-black/20 grid place-items-center overflow-hidden">
          {thumbUrl ? <img src={thumbUrl} alt={it.slug} className="w-full h-full object-cover" /> : <div className="text-xs text-white/60">No thumbnail</div>}
        </div>
      </CardContent>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{it.title || it.slug}</span>
          <Button size="sm" onClick={openFile}>Open</Button>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}


