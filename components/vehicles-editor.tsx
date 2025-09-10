"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MAKES, MODELS_BY_MAKE, inferTypeFromMake } from "@/lib/vehicles";

export type Vehicle = { make: string; model: string; type: "car" | "bike"; kitted: boolean; colorFinish?: string; accents?: string };

interface VehiclesEditorProps {
  value: Vehicle[];
  onChange: (next: Vehicle[]) => void;
  onWillRemoveVehicle?: (vehicle: Vehicle, index: number) => Promise<boolean> | boolean;
  className?: string;
}

export default function VehiclesEditor({ value, onChange, onWillRemoveVehicle, className }: VehiclesEditorProps) {
  const [make, setMake] = useState<string>("");
  const [modelQuery, setModelQuery] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const modelBoxRef = useRef<HTMLDivElement | null>(null);

  const uniqueMakes = useMemo(() => Array.from(new Set(MAKES)), []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!modelOpen) return;
      const el = modelBoxRef.current;
      if (el && !el.contains(e.target as Node)) setModelOpen(false);
    }
    document.addEventListener("mousedown", onDocClick, { passive: true } as AddEventListenerOptions);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [modelOpen]);

  function addVehicleQuick(model: string) {
    if (!make) return;
    const type = inferTypeFromMake(make);
    onChange([...(value || []), { make, model, type, kitted: false, colorFinish: "", accents: "" }]);
    setMake("");
    setModelQuery("");
    setModelOpen(false);
  }

  function toggleKitted(index: number, nextVal: boolean) {
    onChange(value.map((v, i) => (i === index ? { ...v, kitted: nextVal } : v)));
  }

  async function removeVehicle(index: number) {
    const vehicle = value[index];
    let canRemove = true;
    if (onWillRemoveVehicle && vehicle) {
      try {
        const res = await onWillRemoveVehicle(vehicle, index);
        canRemove = res !== false;
      } catch {}
    }
    if (!canRemove) return;
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className={className}>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-xs mb-1 text-white/70">Vehicle Make (optional)</div>
          <Select value={make} onValueChange={setMake}>
            <SelectTrigger className="bg-white/5"><SelectValue placeholder="Select make" /></SelectTrigger>
            <SelectContent side="bottom" align="start" position="popper" sideOffset={6} collisionPadding={0} avoidCollisions={false} className="bg-white/5">
              {uniqueMakes.map((m) => (
                <SelectItem key={m} value={m} className="cursor-pointer">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs mb-1 text-white/70">Vehicle Model (optional)</div>
          <div className="relative" ref={modelBoxRef}>
            <Input placeholder="Search model…" value={modelQuery} onFocus={() => setModelOpen(true)} onChange={(e) => setModelQuery(e.target.value)} />
            {modelOpen ? (
              <div className="absolute left-0 right-0 top-full mt-2 rounded-md border bg-[var(--popover)] text-[var(--popover-foreground)] border-[var(--border)] max-h-56 overflow-auto z-50 shadow-xl">
                <ul>
                  {Array.from(new Set(MODELS_BY_MAKE[make] || []))
                    .filter((x) => x.toLowerCase().includes(modelQuery.toLowerCase()))
                    .map((m) => (
                      <li key={m}><button className="w-full text-left px-3 py-1.5 hover:bg-white/10 cursor-pointer" onClick={() => addVehicleQuick(m)}>{m}</button></li>
                    ))}
                  <li><button className="w-full text-left px-3 py-1.5 hover:bg-white/10 cursor-pointer" onClick={() => addVehicleQuick(modelQuery || "Other")}>Other…</button></li>
                </ul>
              </div>
            ) : null}
          </div>
          <div className="text-xs mt-1 text-white/50">Optional. Custom: type a name to add.</div>
        </div>
      </div>

      {value.length > 0 ? (
        <div className="mt-3">
          <div className="text-sm font-medium mb-1">Vehicles owned</div>
          <ul className="text-sm space-y-3">
            {value.map((c, i) => (
              <li key={`${c.make}-${c.model}-${i}`} className="space-y-2 border rounded-md p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.make} {c.model} <span className="text-white/50">({c.type})</span></span>
                  <div className="flex items-center gap-3">
                    <label className="text-xs flex items-center gap-2">
                      <Checkbox checked={c.kitted} onCheckedChange={(val) => toggleKitted(i, !!val)} /> kitted?
                    </label>
                    <button className="text-xs text-red-400" onClick={() => removeVehicle(i)}>Remove</button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs mb-1 text-white/70">Body color/finish</div>
                    <Input
                      placeholder="e.g. gloss metallic red"
                      value={c.colorFinish || ""}
                      onChange={(e)=>{
                        const v = e.target.value;
                        onChange(value.map((it, idx)=> idx===i ? { ...it, colorFinish: v } : it));
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-xs mb-1 text-white/70">Notable accents (optional)</div>
                    <Input
                      placeholder="e.g. satin black aero kit"
                      value={c.accents || ""}
                      onChange={(e)=>{
                        const v = e.target.value;
                        onChange(value.map((it, idx)=> idx===i ? { ...it, accents: v } : it));
                      }}
                    />
                  </div>
                </div>
                <div className="text-xs text-white/50">Body color/finish is required for templates; accents are optional.</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}


