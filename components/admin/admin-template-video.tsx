"use client";
import { useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type AdminVideoConfig = {
  enabled?: boolean;
  provider?: 'seedance' | 'kling2_5';
  prompt?: string;
  duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
  resolution?: '480p'|'720p'|'1080p';
  aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
  camera_fixed?: boolean;
  seed?: number | null;
  fps?: number; // ignored for Kling
  cfg_scale?: number; // Kling only (0..1)
  previewKey?: string | null;
};

export function AdminTemplateVideo({ value, onChange }: { value?: AdminVideoConfig; onChange: (v: AdminVideoConfig)=> void }){
  const v = value || {};

  // Enforce provider-specific constraints (e.g., Kling supports only 5s or 10s)
  useEffect(()=>{
    try {
      if (!v?.enabled) return;
      if ((v.provider||'seedance') === 'kling2_5') {
        const cur = String(v.duration || '5');
        if (cur !== '5' && cur !== '10') {
          onChange({ ...(v||{}), duration: '5' });
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.provider, v?.enabled]);

  const allowedDurations = (v.provider === 'kling2_5') ? (['5','10'] as const) : (['3','4','5','6','7','8','9','10','11','12'] as const);

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
            <Select value={(v.provider||'seedance')} onValueChange={(val)=>{
              const nextProvider = (val as AdminVideoConfig['provider']);
              // If switching to Kling, ensure duration is valid (5 or 10)
              if (nextProvider === 'kling2_5') {
                const cur = String(v.duration || '5');
                const fixed = (cur === '5' || cur === '10') ? cur : '5';
                onChange({ ...(v||{}), provider: nextProvider, duration: fixed as AdminVideoConfig['duration'] });
              } else {
                onChange({ ...(v||{}), provider: nextProvider });
              }
            }}>
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
                {allowedDurations.map((d)=> (<SelectItem key={d} value={d}>{d}s</SelectItem>))}
              </SelectContent>
            </Select>
            {v.provider === 'kling2_5' ? (
              <div className="mt-1 text-[0.8rem] text-white/60">Kling supports only 5s or 10s.</div>
            ) : null}
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
          {v.provider !== 'kling2_5' ? (
            <div className="flex items-center gap-2">
              <div className="text-xs text-white/70">Camera fixed</div>
              <Switch checked={!!v.camera_fixed} onCheckedChange={(on)=> onChange({ ...(v||{}), camera_fixed: !!on })} />
            </div>
          ) : null}
          {v.provider === 'kling2_5' ? (
            <div>
              <div className="text-xs text-white/70 mb-1">CFG scale (0–1)</div>
              <Input type="number" min={0} max={1} step={0.05} value={String(typeof v.cfg_scale === 'number' ? v.cfg_scale : 0.5)} onChange={(e)=>{
                const n = Number(e.currentTarget.value);
                const clamped = Math.min(1, Math.max(0, isNaN(n) ? 0.5 : n));
                onChange({ ...(v||{}), cfg_scale: clamped });
              }} className="w-24 h-9" />
            </div>
          ) : (
            <div>
              <div className="text-xs text-white/70 mb-1">FPS (for cost estimate)</div>
              <Input type="number" value={String(v.fps || 24)} onChange={(e)=>{ const n = Math.max(1, Math.round(Number(e.currentTarget.value||24))); onChange({ ...(v||{}), fps: n }); }} className="w-24 h-9" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}


