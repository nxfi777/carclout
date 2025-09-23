"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getViewUrl } from "@/lib/view-url-client";
import DateTimeSelect from "@/components/ui/datetime-select";
import { DropZone } from "@/components/ui/drop-zone";
import { toast } from "sonner";

interface Status { connected: boolean; hasFacebook?: boolean; linked?: { id: string; username: string } | null }
interface InsightPoint { value: number; end_time?: string }
interface Insight { name: string; period?: string; values?: InsightPoint[] }
interface FbPage { id: string; name: string }

export default function InstagramSection() {
  const [status, setStatus] = useState<Status>({ connected: false });
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<Insight[]>([]);
  const [recentMedia, setRecentMedia] = useState<Array<{ id?: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string }>>([]);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  async function refreshStatus() {
    const res = await fetch("/api/instagram/status", { cache: "no-cache" });
    const json = await res.json();
    setStatus(json);
  }
  useEffect(()=>{ refreshStatus(); }, []);

  async function presignAndUpload(file: File): Promise<string> {
    const isVideo = (file.type || "").startsWith("video/");
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
    const path = isVideo ? 'instagram/videos' : 'instagram/images';
    const ps = await fetch('/api/storage/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: `${Date.now()}.${ext}`, contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'), path }),
    }).then(r=>r.json());
    if (!ps?.url || !ps?.key) throw new Error('presign_failed');
    const up = await fetch(ps.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    if (!up.ok) throw new Error('upload_failed');
    const url = await getViewUrl(ps.key);
    if (!url) throw new Error('view_failed');
    return url as string;
  }
  async function handleDropMedia(files: File[]) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const file = files[0];
      const url = await presignAndUpload(file);
      if ((file.type || '').startsWith('video/')) setVideoUrl(url); else setImageUrl(url);
      toast.success('Uploaded');
    } catch (e) { toast.error((e as Error)?.message || 'Upload failed'); } finally { setUploading(false); }
  }

  async function schedulePost() {
    setLoading(true);
    try {
      const scheduledPublishTime = when ? Math.floor(when.getTime() / 1000) : undefined;
      const res = await fetch("/api/instagram/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: imageUrl || undefined, videoUrl: videoUrl || undefined, caption, scheduledPublishTime }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "publish_failed");
      toast.success("Scheduled to Instagram");
      setImageUrl(""); setVideoUrl(""); setCaption(""); setWhen(null);
    } catch (e) { toast.error((e as Error).message || "Failed to schedule"); } finally { setLoading(false); }
  }

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram/analytics?metric=impressions,reach,profile_views,followers_count,website_clicks&period=day");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "analytics_failed");
      setAnalytics((json.data || []) as Insight[]);
      setRecentMedia(Array.isArray(json.media) ? json.media : []);
    } catch (e) { toast.error((e as Error).message || "Failed to load analytics"); } finally { setLoading(false); }
  }

  async function fetchPages() {
    try { const j = await fetch("/api/instagram/pages", { cache: "no-cache" }).then(r=>r.json()); setPages(Array.isArray(j.pages) ? j.pages as FbPage[] : []); if (j.pages?.length && !selectedPageId) setSelectedPageId(String(j.pages[0].id)); } catch { setPages([]); }
  }
  async function linkSelectedPage() {
    if (!selectedPageId) return;
    setLoading(true);
    try { const res = await fetch("/api/instagram/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: selectedPageId }) }); const json = await res.json(); if (!res.ok) throw new Error(json.error || "link_failed"); toast.success("Instagram linked"); await refreshStatus(); } catch (e) { toast.error((e as Error).message || "Failed to link"); } finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instagram</CardTitle>
      </CardHeader>
      <CardContent className="space-y-[1rem]">
        {status.connected ? (
          <div className="text-[0.95rem]">Connected as <b>{status.linked?.username}</b></div>
        ) : (
          <div className="space-y-[0.8rem]">
            <div className="text-[0.95rem]">Connect your Instagram Business account.</div>
            <div className="text-[0.85rem] opacity-80">Required permissions: instagram_basic, instagram_manage_insights, instagram_content_publish, pages_show_list, pages_read_engagement.</div>
            <div className="flex flex-wrap gap-[0.6rem] items-center">
              {!status.hasFacebook ? (
                <Button onClick={() => { window.location.href = "/api/instagram/connect"; }}>Connect Instagram</Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={fetchPages}>Load Pages</Button>
                  <div className="min-w-[16rem]">
                    <Select value={selectedPageId} onValueChange={setSelectedPageId}>
                      <SelectTrigger><SelectValue placeholder="Select Page" /></SelectTrigger>
                      <SelectContent>
                        {pages.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={linkSelectedPage} disabled={!selectedPageId || loading}>Link Instagram</Button>
                </>
              )}
            </div>
          </div>
        )}
        <Separator />
        <div className="grid md:grid-cols-1 gap-[1.2rem] items-start">
          <div className="space-y-[0.8rem]">
            <DropZone onDrop={handleDropMedia} accept="image/*,video/*" className="p-[0.9rem]">
              <div className="text-[0.85rem] opacity-90">Drop image/video here or click to select</div>
              {uploading ? <div className="text-[0.8rem] opacity-80 mt-[0.3rem]">Uploading...</div> : null}
            </DropZone>
            <Input placeholder="Image URL (or leave empty for video)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            <Input placeholder="Video URL (optional)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
            <Textarea placeholder="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} />
            <DateTimeSelect value={when} onChange={setWhen} />
            <div className="flex gap-[0.6rem]">
              <Button onClick={schedulePost} disabled={loading || uploading || !status.connected}>{loading ? "Working..." : "Schedule"}</Button>
              <Button variant="secondary" onClick={loadAnalytics} disabled={loading || uploading || !status.connected}>Load Analytics</Button>
            </div>
          </div>
        </div>
        {(analytics.length > 0 || recentMedia.length > 0) && (
          <div className="pt-[1rem]">
            {analytics.length > 0 ? (
              <>
                <div className="text-[0.95rem] font-semibold mb-[0.6rem]">Insights</div>
                <div className="grid sm:grid-cols-3 gap-[0.8rem]">
                  {analytics.map((m) => (
                    <Card key={m.name}>
                      <CardHeader>
                        <CardTitle className="text-[0.95rem]">{m.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-[1.2rem] font-bold">{m.values?.[m.values.length - 1]?.value ?? 0}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : null}
            {recentMedia.length > 0 ? (
              <div className="mt-[1rem]">
                <div className="text-[0.95rem] font-semibold mb-[0.6rem]">Recent media</div>
                <div className="grid grid-cols-3 gap-[0.4rem]">
                  {recentMedia.map((m) => (
                    <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded border border-[color:var(--border)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={(m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : m.media_url)} alt={m.caption || 'media'} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


