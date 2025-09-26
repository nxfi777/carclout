const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ParsedColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function parseHexColor(input: string): ParsedColor | null {
  const hex = input.replace('#', '').trim();
  if (hex.length === 3 || hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
    return { r, g, b, a };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

function parseRgbColor(input: string): ParsedColor | null {
  const rgbaMatch = input.match(/rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/i);
  if (!rgbaMatch) return null;
  const r = clamp(Number(rgbaMatch[1] || 0), 0, 255);
  const g = clamp(Number(rgbaMatch[2] || 0), 0, 255);
  const b = clamp(Number(rgbaMatch[3] || 0), 0, 255);
  const a = clamp(Number(rgbaMatch[4] ?? 1), 0, 1);
  return { r, g, b, a };
}

export function parseColor(input: string | undefined, fallback: string = '#ffffff'): ParsedColor {
  const value = (input || fallback).trim();
  try {
    if (value.startsWith('#')) {
      const parsed = parseHexColor(value);
      if (parsed) return parsed;
    }
    const rgb = parseRgbColor(value);
    if (rgb) return rgb;
  } catch {
    // fall through
  }
  const fallbackParsed = parseHexColor(fallback.startsWith('#') ? fallback : '#ffffff');
  return fallbackParsed ?? { r: 255, g: 255, b: 255, a: 1 };
}

export function toRgbaString({ r, g, b, a }: ParsedColor): string {
  const alpha = clamp(Number.isFinite(a) ? a : 1, 0, 1);
  return `rgba(${Math.round(clamp(r, 0, 255))},${Math.round(clamp(g, 0, 255))},${Math.round(clamp(b, 0, 255))},${Number(alpha.toFixed(3))})`;
}

export function getColorAlpha(color: string | undefined): number {
  return clamp(parseColor(color).a, 0, 1);
}

export function setColorAlpha(color: string | undefined, nextAlpha: number, fallback?: string): string {
  const parsed = parseColor(color, fallback ?? '#ffffff');
  parsed.a = clamp(nextAlpha, 0, 1);
  return toRgbaString(parsed);
}

export function multiplyColorAlpha(color: string | undefined, alphaMultiplier: number, fallback?: string): string {
  const parsed = parseColor(color, fallback ?? '#ffffff');
  parsed.a = clamp(parsed.a * alphaMultiplier, 0, 1);
  return toRgbaString(parsed);
}


