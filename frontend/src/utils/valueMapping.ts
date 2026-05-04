import type { ValueMapping } from "../types/display-options";

export interface MappedValue {
  text: string;
  color?: string;
}

export function applyValueMapping(
  value: number | null | undefined,
  mappings?: ValueMapping[],
): MappedValue | null {
  if (value == null || !mappings || mappings.length === 0) return null;

  for (const m of mappings) {
    if (m.type === "value" && m.match != null && value === m.match) {
      return { text: m.displayText, color: m.color };
    }
    if (m.type === "range") {
      const lo = m.from ?? -Infinity;
      const hi = m.to ?? Infinity;
      if (value >= lo && value <= hi) {
        return { text: m.displayText, color: m.color };
      }
    }
  }
  return null;
}
