import type { ComponentType } from "react";
import type {
  PanelType,
  PanelDisplayOptions,
  MetricQueryResult,
  Annotation,
  AlertEvent,
} from "../../types";

/**
 * Unified props passed to every widget renderer.
 * Each widget destructures only the props it needs.
 */
export interface WidgetProps {
  data: MetricQueryResult[];
  height: number;
  displayOptions?: PanelDisplayOptions;
  onTimeRangeChange?: (from: Date, to: Date) => void;
  comparisonData?: MetricQueryResult[];
  annotations?: Annotation[];
  onAnnotate?: (timestamp: Date) => void;
  alertEvents?: AlertEvent[];
  /** For text widget */
  content?: string;
  /** For top_list (bar chart) */
  limit?: number;
  /** For stacked area */
  stacked?: boolean;
  /** Click-to-filter: called when user clicks a data element to set a template variable */
  onFilterChange?: (key: string, value: string) => void;
}

export interface WidgetTypeDefinition {
  type: PanelType;
  label: string;
  minSize: { w: number; h: number };
  defaultSize: { w: number; h: number };
  Renderer: ComponentType<WidgetProps>;
}

// Import directly from source files — NOT from ./index barrel to avoid circular dependency.
// (./index re-exports from this file, so importing from ./index here would be circular.)
import { AlertListWidget } from "./AlertListWidget";
import { BarChartWidget } from "./BarChart";
import { BarGaugeWidget } from "./BarGaugeWidget";
import { BoxPlotWidget } from "./BoxPlotWidget";
import { BubbleWidget } from "./BubbleWidget";
import { CalendarHeatmapWidget } from "./CalendarHeatmapWidget";
import { CandlestickWidget } from "./CandlestickWidget";
import { ChangeWidget } from "./ChangeWidget";
import { DiffComparisonWidget } from "./DiffComparisonWidget";
import { ForecastWidget } from "./ForecastWidget";
import { FunnelWidget } from "./FunnelWidget";
import { GaugeWidget } from "./GaugeWidget";
import { GeomapWidget } from "./GeomapWidget";
import { HeatmapWidget } from "./HeatmapWidget";
import { HexbinMapWidget } from "./HexbinMapWidget";
import { HistogramWidget } from "./HistogramWidget";
import { LogStreamWidget } from "./LogStreamWidget";
import { PieChartWidget } from "./PieChart";
import { ProgressWidget } from "./ProgressWidget";
import { RadarWidget } from "./RadarWidget";
import { ResourceInventoryWidget } from "./ResourceInventoryWidget";
import { SankeyWidget } from "./SankeyWidget";
import { ScatterWidget } from "./ScatterWidget";
import { SloTrackerWidget } from "./SloTrackerWidget";
import { SparklineTableWidget } from "./SparklineTableWidget";
import { StatWidget } from "./StatWidget";
import { StatusWidget } from "./StatusWidget";
import { TableWidget } from "./TableWidget";
import { TextWidget } from "./TextWidget";
import { TopologyWidget } from "./TopologyWidget";
import { TreemapWidget } from "./TreemapWidget";
import { UPlotTimeSeriesWidget, UPlotAreaWidget } from "./UPlotWidgetAdapters";
import { WaterfallWidget } from "./WaterfallWidget";

/**
 * Central registry of all widget types.
 * This is the ONLY place that maps PanelType -> React component.
 */
export const WIDGET_REGISTRY: Record<PanelType, WidgetTypeDefinition> = {
  timeseries: {
    type: "timeseries",
    label: "Time Series (Line)",
    minSize: { w: 3, h: 2 },
    defaultSize: { w: 6, h: 4 },
    Renderer: UPlotTimeSeriesWidget as ComponentType<WidgetProps>,
  },
  area: {
    type: "area",
    label: "Area Chart",
    minSize: { w: 3, h: 2 },
    defaultSize: { w: 6, h: 4 },
    Renderer: UPlotAreaWidget as ComponentType<WidgetProps>,
  },
  stat: {
    type: "stat",
    label: "Single Stat",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 3, h: 3 },
    Renderer: StatWidget as ComponentType<WidgetProps>,
  },
  top_list: {
    type: "top_list",
    label: "Top List (Bar)",
    minSize: { w: 3, h: 2 },
    defaultSize: { w: 6, h: 4 },
    Renderer: BarChartWidget as ComponentType<WidgetProps>,
  },
  pie: {
    type: "pie",
    label: "Pie / Donut",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 4, h: 4 },
    Renderer: PieChartWidget as ComponentType<WidgetProps>,
  },
  text: {
    type: "text",
    label: "Text (Markdown)",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 6, h: 3 },
    Renderer: TextWidget as ComponentType<WidgetProps>,
  },
  gauge: {
    type: "gauge",
    label: "Gauge",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 3, h: 3 },
    Renderer: GaugeWidget as ComponentType<WidgetProps>,
  },
  table: {
    type: "table",
    label: "Table",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: TableWidget as ComponentType<WidgetProps>,
  },
  scatter: {
    type: "scatter",
    label: "Scatter Plot",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: ScatterWidget as ComponentType<WidgetProps>,
  },
  histogram: {
    type: "histogram",
    label: "Histogram",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: HistogramWidget as ComponentType<WidgetProps>,
  },
  change: {
    type: "change",
    label: "Change",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 3, h: 3 },
    Renderer: ChangeWidget as ComponentType<WidgetProps>,
  },
  status: {
    type: "status",
    label: "Status",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 3, h: 3 },
    Renderer: StatusWidget as ComponentType<WidgetProps>,
  },
  geomap: {
    type: "geomap",
    label: "Geomap",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: GeomapWidget as ComponentType<WidgetProps>,
  },
  topology: {
    type: "topology",
    label: "Topology",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: TopologyWidget as ComponentType<WidgetProps>,
  },
  slo_tracker: {
    type: "slo_tracker",
    label: "SLO Tracker",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: SloTrackerWidget as ComponentType<WidgetProps>,
  },
  alert_list: {
    type: "alert_list",
    label: "Alert List",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 5 },
    Renderer: AlertListWidget as ComponentType<WidgetProps>,
  },
  log_stream: {
    type: "log_stream",
    label: "Log Stream",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: LogStreamWidget as ComponentType<WidgetProps>,
  },
  resource_inventory: {
    type: "resource_inventory",
    label: "Resource Inventory",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: ResourceInventoryWidget as ComponentType<WidgetProps>,
  },
  progress: {
    type: "progress",
    label: "Progress",
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 3, h: 3 },
    Renderer: ProgressWidget as ComponentType<WidgetProps>,
  },
  forecast_line: {
    type: "forecast_line",
    label: "Forecast",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: ForecastWidget as ComponentType<WidgetProps>,
  },
  diff_comparison: {
    type: "diff_comparison",
    label: "Diff Comparison",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 4 },
    Renderer: DiffComparisonWidget as ComponentType<WidgetProps>,
  },
  candlestick: {
    type: "candlestick",
    label: "Candlestick (OHLC)",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 4 },
    Renderer: CandlestickWidget as ComponentType<WidgetProps>,
  },
  calendar_heatmap: {
    type: "calendar_heatmap",
    label: "Calendar Heatmap",
    minSize: { w: 6, h: 3 },
    defaultSize: { w: 12, h: 4 },
    Renderer: CalendarHeatmapWidget as ComponentType<WidgetProps>,
  },
  bubble: {
    type: "bubble",
    label: "Bubble Chart",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: BubbleWidget as ComponentType<WidgetProps>,
  },
  hexbin_map: {
    type: "hexbin_map",
    label: "Hexbin Host Map",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: HexbinMapWidget as ComponentType<WidgetProps>,
  },
  heatmap: {
    type: "heatmap",
    label: "Heatmap",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: HeatmapWidget as ComponentType<WidgetProps>,
  },
  treemap: {
    type: "treemap",
    label: "Treemap",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: TreemapWidget as ComponentType<WidgetProps>,
  },
  sankey: {
    type: "sankey",
    label: "Sankey Flow",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: SankeyWidget as ComponentType<WidgetProps>,
  },
  sparkline_table: {
    type: "sparkline_table",
    label: "Sparkline Table",
    minSize: { w: 4, h: 3 },
    defaultSize: { w: 8, h: 5 },
    Renderer: SparklineTableWidget as ComponentType<WidgetProps>,
  },
  bar_gauge: {
    type: "bar_gauge",
    label: "Bar Gauge",
    minSize: { w: 3, h: 2 },
    defaultSize: { w: 6, h: 4 },
    Renderer: BarGaugeWidget as ComponentType<WidgetProps>,
  },
  radar: {
    type: "radar",
    label: "Radar / Spider",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 5 },
    Renderer: RadarWidget as ComponentType<WidgetProps>,
  },
  waterfall: {
    type: "waterfall",
    label: "Waterfall",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: WaterfallWidget as ComponentType<WidgetProps>,
  },
  box_plot: {
    type: "box_plot",
    label: "Box Plot",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: BoxPlotWidget as ComponentType<WidgetProps>,
  },
  funnel: {
    type: "funnel",
    label: "Funnel",
    minSize: { w: 3, h: 3 },
    defaultSize: { w: 6, h: 4 },
    Renderer: FunnelWidget as ComponentType<WidgetProps>,
  },
};

/**
 * Look up a widget definition by panel type.
 * Returns undefined for unknown types.
 */
export function getWidgetDefinition(type: PanelType): WidgetTypeDefinition | undefined {
  return WIDGET_REGISTRY[type];
}

/**
 * All panel types as options for dropdowns (type + label).
 * Derived from the registry so there is a single source of truth.
 */
export const PANEL_TYPE_OPTIONS: { value: PanelType; label: string }[] = Object.values(
  WIDGET_REGISTRY,
).map((def) => ({ value: def.type, label: def.label }));
