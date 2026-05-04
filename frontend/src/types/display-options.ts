export type UnitCategory =
  | "none"
  | "number"
  | "percent"
  | "percent_0_1"
  | "bytes"
  | "bytes_sec"
  | "bits_sec"
  | "time_ns"
  | "time_us"
  | "time_ms"
  | "time_sec"
  | "ops_sec"
  | "requests_sec"
  | "iops"
  | "hertz"
  | "currency_usd"
  | "currency_eur"
  | "currency_gbp"
  | "custom";

export interface UnitConfig {
  category: UnitCategory;
  customSuffix?: string;
  decimals?: number;
  scaleToBase?: boolean;
}

export type ThresholdMode = "absolute" | "percentage";

export interface ThresholdStep {
  value: number;
  color: string;
  label?: string;
}

export interface ThresholdConfig {
  mode: ThresholdMode;
  steps: ThresholdStep[];
  showLines?: boolean;
  showBands?: boolean;
  baseColor?: string;
}

export type LegendPosition = "bottom" | "right" | "hidden";
export type LegendMode = "list" | "table";
export type LegendColumn = "last" | "avg" | "min" | "max" | "total";

export interface LegendConfig {
  position: LegendPosition;
  mode: LegendMode;
  showValues?: boolean;
  columns?: LegendColumn[];
  sortBy?: "name" | LegendColumn;
  sortDirection?: "asc" | "desc";
}

export type YAxisScale = "linear" | "log";

export interface YAxisRightConfig {
  enabled: boolean;
  seriesIndices?: number[];
  scale?: YAxisScale;
  min?: number | "auto";
  max?: number | "auto";
  unit?: UnitConfig;
  label?: string;
}

export interface YAxisConfig {
  scale?: YAxisScale;
  min?: number | "auto";
  max?: number | "auto";
  unit?: UnitConfig;
  label?: string;
  right?: YAxisRightConfig;
}

export interface SeriesColorOverride {
  seriesPattern: string;
  color: string;
}

export interface ColorConfig {
  palette?: string[];
  overrides?: SeriesColorOverride[];
}

export type StatColorMode = "value" | "background" | "none";
export type StatTextSize = "sm" | "md" | "lg" | "xl";
export type StatDeltaMode = "percent" | "absolute";

export interface StatDisplayConfig {
  colorMode?: StatColorMode;
  textSize?: StatTextSize;
  showSparkline?: boolean;
  showDelta?: boolean;
  deltaMode?: StatDeltaMode;
}

export interface GaugeDisplayConfig {
  min?: number;
  max?: number;
  showTicks?: boolean;
  arcWidth?: number;
}

export interface TableDisplayConfig {
  columns?: ("last" | "avg" | "min" | "max" | "count")[];
  showTags?: boolean;
  pageSize?: number;
}

export interface HistogramDisplayConfig {
  buckets?: number;
  cumulative?: boolean;
}

export interface TimeRangeOverride {
  range: string;
  customFrom?: string;
  customTo?: string;
}

export interface ValueMapping {
  type: "value" | "range";
  match?: number;
  from?: number;
  to?: number;
  displayText: string;
  color?: string;
}

export interface DataLink {
  label: string;
  url: string;
}

export interface HexbinDisplayConfig {
  groupBy?: string;
  hexSize?: number;
  colorMetric?: string;
}

export interface HeatmapDisplayConfig {
  bucketCount?: number;
  colorScheme?: "greens" | "blues" | "reds" | "purples" | "oranges" | "viridis" | "inferno" | "plasma";
  showCellValues?: boolean;
}

export interface TreemapDisplayConfig {
  sizeMetric?: string;
  colorMetric?: string;
  groupBy?: string;
  maxDepth?: number;
}

export interface GeomapDisplayConfig {
  mapStyle?: "dark" | "light" | "satellite";
  markerSize?: "fixed" | "proportional";
  regionScope?: "world" | "us" | "eu" | "ap";
  showLabels?: boolean;
}

export interface SankeyDisplayConfig {
  sourceField?: string;
  targetField?: string;
  valueField?: string;
  nodeWidth?: number;
  nodePadding?: number;
}

export interface TopologyDisplayConfig {
  layout?: "force" | "hierarchical" | "circular";
  showMetrics?: boolean;
  groupBy?: string;
  edgeStyle?: "curved" | "straight";
}

export interface SparklineTableDisplayConfig {
  columns?: string[];
  sparklineWidth?: number;
  sparklineMetric?: string;
  showTrend?: boolean;
  pageSize?: number;
}

export interface BarGaugeDisplayConfig {
  orientation?: "horizontal" | "vertical";
  showValue?: boolean;
  minWidth?: number;
  maxItems?: number;
}

export interface RadarDisplayConfig {
  axes?: string[];
  fillOpacity?: number;
  showPoints?: boolean;
  maxValue?: number;
}

export interface CandlestickDisplayConfig {
  upColor?: string;
  downColor?: string;
  showVolume?: boolean;
}

export interface CalendarHeatmapDisplayConfig {
  colorScheme?: "greens" | "blues" | "reds" | "oranges";
  monthsToShow?: number;
  startDay?: 0 | 1;
}

export interface BubbleDisplayConfig {
  xMetric?: string;
  yMetric?: string;
  sizeMetric?: string;
  minBubbleSize?: number;
  maxBubbleSize?: number;
  showLabels?: boolean;
}

export interface WaterfallDisplayConfig {
  showTotal?: boolean;
  positiveColor?: string;
  negativeColor?: string;
  totalColor?: string;
}

export interface BoxPlotDisplayConfig {
  showOutliers?: boolean;
  whiskerType?: "minmax" | "iqr1.5";
}

export interface FunnelDisplayConfig {
  orientation?: "horizontal" | "vertical";
  showPercentage?: boolean;
  showDifference?: boolean;
}

export interface SloTrackerDisplayConfig {
  targetSlo?: number;
  windowDays?: number;
  showBurnRate?: boolean;
  showErrorBudget?: boolean;
}

export interface AlertListDisplayConfig {
  maxItems?: number;
  showResolved?: boolean;
  filterSeverity?: string[];
}

export interface LogStreamDisplayConfig {
  maxLines?: number;
  showTimestamp?: boolean;
  showSeverity?: boolean;
  wrapLines?: boolean;
  filterQuery?: string;
}

export interface ResourceInventoryDisplayConfig {
  resourceType?: string;
  columns?: string[];
  showHealth?: boolean;
  pageSize?: number;
}

export interface ProgressDisplayConfig {
  shape?: "circular" | "linear";
  targetValue?: number;
  showLabel?: boolean;
}

export interface ForecastDisplayConfig {
  method?: "linear" | "exponential" | "holt_winters";
  forecastPeriods?: number;
  confidenceLevel?: number;
  showConfidenceBand?: boolean;
}

export interface DiffComparisonDisplayConfig {
  layout?: "side_by_side" | "overlay";
  showPercentChange?: boolean;
}

export interface AnomalyConfig {
  enabled?: boolean;
  stdDevMultiplier?: number;
  rollingWindow?: number;
  showBands?: boolean;
}

export type DataTransform =
  | "none"
  | "rate"
  | "delta"
  | "cumulative"
  | "moving_avg_5"
  | "moving_avg_10"
  | "percentile_95"
  | "percentile_99";

export const DATA_TRANSFORM_OPTIONS: { value: DataTransform; label: string }[] = [
  { value: "none", label: "None" },
  { value: "rate", label: "Rate of Change" },
  { value: "delta", label: "Delta" },
  { value: "cumulative", label: "Cumulative Sum" },
  { value: "moving_avg_5", label: "Moving Average (5)" },
  { value: "moving_avg_10", label: "Moving Average (10)" },
  { value: "percentile_95", label: "P95" },
  { value: "percentile_99", label: "P99" },
];

export interface PanelDisplayOptions {
  unit?: UnitConfig;
  thresholds?: ThresholdConfig;
  legend?: LegendConfig;
  yAxis?: YAxisConfig;
  colors?: ColorConfig;
  stat?: StatDisplayConfig;
  gauge?: GaugeDisplayConfig;
  table?: TableDisplayConfig;
  histogram?: HistogramDisplayConfig;
  timeRangeOverride?: TimeRangeOverride;

  valueMappings?: ValueMapping[];
  dataLinks?: DataLink[];

  fillMode?: "solid" | "gradient";
  fillOpacity?: number;
  lineInterpolation?: "linear" | "monotone" | "stepBefore" | "stepAfter" | "natural";
  connectNulls?: boolean;

  nullHandling?: "connect" | "gap" | "zero";
  stackingMode?: "none" | "normal" | "percent";

  stacked?: boolean;
  limit?: number;
  showLabels?: boolean;
  donutWidth?: number;

  // New widget-specific configs
  hexbin?: HexbinDisplayConfig;
  heatmap?: HeatmapDisplayConfig;
  treemap?: TreemapDisplayConfig;
  geomap?: GeomapDisplayConfig;
  sankey?: SankeyDisplayConfig;
  topology?: TopologyDisplayConfig;
  sparklineTable?: SparklineTableDisplayConfig;
  barGauge?: BarGaugeDisplayConfig;
  radar?: RadarDisplayConfig;
  candlestick?: CandlestickDisplayConfig;
  calendarHeatmap?: CalendarHeatmapDisplayConfig;
  bubble?: BubbleDisplayConfig;
  waterfall?: WaterfallDisplayConfig;
  boxPlot?: BoxPlotDisplayConfig;
  funnel?: FunnelDisplayConfig;
  sloTracker?: SloTrackerDisplayConfig;
  alertList?: AlertListDisplayConfig;
  logStream?: LogStreamDisplayConfig;
  resourceInventory?: ResourceInventoryDisplayConfig;
  progress?: ProgressDisplayConfig;
  forecast?: ForecastDisplayConfig;
  diffComparison?: DiffComparisonDisplayConfig;

  // Anomaly detection overlay
  anomaly?: AnomalyConfig;

  // Data transformation applied at display time
  transform?: DataTransform;

  // Panel description tooltip
  description?: string;
}

export const DEFAULT_COLORS = [
  "#635bff",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
];

export const THRESHOLD_COLORS = {
  ok: "#22c55e",
  warning: "#f59e0b",
  critical: "#ef4444",
};

export const UNIT_CATEGORIES: { value: UnitCategory; label: string; group: string }[] = [
  { value: "none", label: "None", group: "Common" },
  { value: "number", label: "Number", group: "Common" },
  { value: "percent", label: "Percent (0-100)", group: "Common" },
  { value: "percent_0_1", label: "Percent (0.0-1.0)", group: "Common" },
  { value: "bytes", label: "Bytes (IEC)", group: "Data" },
  { value: "bytes_sec", label: "Bytes/sec", group: "Data" },
  { value: "bits_sec", label: "Bits/sec", group: "Data" },
  { value: "time_ns", label: "Nanoseconds", group: "Time" },
  { value: "time_us", label: "Microseconds", group: "Time" },
  { value: "time_ms", label: "Milliseconds", group: "Time" },
  { value: "time_sec", label: "Seconds", group: "Time" },
  { value: "ops_sec", label: "Ops/sec", group: "Throughput" },
  { value: "requests_sec", label: "Requests/sec", group: "Throughput" },
  { value: "iops", label: "IOPS", group: "Throughput" },
  { value: "hertz", label: "Hertz", group: "Throughput" },
  { value: "currency_usd", label: "US Dollar ($)", group: "Currency" },
  { value: "currency_eur", label: "Euro (€)", group: "Currency" },
  { value: "currency_gbp", label: "Pound (£)", group: "Currency" },
  { value: "custom", label: "Custom suffix", group: "Other" },
];
