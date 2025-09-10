"use client";
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl';
import { useEffect, useRef, useState } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

type GL = Renderer['gl'];

function lerp(p1: number, p2: number, t: number): number { return p1 + (p2 - p1) * t; }

function autoBind<T extends object>(instance: T): void {
  const proto = Object.getPrototypeOf(instance);
  Object.getOwnPropertyNames(proto).forEach((key) => {
    const fn = (instance as Record<string, unknown>)[key];
    if (key !== 'constructor' && typeof fn === 'function') {
      (instance as Record<string, unknown>)[key] = (fn as (...args: unknown[]) => unknown).bind(instance);
    }
  });
}

function createTextTexture(gl: GL, text: string, font: string = 'bold 20px sans-serif', color: string = '#fff') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no ctx');
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const fontSize = parseInt((font.match(/(\d+)px/)?.[1] || '20'), 10);
  const textHeight = Math.ceil(fontSize * 1.2);
  canvas.width = textWidth + 20;
  canvas.height = textHeight + 20;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillText(text, cx, cy);
  const texture = new Texture(gl, { generateMipmaps: false });
  texture.image = canvas;
  return { texture, width: canvas.width, height: canvas.height };
}

interface Item { image: string; text: string; videoUrl?: string }

class Title {
  mesh!: Mesh;
  constructor(public gl: GL, public plane: Mesh, public text: string) {
    autoBind(this);
    const { texture, width, height } = createTextTexture(gl, text, 'bold 24px sans-serif', '#ddd');
    const geometry = new Plane(gl);
    const program = new Program(gl, {
      vertex: `
        attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
        uniform mat4 modelViewMatrix, projectionMatrix;
        void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragment: `
        precision highp float; varying vec2 vUv; uniform sampler2D tMap;
        void main(){ vec4 c=texture2D(tMap, vUv); if(c.a<.1) discard; gl_FragColor=c; }
      `,
      uniforms: { tMap: { value: texture } },
      transparent: true,
    });
    this.mesh = new Mesh(gl, { geometry, program });
    const aspect = width / height;
    const textH = this.plane.scale.y * 0.12;
    const textW = textH * aspect;
    this.mesh.scale.set(textW, textH, 1);
    this.mesh.position.y = -this.plane.scale.y * 0.5 - textH * 0.6 - 0.05;
    this.mesh.setParent(this.plane);
  }
}

class Media {
  program!: Program; plane!: Mesh; title!: Title; speed = 0; extra = 0; width!: number; widthTotal!: number; x!: number; padding = 2; imageAspect = 9/16; opacity = 1; opacityTarget = 1;
  isBefore=false; isAfter=false;
  constructor(public gl: GL, public geometry: Plane, public renderer: Renderer, public scene: Transform, public viewport: {width:number;height:number}, public screen:{width:number;height:number}, public image: string, public text: string, public index: number, public length: number, public bend: number, public showTitles: boolean) {
    this.createShader();
    this.createMesh();
    if (this.showTitles) this.createTitle();
    this.onResize();
  }
  createShader(){
    const texture = new Texture(this.gl, { generateMipmaps: true });
    const img = new Image(); img.crossOrigin='anonymous'; img.src=this.image; img.onload=()=>{ texture.image=img; this.imageAspect = (img.naturalWidth || 9) / (img.naturalHeight || 16); this.program.uniforms.uImageSizes.value=[img.naturalWidth, img.naturalHeight]; try{ this.onResize(); } catch {} };
    this.program = new Program(this.gl, {
      depthTest:false, depthWrite:false,
      vertex:`precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; uniform mat4 modelViewMatrix,projectionMatrix; uniform float uTime,uSpeed; void main(){ vUv=uv; vec3 p=position; p.z=(sin(p.x*4.0+uTime)*1.5+cos(p.y*2.0+uTime)*1.5)*(0.1+uSpeed*0.5); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);} `,
      fragment:`precision highp float; uniform vec2 uImageSizes,uPlaneSizes; uniform sampler2D tMap; uniform float uOpacity; varying vec2 vUv; void main(){ vec2 ratio=vec2(min((uPlaneSizes.x/uPlaneSizes.y)/(uImageSizes.x/uImageSizes.y),1.0), min((uPlaneSizes.y/uPlaneSizes.x)/(uImageSizes.y/uImageSizes.x),1.0)); vec2 uv=vec2(vUv.x*ratio.x+(1.0-ratio.x)*0.5, vUv.y*ratio.y+(1.0-ratio.y)*0.5); vec4 color=texture2D(tMap, uv); gl_FragColor=vec4(color.rgb, color.a * uOpacity); }`,
      uniforms:{ tMap:{value:texture}, uPlaneSizes:{value:[0,0]}, uImageSizes:{value:[0,0]}, uSpeed:{value:0}, uTime:{value:100*Math.random()}, uOpacity:{ value:1 } },
      transparent:true,
    });
  }
  createMesh(){ this.plane = new Mesh(this.gl, { geometry:this.geometry, program:this.program }); this.plane.setParent(this.scene); }
  createTitle(){ this.title = new Title(this.gl, this.plane, this.text); }
  update(scroll:{current:number;last:number}, direction:'right'|'left'){
    this.plane.position.x = this.x - scroll.current - this.extra;
    const x=this.plane.position.x, H=this.viewport.width/2; const B=Math.abs(this.bend); const R=(H*H+B*B)/(2*B);
    const effX=Math.min(Math.abs(x),H); const arc=R-Math.sqrt(R*R-effX*effX); if(this.bend>0){ this.plane.position.y=-arc; this.plane.rotation.z=-Math.sign(x)*Math.asin(effX/R);} else { this.plane.position.y=arc; this.plane.rotation.z=Math.sign(x)*Math.asin(effX/R);} 
    this.speed=scroll.current-scroll.last; this.program.uniforms.uTime.value+=0.04; this.program.uniforms.uSpeed.value=this.speed; const planeOffset=this.plane.scale.x/2; const viewportOffset=this.viewport.width/2; this.isBefore=this.plane.position.x+planeOffset<-viewportOffset; this.isAfter=this.plane.position.x-planeOffset>viewportOffset; if(direction==='right'&&this.isBefore){ this.extra-=this.widthTotal; this.isBefore=this.isAfter=false;} if(direction==='left'&&this.isAfter){ this.extra+=this.widthTotal; this.isBefore=this.isAfter=false;}
    // Smoothly ease opacity for nicer crossfade with overlay
    this.opacity = lerp(this.opacity, this.opacityTarget, 0.18);
    this.program.uniforms.uOpacity.value = this.opacity;
  }
  onResize({ screen, viewport }:{screen?:{width:number;height:number}; viewport?:{width:number;height:number}} = {}){
    if(screen) this.screen=screen; if(viewport){ this.viewport=viewport; }
    // Larger cards while preserving original media aspect ratio per item (constant width, variable height)
    const targetVisible = this.screen.width < 640 ? 1.8 : this.screen.width < 1024 ? 2.4 : 3.0; // show ~3 on desktop, fewer on smaller
    const baseWidth = (this.viewport.width / targetVisible) * 0.75; // slightly more spacing to reduce cropping
    this.plane.scale.x = baseWidth;
    // Portrait preservation: favor tall orientation; clamp aspect to a portrait-friendly range and compute height accordingly
    const aspect = Math.max(0.4, Math.min(0.75, (this.imageAspect || (9/16)))); // width/height, ~0.56 for 9:16
    this.plane.scale.y = this.plane.scale.x / aspect;
    this.program.uniforms.uPlaneSizes.value=[this.plane.scale.x,this.plane.scale.y];
    // spacing between cards scales with width
    this.padding = this.plane.scale.x * 0.24;
    this.width=this.plane.scale.x+this.padding; this.widthTotal=this.width*this.length; 
    // center the sequence around x=0 so the gallery is centered
    this.x=this.width*this.index - (this.width*(this.length-1))/2;
    // vertically center arc: base y at 0 so max bend stays centered
    if (this.bend > 0) { /* no-op, arc calc happens in update */ }
  }
}

class App {
  renderer!: Renderer; gl!: GL; camera!: Camera; scene!: Transform; planeGeometry!: Plane; medias: Media[]=[]; mediasImages: Item[]=[]; originalCount=0; screen!: {width:number;height:number}; viewport!: {width:number;height:number}; raf=0; scroll:{ ease:number; current:number; target:number; last:number; position?: number }={ ease:0.05, current:0, target:0, last:0 };
  boundResize!:()=>void; boundWheel!: (e: Event)=>void; boundDown!: (e: MouseEvent|TouchEvent)=>void; boundMove!: (e: MouseEvent|TouchEvent)=>void; boundUp!: ()=>void; isDown=false; start=0;
  constructor(public container: HTMLElement, items: Item[], public bend=1, public showTitles=false){ autoBind(this); this.createRenderer(); this.createCamera(); this.createScene(); this.onResize(); this.createGeometry(); this.createMedias(items); this.update(); this.addEvents(); }
  createRenderer(){ this.renderer = new Renderer({ alpha:true, antialias:true, dpr:Math.min(window.devicePixelRatio||1,2) }); this.gl=this.renderer.gl; this.gl.clearColor(0,0,0,0); this.container.appendChild(this.renderer.gl.canvas as HTMLCanvasElement); }
  createCamera(){ this.camera=new Camera(this.gl); this.camera.fov=45; this.camera.position.z=20; }
  createScene(){ this.scene=new Transform(); }
  createGeometry(){ this.planeGeometry=new Plane(this.gl,{ heightSegments:50, widthSegments:100 }); }
  createMedias(items: Item[]){ this.originalCount = items.length; this.mediasImages=items.concat(items); this.medias=this.mediasImages.map((d,i)=> new Media(this.gl,this.planeGeometry,this.renderer,this.scene,this.viewport,this.screen,d.image,d.text,i,this.mediasImages.length,this.bend,this.showTitles)); }
  onResize(){
    // Ensure the canvas fills the container
    const rect = this.container.getBoundingClientRect();
    this.screen={ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({ aspect:this.screen.width/this.screen.height });
    const fov=(this.camera.fov*Math.PI)/180; const h=2*Math.tan(fov/2)*this.camera.position.z; const w=h*this.camera.aspect; this.viewport={ width:w, height:h };
    if(this.medias) this.medias.forEach(m=>m.onResize({screen:this.screen, viewport:this.viewport}));
  }
  update(){ this.scroll.current=lerp(this.scroll.current,this.scroll.target,this.scroll.ease); const dir=this.scroll.current>this.scroll.last?'right':'left'; if(this.medias) this.medias.forEach(m=>m.update(this.scroll,dir)); this.renderer.render({ scene:this.scene, camera:this.camera }); this.scroll.last=this.scroll.current; this.raf=window.requestAnimationFrame(this.update); }
  addEvents(){ this.boundResize=this.onResize.bind(this); this.boundWheel=this.onWheel.bind(this); this.boundDown=this.onDown.bind(this); this.boundMove=this.onMove.bind(this); this.boundUp=this.onUp.bind(this); window.addEventListener('resize',this.boundResize); window.addEventListener('wheel',this.boundWheel); window.addEventListener('mousedown',this.boundDown); window.addEventListener('mousemove',this.boundMove); window.addEventListener('mouseup',this.boundUp); window.addEventListener('touchstart',this.boundDown); window.addEventListener('touchmove',this.boundMove); window.addEventListener('touchend',this.boundUp); }
  onWheel(e: Event){ const we=e as WheelEvent; const anyWe = we as unknown as { wheelDelta?: number; detail?: number }; const delta=(typeof we.deltaY==='number'?we.deltaY: (typeof anyWe.wheelDelta==='number'? anyWe.wheelDelta : (typeof anyWe.detail==='number'? anyWe.detail : 0))); this.scroll.target += (delta>0?2:-2)*0.2; }
  onDown(e: MouseEvent|TouchEvent){ this.isDown=true; this.scroll.position=this.scroll.current; const x = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX; this.start=x; }
  onMove(e: MouseEvent|TouchEvent){ if(!this.isDown) return; const x = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX; const dist=(this.start - x) * (2*0.025); this.scroll.target=(this.scroll.position??0)+dist; }
  onUp(){ this.isDown=false; this.onCheck(); }
  onCheck(){ if(!this.medias||!this.medias[0]) return; const width=this.medias[0].width; const idx=Math.round(Math.abs(this.scroll.target)/width); const item=width*idx; this.scroll.target=this.scroll.target<0? -item : item; }
  destroy(){ window.cancelAnimationFrame(this.raf); window.removeEventListener('resize',this.boundResize); window.removeEventListener('wheel',this.boundWheel); window.removeEventListener('mousedown',this.boundDown); window.removeEventListener('mousemove',this.boundMove); window.removeEventListener('mouseup',this.boundUp); window.removeEventListener('touchstart',this.boundDown); window.removeEventListener('touchmove',this.boundMove); window.removeEventListener('touchend',this.boundUp); if(this.renderer?.gl?.canvas?.parentNode){ this.renderer.gl.canvas.parentNode.removeChild(this.renderer.gl.canvas as HTMLCanvasElement);} }

  // Helpers for hover mapping
  findClosestIndexAtWorldX(xWorld: number): number {
    if (!this.medias.length) return 0;
    let best = 0; let bestDist = Infinity;
    for (let i=0;i<this.medias.length;i++){
      const m = this.medias[i];
      const d = Math.abs((m.plane?.position?.x || 0) - xWorld);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }
  getPlanePixelRect(index: number, containerWidth: number, containerHeight: number){
    const m = this.medias[index];
    if (!m) return null as null | { left:number; top:number; width:number; height:number; rotationDeg:number };
    const w = (m.plane.scale.x / this.viewport.width) * containerWidth;
    const h = (m.plane.scale.y / this.viewport.height) * containerHeight;
    const cx = (containerWidth/2) + (m.plane.position.x / this.viewport.width) * containerWidth;
    const cy = (containerHeight/2) - (m.plane.position.y / this.viewport.height) * containerHeight;
    const rotationDeg = (m.plane.rotation.z || 0) * (180 / Math.PI);
    return { left: cx - w/2, top: cy - h/2, width: w, height: h, rotationDeg };
  }

  setDimBaseIndex(baseIndex: number | null){
    if (!this.medias || !this.medias.length) return;
    const count = this.originalCount || Math.max(1, Math.floor(this.medias.length/2));
    for (let i=0;i<this.medias.length;i++){
      const base = i % count;
      const targetOpacity = baseIndex !== null && base === baseIndex ? 0.0 : 1.0;
      try { this.medias[i].opacityTarget = targetOpacity; } catch {}
    }
  }
}

export default function CircularGallery({ items, bend=3, showTitles=false }: { items: Item[]; bend?: number; showTitles?: boolean }){
  const ref = useRef<HTMLDivElement>(null);
  const appRef = useRef<App|null>(null);
  const videoRef = useRef<HTMLVideoElement|null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [overlayRect, setOverlayRect] = useState<{ left:number; top:number; width:number; height:number; rotationDeg:number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Instantiate OGL app
  useEffect(()=>{
    if(!ref.current) return; const app = new App(ref.current, items, bend, showTitles); appRef.current = app; return ()=>{ app.destroy(); appRef.current = null; };
  },[items, bend, showTitles]);

  // Preload videos
  useEffect(()=>{
    const links: HTMLLinkElement[] = [];
    for (const it of items){
      if (!it.videoUrl) continue;
      const l = document.createElement('link');
      l.rel = 'preload'; l.as = 'video'; l.href = it.videoUrl; l.crossOrigin = 'anonymous';
      document.head.appendChild(l); links.push(l);
    }
    return ()=>{ links.forEach(l=>{ try{ document.head.removeChild(l);}catch{} }); };
  },[items]);

  // Hover tracking and overlay rect calculation
  useEffect(()=>{
    const el = ref.current; if (!el) return;
    const onMove = (e: MouseEvent) => {
      setIsHovering(true);
      const app = appRef.current; if (!app) return;
      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const xWorld = (localX / rect.width - 0.5) * app.viewport.width;
      const idx = app.findClosestIndexAtWorldX(xWorld);
      setHoverIndex(idx);
      const pr = app.getPlanePixelRect(idx, rect.width, rect.height);
      if (pr) setOverlayRect(pr);
      // Dim the matching underlying plane (both duplicates)
      const baseIndex = ((idx % (app.originalCount || items.length)) + (app.originalCount || items.length)) % (app.originalCount || items.length);
      app.setDimBaseIndex(baseIndex);
    };
    const onLeave = () => {
      // Keep hover state frozen while context menu is open
      if (menuOpen) return;
      setIsHovering(false);
      setHoverIndex(null);
      setOverlayRect(null);
      try { videoRef.current?.pause(); } catch {}
      try { appRef.current?.setDimBaseIndex(null); } catch {}
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return ()=>{ el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  },[menuOpen, items]);

  // Autoplay/pause control
  useEffect(()=>{
    const v = videoRef.current; if (!v) return;
    setIsVideoReady(false);
    const shouldPlay = (isHovering || menuOpen) && hoverIndex !== null;
    if (shouldPlay) {
      const baseIndex = ((hoverIndex % items.length) + items.length) % items.length;
      const src = items[baseIndex]?.videoUrl;
      if (src) {
        if (v.src !== src) { v.src = src; try { v.load(); } catch {} }
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.play().catch(()=>{});
        // Fade in overlay
        requestAnimationFrame(()=> setOverlayOpacity(1));
      }
    } else {
      try { v.pause(); } catch {}
      // Fade out overlay
      requestAnimationFrame(()=> setOverlayOpacity(0));
    }
  }, [isHovering, hoverIndex, items, menuOpen]);

  return (
    <div ref={ref} className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing grid place-items-center">
      {/* Hover video overlay with context menu */}
      {hoverIndex !== null && overlayRect ? (
        <ContextMenu onOpenChange={setMenuOpen}>
          <ContextMenuTrigger asChild>
            <div
              style={{ position:'absolute', left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height, borderRadius: 0, overflow: 'hidden', opacity: overlayOpacity, transition: 'opacity 260ms ease', pointerEvents: 'auto', transform: 'none' }}
            >
              <video
                ref={videoRef}
                style={{ width:'100%', height:'100%', objectFit:'cover', visibility: isVideoReady ? 'visible' : 'hidden', backgroundColor: 'black' }}
                crossOrigin="anonymous"
                onCanPlay={()=> setIsVideoReady(true)}
                onWaiting={()=> setIsVideoReady(false)}
              />
              {!isVideoReady ? (
                <div className="absolute inset-0 grid place-items-center bg-black/20">
                  <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0a12 12 0 00-8 20l-2-3.464A8 8 0 014 12z"></path>
                  </svg>
                </div>
              ) : null}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={async()=>{
              try{
                const baseIndex = ((hoverIndex % items.length) + items.length) % items.length; const src = items[baseIndex]?.videoUrl; if(!src) return;
                const res = await fetch(src, { cache: 'no-store' }); const blob = await res.blob(); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${items[baseIndex]?.text || 'hook'}.mp4`.replace(/[^a-z0-9_.-]+/gi,'_'); document.body.appendChild(a); a.click(); setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
              }catch{}
            }}>Download video</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : null}
    </div>
  );
}
