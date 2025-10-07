"use client";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { MAKES, MODELS_BY_MAKE, inferTypeFromMake } from "@/lib/vehicles";

export type Vehicle = { make: string; model: string; type: "car" | "bike"; kitted: boolean; colorFinish?: string; accents?: string; photos?: string[] };

interface VehiclesEditorProps {
  value: Vehicle[];
  onChange: (next: Vehicle[]) => void;
  onWillRemoveVehicle?: (vehicle: Vehicle, index: number) => Promise<boolean> | boolean;
  className?: string;
}

export default function VehiclesEditor({ value, onChange, onWillRemoveVehicle, className }: VehiclesEditorProps) {
  const [make, setMake] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  const uniqueMakes = useMemo(() => Array.from(new Set(MAKES)), []);

  const modelOptions = useMemo(() => {
    if (!make) return [];
    const models = Array.from(new Set(MODELS_BY_MAKE[make] || []));
    return models.map((m) => ({ value: m, label: m }));
  }, [make]);

  function addVehicleQuick() {
    if (!make || !selectedModel) return;
    const type = inferTypeFromMake(make);
    onChange([...(value || []), { make, model: selectedModel, type, kitted: false, colorFinish: "", accents: "" }]);
    setMake("");
    setSelectedModel("");
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
          <Combobox
            options={modelOptions}
            value={selectedModel}
            onValueChange={setSelectedModel}
            placeholder={make ? "Search or enter model..." : "Select make first"}
            searchPlaceholder="Search model..."
            emptyText="No model found."
            allowCustom={!!make}
            className="bg-white/5"
          />
          <div className="text-xs mt-1 text-white/50">Search from list or enter custom model</div>
        </div>
      </div>
      {make && selectedModel && (
        <div className="mt-3">
          <button
            onClick={addVehicleQuick}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add {make} {selectedModel}
          </button>
        </div>
      )}

      {value.length > 0 ? (
        <div className="mt-3">
          <div className="text-sm font-medium mb-1">Vehicles owned</div>
          <ul className="text-sm space-y-3">
            {value.map((c, i) => (
              <li key={i} className="space-y-2 border rounded-md p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="grid sm:grid-cols-2 gap-2 flex-1">
                    <div>
                      <div className="text-xs mb-1 text-white/70">Make</div>
                      <Input
                        placeholder="e.g. BMW"
                        value={c.make}
                        onChange={(e)=>{
                          const nextMake = e.target.value;
                          onChange(value.map((it, idx)=> idx===i ? { ...it, make: nextMake } : it));
                        }}
                      />
                    </div>
                    <div>
                      <div className="text-xs mb-1 text-white/70">Model</div>
                      <Input
                        placeholder="e.g. M3"
                        value={c.model}
                        onChange={(e)=>{
                          const nextModel = e.target.value;
                          onChange(value.map((it, idx)=> idx===i ? { ...it, model: nextModel } : it));
                        }}
                      />
                    </div>
                  </div>
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


