"use client";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";

export type DateTimeSelectProps = {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function DateTimeSelect({ value, onChange, disabled, placeholder }: DateTimeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(() => (value ? new Date(value) : undefined));
  const [time, setTime] = React.useState<string>(() => {
    const d = value ?? null;
    if (!d) return "12:00";
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  });

  React.useEffect(() => {
    if (!value) { setSelectedDate(undefined); setTime("12:00"); return; }
    setSelectedDate(new Date(value));
    setTime(`${String(value.getHours()).padStart(2,"0")}:${String(value.getMinutes()).padStart(2,"0")}`);
  }, [value]);

  function emit(nextDate: Date | undefined, tm: string) {
    if (!onChange) return;
    if (!nextDate) { onChange(null); return; }
    const [hh, mm] = (tm || "12:00").split(":");
    const out = new Date(nextDate);
    out.setHours(Number(hh || 0));
    out.setMinutes(Number(mm || 0));
    out.setSeconds(0);
    out.setMilliseconds(0);
    onChange(out);
  }

  const label = React.useMemo(() => {
    if (!value) return placeholder || "Pick date & time";
    return `${value.toLocaleDateString()} ${String(value.getHours()).padStart(2,"0")}:${String(value.getMinutes()).padStart(2,"0")}`;
  }, [value, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between" disabled={disabled}>{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="grid gap-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d)=>{ setSelectedDate(d || undefined); emit(d || undefined, time); }}
            initialFocus
          />
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <div className="text-xs text-muted-foreground">Time</div>
            <Input type="time" value={time} onChange={(e)=>{ const v = e.target.value; setTime(v); emit(selectedDate, v); }} step={300} />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={()=>{ setSelectedDate(undefined); setTime("12:00"); emit(undefined, "12:00"); }}>Clear</Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={()=>{ const n = new Date(); setSelectedDate(n); const t = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`; setTime(t); emit(n, t); }}>Now</Button>
              <Button size="sm" onClick={()=>setOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


