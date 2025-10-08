"use client";
import { useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type AdminVideoConfig = {
  enabled?: boolean;
  provider?: 'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro';
  prompt?: string;
  duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
  resolution?: 'auto'|'480p'|'720p'|'1080p';
  aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
  camera_fixed?: boolean;
  seed?: number | null;
  fps?: number; // ignored for Kling and Sora 2
  cfg_scale?: number; // Kling only (0..1)
  previewKey?: string | null;
  allowedDurations?: Array<'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'>; // User-selectable durations
};

export function AdminTemplateVideo({ value, onChange }: { value?: AdminVideoConfig; onChange: (v: AdminVideoConfig)=> void }){
  const v = value || {};


  const adminDurations = ((): readonly string[] => {
    const provider = v.provider || 'sora2';
    if (provider === 'kling2_5') return ['5','10'] as const;
    if (provider === 'sora2' || provider === 'sora2_pro') return ['4','8','12'] as const;
    return ['3','4','5','6','7','8','9','10','11','12'] as const;
  })();
  const providerResolutions: Record<'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro', Array<'auto'|'480p'|'720p'|'1080p'>> = {
    seedance: ['480p','720p','1080p'],
    kling2_5: ['720p','1080p'],
    sora2: ['720p','auto'],
    sora2_pro: ['720p','auto'],
  };
  const resolutionOptions = providerResolutions[v.provider || 'sora2'];
  const resolutionKey = resolutionOptions.join('|');
  const providerAspectRatios: Record<'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro', Array<'21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto'>> = {
    seedance: ['auto','21:9','16:9','4:3','1:1','3:4','9:16'],
    kling2_5: ['auto','16:9','1:1','9:16'],
    sora2: ['auto','16:9','9:16'],
    sora2_pro: ['auto','16:9','9:16'],
  };
  const aspectOptions = providerAspectRatios[v.provider || 'sora2'];
  const aspectKey = aspectOptions.join('|');
  const providerLabels: Record<'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro', string> = {
    seedance: 'Seedance',
    kling2_5: 'Kling 2.5',
    sora2: 'Sora 2',
    sora2_pro: 'Sora 2 Pro',
  };
  const providerLabel = providerLabels[v.provider || 'sora2'];

  useEffect(() => {
    if (!v?.enabled) return;
    const current = String(v?.resolution || (v.provider === 'sora2' || v.provider === 'sora2_pro' ? '720p' : '1080p')) as AdminVideoConfig['resolution'];
    if (current && !resolutionOptions.includes(current)) {
      onChange({ ...(v||{}), resolution: resolutionOptions[0] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.provider, v?.enabled, resolutionKey]);

  useEffect(() => {
    if (!v?.enabled) return;
    const current = String(v?.aspect_ratio || 'auto') as AdminVideoConfig['aspect_ratio'];
    if (current && !aspectOptions.includes(current)) {
      onChange({ ...(v||{}), aspect_ratio: aspectOptions[0] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.provider, v?.enabled, aspectKey]);

  return (
    <div className="rounded border border-[color:var(--border)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Video (image-to-video)</div>
        <Switch checked={!!v.enabled} onCheckedChange={(on)=> onChange({ ...(v||{}), enabled: !!on, provider: (v.provider as AdminVideoConfig['provider']) || 'sora2' })} />
      </div>
      {v.enabled ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div>
            <div className="text-xs text-white/70 mb-1">Provider</div>
            <Select value={(v.provider||'sora2')} onValueChange={(val)=>{
              const nextProvider = (val as AdminVideoConfig['provider']) || 'sora2';
              onChange({ ...(v||{}), provider: nextProvider, resolution: providerResolutions[nextProvider][0] });
            }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sora2">Sora 2 (Default)</SelectItem>
                <SelectItem value="sora2_pro">Sora 2 Pro</SelectItem>
                <SelectItem value="seedance">Seedance</SelectItem>
                <SelectItem value="kling2_5">Kling 2.5 Turbo Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-white/70 mb-1">Video prompt</div>
            <Textarea value={String(v.prompt||'')} onChange={(e)=> onChange({ ...(v||{}), prompt: e.currentTarget.value })} placeholder="Describe the motion/style, e.g. Smooth camera move around the car with neon reflections" rows={3} />
            <div className="mt-1 text-[0.8rem] text-white/60">You can use custom tokens like [CUSTOM_MOTION] to let users customize the prompt. These will appear as input fields in the user interface.</div>
          </div>
          <div>
            <div className="text-xs text-white/70 mb-1">Resolution</div>
            <Select value={(v.resolution || resolutionOptions[0])} onValueChange={(val)=> onChange({ ...(v||{}), resolution: (val as AdminVideoConfig['resolution']) })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Resolution" /></SelectTrigger>
              <SelectContent>
                {resolutionOptions.map((r)=> (
                  <SelectItem key={r} value={r}>{r === 'auto' ? 'Auto' : r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-white/70 mb-1">Aspect ratio</div>
            <Select value={(v.aspect_ratio || aspectOptions[0])} onValueChange={(val)=> onChange({ ...(v||{}), aspect_ratio: (val as AdminVideoConfig['aspect_ratio']) })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Aspect" /></SelectTrigger>
              <SelectContent>
                {aspectOptions.map((ar)=>(<SelectItem key={ar} value={ar}>{ar}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {v.provider !== 'kling2_5' && v.provider !== 'sora2' && v.provider !== 'sora2_pro' ? (
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
          ) : v.provider !== 'sora2' && v.provider !== 'sora2_pro' ? (
            <div>
              <div className="text-xs text-white/70 mb-1">FPS (for cost estimate)</div>
              <Input type="number" value={String(v.fps || 24)} onChange={(e)=>{ const n = Math.max(1, Math.round(Number(e.currentTarget.value||24))); onChange({ ...(v||{}), fps: n }); }} className="w-24 h-9" />
            </div>
          ) : null}
          <div className="sm:col-span-3">
            <div className="text-xs text-white/70 mb-2">User-Selectable Durations (which options users can choose)</div>
            <div className="flex flex-wrap gap-2">
              {adminDurations.map((dur) => {
                const durTyped = dur as AdminVideoConfig['duration'];
                if (!durTyped) return null;
                const allowed = Array.isArray(v.allowedDurations) ? v.allowedDurations : (adminDurations as readonly (AdminVideoConfig['duration'])[]);
                const isChecked = (allowed as readonly string[]).includes(durTyped as string);
                return (
                  <label key={dur} className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      onChange={(e) => {
                        const current = Array.isArray(v.allowedDurations) ? v.allowedDurations : (adminDurations as AdminVideoConfig['duration'][]);
                        const next = e.target.checked 
                          ? [...current.filter(d => d !== durTyped), durTyped]
                          : current.filter(d => d !== durTyped);
                        // Ensure at least one duration is selected
                        onChange({ ...(v||{}), allowedDurations: next.length > 0 ? next as AdminVideoConfig['allowedDurations'] : [durTyped] });
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{dur}s</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-1 text-[0.8rem] text-white/60">Users will see these durations as options. If none are selected, all {providerLabel} defaults remain available.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


