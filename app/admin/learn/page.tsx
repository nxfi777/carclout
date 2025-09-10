'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropZone } from '@/components/ui/drop-zone';

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

export default function AdminLearnPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'tutorials' | 'ebooks' | 'recordings'>('tutorials');
  const [items, setItems] = useState<LearnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ kind: 'tutorial' | 'ebook'; slug: string; title?: string; description?: string; minRole?: Role; thumbKey?: string; fileKey?: string }>({ kind: 'tutorial', slug: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/learn/items', { cache: 'no-store' }).then(r=>r.json());
      setItems(Array.isArray(res?.items) ? res.items : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    try {
      const t = String(searchParams?.get('tab') || '').toLowerCase();
      if (t === 'tutorials' || t === 'ebooks' || t === 'recordings') setTab(t as any);
    } catch {}
  }, [searchParams]);

  const tutorials = useMemo(() => items.filter(i => i.kind === 'tutorial'), [items]);
  const ebooks = useMemo(() => items.filter(i => i.kind === 'ebook'), [items]);
  const recordings = useMemo(() => items.filter(i => i.kind === 'recording'), [items]);

  async function saveLearnItem() {
    if (!form.slug.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/learn/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) {
        const data = await res.json().catch(()=>({}));
        toast.error(data?.error || 'Save failed');
        return;
      }
      await refresh();
      setForm({ kind: 'tutorial', slug: '' });
    } finally {
      setSaving(false);
    }
  }

  function createSlug(name: string) {
    const base = (name || '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${base || 'item'}`;
  }

  async function extractFirstFrameFromFile(file: File): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      try {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = `${url}#t=0.001`;
        video.muted = true;
        video.preload = 'metadata';
        (video as any).playsInline = true;
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

  async function createHookBundleFiles(file: File): Promise<{ videoFile: File; thumbFile: File }> {
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
      const thumbName = 'thumb.jpg';
      await ffmpeg.exec(['-i', inputFile, '-frames:v', '1', '-q:v', '2', thumbName]);
      const outName = `video.mp4`;
      try { await ffmpeg.exec(['-i', inputFile, '-an', '-c:v', 'copy', outName]); } catch { await ffmpeg.exec(['-i', inputFile, '-an', '-vcodec', 'libx264', '-preset', 'veryfast', '-movflags', 'faststart', outName]); }
      const outVideo = await ffmpeg.readFile(outName);
      const outThumb = await ffmpeg.readFile(thumbName);
      const videoBlob = new Blob([outVideo as unknown as BlobPart], { type: 'video/mp4' });
      const thumbBlob = new Blob([outThumb as unknown as BlobPart], { type: 'image/jpeg' });
      const videoFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });
      const thumbFile = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' });
      return { videoFile, thumbFile };
    } catch (e) {
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
      const anyPdf: any = pdfjs as any;
      const GlobalWorkerOptions = anyPdf.GlobalWorkerOptions;
      if (GlobalWorkerOptions && !GlobalWorkerOptions.workerSrc) {
        try { GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs'; } catch {}
      }
      const getDocument = anyPdf.getDocument;
      const loadingTask = getDocument({ data });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no ctx');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      const blobOut: Blob | null = await new Promise((resolve) => canvas.toBlob((b)=>resolve(b), 'image/jpeg', 0.9));
      if (!blobOut) throw new Error('no cover');
      return new File([blobOut], 'cover.jpg', { type: 'image/jpeg' });
    } catch (e) {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.fillStyle = '#111'; ctx.fillRect(0,0,canvas.width,canvas.height); }
      const b: Blob | null = await new Promise((resolve) => canvas.toBlob((bb)=>resolve(bb), 'image/jpeg', 0.85));
      if (!b) throw e;
      return new File([b], 'cover.jpg', { type: 'image/jpeg' });
    }
  }

  async function uploadAdminFile(path: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('path', path);
    formData.append('scope', 'admin');
    const res = await fetch('/api/storage/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('upload failed');
    const data = await res.json().catch(()=>({}));
    const key = String(data?.key || '');
    if (!key) throw new Error('missing key');
    return key;
  }

  async function handleDropTutorial(files: File[]) {
    const first = files.find(f => (f.type||'').startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name));
    if (!first) return;
    if (!form.slug.trim()) { alert('Set a slug first'); return; }
    setUploading(true);
    try {
      const slug = form.slug.trim().toLowerCase() || createSlug(first.name);
      const bundlePath = `learn/tutorials/${slug}`;
      const { videoFile, thumbFile } = await createHookBundleFiles(first);
      const coverKey = await uploadAdminFile(bundlePath, thumbFile);
      const videoKey = await uploadAdminFile(bundlePath, videoFile);
      setForm(f => ({ ...f, kind: 'tutorial', slug, thumbKey: coverKey, fileKey: videoKey }));
      // Auto-save metadata
      await saveLearnItem();
    } catch (e) {
      alert((e as Error)?.message || 'Upload failed');
    } finally { setUploading(false); }
  }

  async function handleDropEbook(files: File[]) {
    const first = files.find(f => (f.type||'').startsWith('application/pdf') || /\.pdf$/i.test(f.name));
    if (!first) return;
    if (!form.slug.trim()) { alert('Set a slug first'); return; }
    setUploading(true);
    try {
      const slug = form.slug.trim().toLowerCase() || createSlug(first.name);
      const basePath = `learn/ebooks/${slug}`;
      let coverFile: File | null = null;
      try { coverFile = await createPdfCoverImageFile(first); } catch {}
      if (coverFile) await uploadAdminFile(basePath, coverFile);
      const pdfKey = await uploadAdminFile(basePath, new File([await first.arrayBuffer()], 'file.pdf', { type: 'application/pdf' }));
      const coverKey = `${'admin'}/${basePath}/cover.jpg`.replace(/^admin\//,'admin/');
      setForm(f => ({ ...f, kind: 'ebook', slug, thumbKey: coverKey, fileKey: pdfKey }));
      await saveLearnItem();
    } catch (e) {
      alert((e as Error)?.message || 'Upload failed');
    } finally { setUploading(false); }
  }

  async function toggleRecording(rec: LearnItem, next: Partial<Pick<LearnItem, 'isPublic' | 'minRole'>>) {
    try {
      const res = await fetch(`/api/livestream/recordings/${encodeURIComponent(rec.slug)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error('update failed');
      await refresh();
    } catch { toast.error('Failed to update'); }
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Learn</h1>
      <Tabs value={tab} onValueChange={(v)=>{ setTab(v as any); try { const sp = new URLSearchParams(searchParams?.toString() || ''); sp.set('tab', v); router.replace(`/admin/learn?${sp.toString()}`); } catch {} }}>
        <TabsList>
          <TabsTrigger value="tutorials">Tutorials</TabsTrigger>
          <TabsTrigger value="ebooks">E‑books</TabsTrigger>
          <TabsTrigger value="recordings">Livestreams</TabsTrigger>
        </TabsList>

        <TabsContent value="tutorials" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Add Tutorial</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-sm">Slug</label>
                <Input value={form.slug} onChange={(e)=>setForm(f=>({ ...f, slug: e.target.value }))} placeholder="my-tutorial" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Title</label>
                <Input value={form.title || ''} onChange={(e)=>setForm(f=>({ ...f, title: e.target.value }))} placeholder="Title" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Description</label>
                <Input value={form.description || ''} onChange={(e)=>setForm(f=>({ ...f, description: e.target.value }))} placeholder="Short description" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Min Role</label>
                <Select value={form.minRole || 'user'} onValueChange={(v)=>setForm(f=>({ ...f, minRole: v as Role }))}>
                  <SelectTrigger><SelectValue placeholder="user" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Thumb Key</label>
                <Input value={form.thumbKey || ''} onChange={(e)=>setForm(f=>({ ...f, thumbKey: e.target.value }))} placeholder="admin/learn/tutorials/<slug>/thumb.jpg" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Video Key</label>
                <Input value={form.fileKey || ''} onChange={(e)=>setForm(f=>({ ...f, fileKey: e.target.value }))} placeholder="admin/learn/tutorials/<slug>/video.mp4" />
              </div>
              <div className="md:col-span-2">
                <Button disabled={saving} onClick={saveLearnItem}>Save</Button>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-white/60 mb-2">Or drag and drop a video to auto-generate thumbnail + video bundle</div>
                <DropZone onDrop={handleDropTutorial} className="h-28 rounded-md border border-dashed" />
                {uploading ? <div className="text-xs mt-2 text-white/70">Uploading…</div> : null}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? <div>Loading…</div> : tutorials.length === 0 ? <div className="col-span-full">No tutorials yet</div> : null}
            {(loading ? [] : tutorials).map((it) => (
              <Card key={`${it.kind}-${it.slug}`}>
                <CardContent className="p-0">
                  <LearnThumb it={it} />
                </CardContent>
                <CardHeader>
                  <CardTitle className="text-base">{it.title || it.slug}<span className="ml-2 text-xs text-white/50">[{it.minRole || 'user'}]</span></CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ebooks" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Add E‑book</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-sm">Slug</label>
                <Input value={form.slug} onChange={(e)=>setForm(f=>({ ...f, slug: e.target.value }))} placeholder="my-ebook" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Title</label>
                <Input value={form.title || ''} onChange={(e)=>setForm(f=>({ ...f, title: e.target.value }))} placeholder="Title" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Description</label>
                <Input value={form.description || ''} onChange={(e)=>setForm(f=>({ ...f, description: e.target.value }))} placeholder="Short description" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Min Role</label>
                <Select value={form.minRole || 'user'} onValueChange={(v)=>setForm(f=>({ ...f, minRole: v as Role }))}>
                  <SelectTrigger><SelectValue placeholder="user" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Cover Key</label>
                <Input value={form.thumbKey || ''} onChange={(e)=>setForm(f=>({ ...f, thumbKey: e.target.value }))} placeholder="admin/learn/ebooks/<slug>/cover.jpg" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">PDF Key</label>
                <Input value={form.fileKey || ''} onChange={(e)=>setForm(f=>({ ...f, fileKey: e.target.value }))} placeholder="admin/learn/ebooks/<slug>/file.pdf" />
              </div>
              <div className="md:col-span-2">
                <Button disabled={saving} onClick={saveLearnItem}>Save</Button>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-white/60 mb-2">Or drag and drop a PDF to auto-generate a cover image</div>
                <DropZone onDrop={handleDropEbook} className="h-28 rounded-md border border-dashed" />
                {uploading ? <div className="text-xs mt-2 text-white/70">Uploading…</div> : null}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? <div>Loading…</div> : ebooks.length === 0 ? <div className="col-span-full">No e‑books yet</div> : null}
            {(loading ? [] : ebooks).map((it) => (
              <Card key={`${it.kind}-${it.slug}`}>
                <CardContent className="p-0">
                  <LearnThumb it={it} />
                </CardContent>
                <CardHeader>
                  <CardTitle className="text-base">{it.title || it.slug}<span className="ml-2 text-xs text-white/50">[{it.minRole || 'user'}]</span></CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recordings" className="space-y-4">
          {loading ? <div>Loading…</div> : recordings.length === 0 ? <div>No livestreams yet</div> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recordings.map((r) => (
                <Card key={`rec-${r.slug}`}>
                  <CardContent className="p-0">
                    <LearnThumb it={r} />
                  </CardContent>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{r.title || r.slug}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <label className="text-xs">Public</label>
                      <Button variant={r.isPublic ? 'default' : 'outline'} size="sm" onClick={()=>toggleRecording(r, { isPublic: !r.isPublic })}>{r.isPublic ? 'Yes' : 'No'}</Button>
                      <Select value={r.minRole || 'user'} onValueChange={(v)=>toggleRecording(r, { minRole: v as Role })}>
                        <SelectTrigger className="w-28"><SelectValue placeholder="Role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

function LearnThumb({ it }: { it: LearnItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const k = it.thumbKey || (it.kind === 'ebook' ? `admin/learn/ebooks/${it.slug}/cover.jpg` : it.kind === 'tutorial' ? `admin/learn/tutorials/${it.slug}/thumb.jpg` : it.thumbKey);
      if (!k) return;
      try {
        const fileUrl = `/api/learn/file?key=${encodeURIComponent(k)}`;
        if (!cancelled) setUrl(fileUrl);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [it.thumbKey, it.slug, it.kind]);
  return (
    <div className="w-full aspect-video bg-black/20 grid place-items-center overflow-hidden">
      {url ? <img src={url} alt={it.slug} className="w-full h-full object-cover" /> : <div className="text-xs text-white/60">No thumbnail</div>}
    </div>
  );
}


