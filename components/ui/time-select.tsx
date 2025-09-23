"use client"

import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Clock as ClockIcon, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type TimeValue = { h12: string; minute: string; ampm: "AM" | "PM" }

export type TimeSelectProps = {
  value?: TimeValue
  onChange?: (value: TimeValue) => void
  disabled?: boolean
  step?: number // minutes step
  className?: string
}

function formatLabel(v?: TimeValue): string {
  if (!v) return "Select time"
  return `${v.h12}:${v.minute} ${v.ampm}`
}

export default function TimeSelect({ value, onChange, disabled, step = 5, className }: TimeSelectProps) {
  const [open, setOpen] = React.useState(false)

  const options = React.useMemo(() => {
    const list: TimeValue[] = []
    const s = Math.max(1, Math.min(60, Math.floor(step)))
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += s) {
        const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM"
        const h12Num = h % 12 === 0 ? 12 : h % 12
        const h12 = String(h12Num)
        const minute = String(m).padStart(2, "0")
        list.push({ h12, minute, ampm })
      }
    }
    return list
  }, [step])

  function onSelect(v: TimeValue) {
    if (onChange) onChange(v)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("justify-between w-44", className)}
          disabled={disabled}
        >
          <span className="flex items-center gap-2">
            <ClockIcon className="size-4 text-white/80" />
            {formatLabel(value)}
          </span>
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-56">
        <Command>
          <CommandInput placeholder="Search time..." />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Times">
              {options.map((opt) => {
                const label = `${opt.h12}:${opt.minute} ${opt.ampm}`
                const isSelected = value && opt.h12 === value.h12 && opt.minute === value.minute && opt.ampm === value.ampm
                return (
                  <CommandItem key={`${label}`} value={label} onSelect={() => onSelect(opt)}>
                    <span className={cn("w-full", isSelected ? "font-medium" : undefined)}>{label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}


