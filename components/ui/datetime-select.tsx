"use client";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";

export type DateTimeSelectProps = {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function DateTimeSelect({ value, onChange, disabled, placeholder }: DateTimeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(() => (value ? new Date(value) : undefined));
  const [timeStr, setTimeStr] = React.useState<string>(() => {
    const d = value ?? null;
    if (!d) {
      const today = new Date();
      const localForUtc19 = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0, 0));
      const hh = String(localForUtc19.getHours()).padStart(2, "0");
      const mm = String(localForUtc19.getMinutes()).padStart(2, "0");
      const ss = String(localForUtc19.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    }
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  });

  React.useEffect(() => {
    if (!value) {
      setSelectedDate(undefined);
      const today = new Date();
      const localForUtc19 = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0, 0));
      const hh = String(localForUtc19.getHours()).padStart(2, "0");
      const mm = String(localForUtc19.getMinutes()).padStart(2, "0");
      const ss = String(localForUtc19.getSeconds()).padStart(2, "0");
      setTimeStr(`${hh}:${mm}:${ss}`);
      return;
    }
    setSelectedDate(new Date(value));
    const hh = String(value.getHours()).padStart(2, "0");
    const mm = String(value.getMinutes()).padStart(2, "0");
    const ss = String(value.getSeconds()).padStart(2, "0");
    setTimeStr(`${hh}:${mm}:${ss}`);
  }, [value]);

  function emit(nextDate: Date | undefined, t: string) {
    if (!onChange) return;
    if (!nextDate) { onChange(null); return; }
    const parts = (t || "19:00:00").split(":");
    const hh = Number(parts[0] || 19);
    const mm = Number(parts[1] || 0);
    const ss = Number(parts[2] || 0);
    const out = new Date(nextDate);
    out.setHours(hh);
    out.setMinutes(mm);
    out.setSeconds(ss);
    out.setSeconds(0);
    out.setMilliseconds(0);
    onChange(out);
  }

  const label = React.useMemo(() => {
    if (!value) return placeholder || "Pick date & time";
    const date = value.toLocaleDateString();
    const time = value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${date} ${time}`;
  }, [value, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between" disabled={disabled}>{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-fit p-3" align="start">
        <div className="grid gap-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d)=>{ setSelectedDate(d || undefined); emit(d || undefined, timeStr); }}
            initialFocus
          />
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <div className="text-xs text-muted-foreground">Time</div>
            <Input
              type="time"
              step={1}
              value={timeStr}
              onChange={(e)=>{ const v = e.target.value; setTimeStr(v); if (selectedDate) emit(selectedDate, v); }}
              className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none w-40"
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={()=>{ const n = new Date(); setSelectedDate(n); const hh = String(n.getHours()).padStart(2,'0'); const mm = String(n.getMinutes()).padStart(2,'0'); const ss = '00'; const v = `${hh}:${mm}:${ss}`; setTimeStr(v); emit(n, v); }}>Now</Button>
            <Button size="sm" onClick={()=>setOpen(false)}>Done</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


