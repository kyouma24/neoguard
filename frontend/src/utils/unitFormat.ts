import type { UnitCategory, UnitConfig } from "../types/display-options";

const IEC_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];
const IEC_RATE_UNITS = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
const BIT_RATE_UNITS = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
const SI_PREFIXES = ["", "K", "M", "G", "T", "P"];

function scaleIEC(value: number, units: string[], decimals: number): string {
  if (value === 0) return `0 ${units[0]}`;
  const absVal = Math.abs(value);
  let idx = 0;
  let scaled = absVal;
  while (scaled >= 1024 && idx < units.length - 1) {
    scaled /= 1024;
    idx++;
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}${scaled.toFixed(decimals)} ${units[idx]}`;
}

function scaleSI(value: number, suffix: string, decimals: number): string {
  if (value === 0) return `0 ${suffix}`;
  const absVal = Math.abs(value);
  let idx = 0;
  let scaled = absVal;
  while (scaled >= 1000 && idx < SI_PREFIXES.length - 1) {
    scaled /= 1000;
    idx++;
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}${scaled.toFixed(decimals)} ${SI_PREFIXES[idx]}${suffix}`;
}

function scaleTime(valueInBaseUnit: number, baseUnit: "ns" | "us" | "ms" | "s", decimals: number): string {
  const toMs: Record<string, number> = { ns: 1e-6, us: 1e-3, ms: 1, s: 1000 };
  let ms = valueInBaseUnit * toMs[baseUnit];

  if (ms < 0) {
    return `-${scaleTime(-valueInBaseUnit, baseUnit, decimals)}`;
  }
  if (ms === 0) return `0 ${baseUnit}`;

  if (ms < 1) return `${(ms * 1000).toFixed(decimals)} µs`;
  if (ms < 1000) return `${ms.toFixed(decimals)} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(decimals)} s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(decimals)} min`;
  const hr = min / 60;
  if (hr < 24) return `${hr.toFixed(decimals)} hr`;
  const d = hr / 24;
  return `${d.toFixed(decimals)} d`;
}

function formatFixed(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function formatCurrency(value: number, symbol: string, decimals: number): string {
  if (Math.abs(value) >= 1e9) return `${symbol}${(value / 1e9).toFixed(decimals)}B`;
  if (Math.abs(value) >= 1e6) return `${symbol}${(value / 1e6).toFixed(decimals)}M`;
  if (Math.abs(value) >= 1e3) return `${symbol}${(value / 1e3).toFixed(decimals)}K`;
  return `${symbol}${value.toFixed(decimals)}`;
}

const categoryFormatter: Record<UnitCategory, (v: number, d: number, cfg: UnitConfig) => string> = {
  none: (v, d) => formatFixed(v, d),
  number: (v, d) => {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(d)}B`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(d)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(d)}K`;
    return formatFixed(v, d);
  },
  percent: (v, d) => `${formatFixed(v, d)}%`,
  percent_0_1: (v, d) => `${formatFixed(v * 100, d)}%`,
  bytes: (v, d) => scaleIEC(v, IEC_UNITS, d),
  bytes_sec: (v, d) => scaleIEC(v, IEC_RATE_UNITS, d),
  bits_sec: (v, d) => scaleIEC(v, BIT_RATE_UNITS, d),
  time_ns: (v, d) => scaleTime(v, "ns", d),
  time_us: (v, d) => scaleTime(v, "us", d),
  time_ms: (v, d) => scaleTime(v, "ms", d),
  time_sec: (v, d) => scaleTime(v, "s", d),
  ops_sec: (v, d) => scaleSI(v, "ops/s", d),
  requests_sec: (v, d) => scaleSI(v, "req/s", d),
  iops: (v, d) => scaleSI(v, "IOPS", d),
  hertz: (v, d) => scaleSI(v, "Hz", d),
  currency_usd: (v, d) => formatCurrency(v, "$", d),
  currency_eur: (v, d) => formatCurrency(v, "€", d),
  currency_gbp: (v, d) => formatCurrency(v, "£", d),
  custom: (v, d, cfg) => `${formatFixed(v, d)} ${cfg.customSuffix ?? ""}`,
};

export function formatValue(value: number | null | undefined, config?: UnitConfig): string {
  if (value == null || !isFinite(value)) return "—";
  const cat = config?.category ?? "none";
  const decimals = config?.decimals ?? 2;
  const formatter = categoryFormatter[cat] ?? categoryFormatter.none;
  return formatter(value, decimals, config ?? { category: "none" });
}

export function formatAxisTick(value: number, config?: UnitConfig): string {
  if (value == null || !isFinite(value)) return "";
  const cat = config?.category ?? "none";
  const decimals = config?.decimals ?? 1;
  const formatter = categoryFormatter[cat] ?? categoryFormatter.none;
  return formatter(value, decimals, config ?? { category: "none" });
}

export function getThresholdColor(
  value: number | null | undefined,
  steps: { value: number; color: string }[],
  baseColor?: string,
): string {
  if (value == null || steps.length === 0) return baseColor ?? "var(--text-primary)";
  const sorted = [...steps].sort((a, b) => a.value - b.value);
  let color = baseColor ?? sorted[0].color;
  for (const step of sorted) {
    if (value >= step.value) color = step.color;
    else break;
  }
  return color;
}
