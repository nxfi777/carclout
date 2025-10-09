"use client"

import { useState } from "react"
import { Check, ChevronDown, ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type AspectRatioOption = {
  label: string
  value: number | 'detect' | null
  display: string
}

const PRESET_RATIOS: AspectRatioOption[] = [
  { label: "1:1 (Square)", value: 1, display: "1:1" },
  { label: "4:5 (Portrait)", value: 0.8, display: "4:5" },
  { label: "3:4", value: 0.75, display: "3:4" },
  { label: "2:3", value: 0.6667, display: "2:3" },
  { label: "9:16 (Vertical)", value: 0.5625, display: "9:16" },
  { label: "5:4 (Landscape)", value: 1.25, display: "5:4" },
  { label: "4:3", value: 1.3333, display: "4:3" },
  { label: "3:2", value: 1.5, display: "3:2" },
  { label: "16:9 (Widescreen)", value: 1.7778, display: "16:9" },
  { label: "21:9 (Ultrawide)", value: 2.3333, display: "21:9" },
]

interface AspectRatioSelectorProps {
  value: number | null
  onChange: (value: number | null) => void
  onDetectFromImage?: () => void
  canDetect?: boolean
  className?: string
}

export function AspectRatioSelector({ 
  value, 
  onChange, 
  onDetectFromImage, 
  canDetect = false,
  className 
}: AspectRatioSelectorProps) {
  const [open, setOpen] = useState(false)
  const [customInput, setCustomInput] = useState("")
  const [showCustomInput, setShowCustomInput] = useState(false)

  // Find matching preset or show custom value
  const currentPreset = PRESET_RATIOS.find(r => 
    r.value !== null && r.value !== 'detect' && 
    value !== null && 
    Math.abs(r.value - value) < 0.001
  )

  const displayValue = currentPreset 
    ? currentPreset.display 
    : value 
    ? value.toFixed(3) 
    : "None"

  const handlePresetSelect = (option: AspectRatioOption) => {
    if (option.value === 'detect' && onDetectFromImage) {
      onDetectFromImage()
    } else if (typeof option.value === 'number') {
      onChange(option.value)
    } else {
      onChange(null)
    }
    setOpen(false)
    setShowCustomInput(false)
    setCustomInput("")
  }

  const handleCustomSubmit = () => {
    const input = customInput.trim()
    if (!input) {
      setShowCustomInput(false)
      setCustomInput("")
      return
    }

    // Try to parse as ratio (e.g., "16:9" or "3.5:7.6")
    if (input.includes(':')) {
      const parts = input.split(':')
      if (parts.length === 2) {
        const width = parseFloat(parts[0])
        const height = parseFloat(parts[1])
        if (!isNaN(width) && !isNaN(height) && height > 0) {
          const ratio = width / height
          if (ratio > 0 && ratio <= 10) {
            onChange(ratio)
            setOpen(false)
            setShowCustomInput(false)
            setCustomInput("")
            return
          }
        }
      }
    }

    // Try to parse as decimal
    const decimal = parseFloat(input)
    if (!isNaN(decimal) && decimal > 0 && decimal <= 10) {
      onChange(decimal)
      setOpen(false)
      setShowCustomInput(false)
      setCustomInput("")
      return
    }

    // Invalid input - could show error toast here
    setCustomInput("")
  }

  const handleClearRatio = () => {
    onChange(null)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between min-w-[10rem]", className)}
        >
          <span>{displayValue}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[16rem] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search aspect ratios..." />
          <CommandList className="max-h-[28rem]">
            <CommandEmpty>
              {showCustomInput ? (
                <div className="p-2 space-y-2">
                  <div className="text-xs text-white/70">
                    Enter decimal (e.g., 1.5) or ratio (e.g., 16:9)
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCustomSubmit()
                        } else if (e.key === 'Escape') {
                          setShowCustomInput(false)
                          setCustomInput("")
                        }
                      }}
                      placeholder="e.g., 16:9 or 1.78"
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button 
                      size="sm" 
                      onClick={handleCustomSubmit}
                      className="h-8"
                    >
                      Set
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => setShowCustomInput(true)}
                >
                  Custom ratio
                </Button>
              )}
            </CommandEmpty>
            <CommandGroup heading="Standard Ratios">
              {PRESET_RATIOS.map((option) => (
                <CommandItem
                  key={option.display}
                  value={option.label}
                  onSelect={() => handlePresetSelect(option)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentPreset?.value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {canDetect && onDetectFromImage && (
              <CommandGroup heading="Auto-detect">
                <CommandItem
                  value="detect from image"
                  onSelect={() => handlePresetSelect({ label: "Detect from image", value: 'detect', display: "Detect" })}
                >
                  <ScanLine className="mr-2 h-4 w-4" />
                  Detect from admin image
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              <CommandItem
                value="custom ratio"
                onSelect={() => setShowCustomInput(true)}
              >
                Custom ratio...
              </CommandItem>
              {value !== null && (
                <CommandItem
                  value="clear ratio"
                  onSelect={handleClearRatio}
                  className="text-destructive"
                >
                  Clear aspect ratio
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

