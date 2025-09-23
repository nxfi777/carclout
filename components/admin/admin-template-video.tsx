"use client";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type AdminVideoConfig = {
  enabled?: boolean;
  provider?: 'seedance' | 'kling2_5';
  prompt?: string;
  duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
  resolution?: '480p'|'720p'|'1080p';
  aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
  camera_fixed?: boolean;
  seed?: number | null;
  fps?: number;
  previewKey?: string | null;
};

export function AdminTemplateVideo({ value, onChange }: { value?: AdminVideoConfig; onChange: (v: AdminVideoConfig)=> void }){
  const v = value || {};
  const [uploading, setUploading] = useState(false);
  return (
    <div className="rounded border border-[color:var(--border)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Video (image-to-video)</div>
        <Switch checked={!!v.enabled} onCheckedChange={(on)=> onChange({ ...(v||{}), enabled: !!on, provider: (v.provider as AdminVideoConfig['provider']) || 'seedance' })} />
      </div>
      {v.enabled ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div>
            <div className="text-xs text-white/70 mb-1">Provider</div>
            <Select value={(v.provider||'seedance')} onValueChange={(val)=> onChange({ ...(v||{}), provider: (val as AdminVideoConfig['provider']) })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seedance">Seedance</SelectItem>
                <SelectItem value="kling2_5">Kling 2.5 Turbo Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-white/70 mb-1">Video prompt</div>
            <Textarea value={String(v.prompt||'')} onChange={(e)=> onChange({ ...(v||{}), prompt: e.currentTarget.value })} placeholder="Describe the motion/style, e.g. Smooth camera move around the car with neon reflections" rows={3} />
          </div>
          <div>
            <div className="text-xs text-white/70 mb-1">Duration (seconds)</div>
            <Select value={String(v.duration||'5')} onValueChange={(val)=> onChange({ ...(v||{}), duration: (val as AdminVideoConfig['duration']) })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Duration" /></SelectTrigger>
              <SelectContent>
                {['3','4','5','6','7','8','9','10','11','12'].map((d)=> (<SelectItem key={d} value={d}>{d}s</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-white/70 mb-1">Resolution</div>
            <Select value={(v.resolution||'1080p')} onValueChange={(val)=> onChange({ ...(v||{}), resolution: (val as AdminVideoConfig['resolution']) })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Resolution" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="480p">480p</SelectItem>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-white/70 mb-1">Aspect ratio</div>
            <Select value={(v.aspect_ratio||'auto')} onValueChange={(val)=> onChange({ ...(v||{}), aspect_ratio: (val as AdminVideoConfig['aspect_ratio']) })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Aspect" /></SelectTrigger>
              <SelectContent>
                {['auto','21:9','16:9','4:3','1:1','3:4','9:16'].map((ar)=>(<SelectItem key={ar} value={ar}>{ar}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-white/70">Camera fixed</div>
            <Switch checked={!!v.camera_fixed} onCheckedChange={(on)=> onChange({ ...(v||{}), camera_fixed: !!on })} />
          </div>
          <div>
            <div className="text-xs text-white/70 mb-1">Preview video (hover on template card)</div>
            <div className="flex items-center gap-2">
              <Input type="file" accept="video/*" disabled={uploading} onChange={async(e)=>{
                const file = e.currentTarget.files?.[0]; if (!file) return; setUploading(true);
                try {
                  const form = new FormData(); form.append('file', file); form.append('path','templates/previews'); form.append('scope','admin');
                  const up = await fetch('/api/storage/upload', { method:'POST', body: form }); const dj = await up.json().catch(()=>({}));
                  const rel = typeof dj?.key === 'string' ? String(dj.key).replace(/^admin\//,'') : '';
                  if (rel) { onChange({ ...(v||{}), previewKey: rel }); try { toast.success('Preview uploaded'); } catch {} }
                } finally { setUploading(false); }
              }} />
              {v.previewKey ? (
                <Button variant="outline" size="sm" onClick={async()=>{
                  try {
                    const full = (v.previewKey||'').startsWith('admin/') ? String(v.previewKey) : `admin/${v.previewKey}`;
                    const url = `/api/storage/file?key=${encodeURIComponent(full)}&scope=admin`;
                    window.open(url, '_blank');
                  } catch {}
                }}>View</Button>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-xs text-white/70 mb-1">FPS (for cost estimate)</div>
            <Input type="number" value={String(v.fps || 24)} onChange={(e)=>{ const n = Math.max(1, Math.round(Number(e.currentTarget.value||24))); onChange({ ...(v||{}), fps: n }); }} className="w-24 h-9" />
          </div>
        </div>
      ) : null}
    </div>
  );
}


