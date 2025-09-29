export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function resolveRecordId(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (isRecord(raw)) {
    if ("id" in raw) {
      const nested = resolveRecordId(raw["id"]);
      if (nested) {
        if (typeof raw["tb"] === "string" && !nested.includes(":")) {
          return `${String(raw["tb"]) || ""}:${nested}`.replace(/^:+/, "");
        }
        return nested;
      }
    }
    const toString = (raw as { toString?: () => string }).toString;
    if (typeof toString === "function" && toString !== Object.prototype.toString) {
      try {
        const result = toString.call(raw);
        if (typeof result === "string" && result && result !== "[object Object]") {
          return result;
        }
      } catch {}
    }
  }
  return undefined;
}

