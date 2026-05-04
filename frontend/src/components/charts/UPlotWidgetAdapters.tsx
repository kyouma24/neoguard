/**
 * Adapter components that bridge the WidgetProps interface to UPlotChart.
 * These are registered in the widget registry for `timeseries` and `area` panel types.
 *
 * The old Recharts-based TimeSeriesChart and AreaChart components are retained
 * in case they need to be referenced or used as fallback.
 */
import type { WidgetProps } from "./widgetRegistry";
import { UPlotChart } from "./UPlotChart";

/**
 * uPlot-based time series line chart widget.
 * Replaces the Recharts TimeSeriesChart for the `timeseries` panel type.
 */
export function UPlotTimeSeriesWidget({
  data,
  height,
  displayOptions,
  onTimeRangeChange,
  comparisonData,
  annotations,
  onAnnotate,
  alertEvents,
}: WidgetProps) {
  return (
    <UPlotChart
      data={data}
      height={height}
      displayOptions={displayOptions}
      mode="line"
      onTimeRangeChange={onTimeRangeChange}
      comparisonData={comparisonData}
      annotations={annotations}
      onAnnotate={onAnnotate}
      alertEvents={alertEvents}
    />
  );
}

/**
 * uPlot-based area chart widget.
 * Replaces the Recharts AreaChartWidget for the `area` panel type.
 */
export function UPlotAreaWidget({
  data,
  height,
  displayOptions,
  onTimeRangeChange,
  comparisonData,
  annotations,
  onAnnotate,
  alertEvents,
}: WidgetProps) {
  return (
    <UPlotChart
      data={data}
      height={height}
      displayOptions={displayOptions}
      mode="area"
      onTimeRangeChange={onTimeRangeChange}
      comparisonData={comparisonData}
      annotations={annotations}
      onAnnotate={onAnnotate}
      alertEvents={alertEvents}
    />
  );
}
