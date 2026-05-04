import { Area, AreaChart as RechartsAreaChart } from "recharts";
import type { BaseTimeChartProps } from "./BaseTimeChart";
import { BaseTimeChart } from "./BaseTimeChart";
import { seriesKey } from "./useChartInteractions";

interface Props extends BaseTimeChartProps {
  stacked?: boolean;
}

export function AreaChartWidget({ stacked = true, ...props }: Props) {
  const useGradient = props.displayOptions?.fillMode === "gradient";
  const fillOp = props.displayOptions?.fillOpacity ?? 0.3;

  return (
    <BaseTimeChart
      {...props}
      ChartComponent={RechartsAreaChart as React.ComponentType<Record<string, unknown>>}
      renderExtraDefs={useGradient ? ({ data, colors, fillOpacity }) => (
        <defs>
          {data.map((series, i) => {
            const key = seriesKey(series);
            return (
              <linearGradient key={`grad-${key}`} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={fillOpacity * 1.5} />
                <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
      ) : undefined}
      renderSeries={({ data, colors, hiddenSeries, lineType, connectNulls }) =>
        data.map((series, i) => {
          const key = seriesKey(series);
          if (hiddenSeries.has(key)) return null;
          return (
            <Area
              key={key}
              type={lineType}
              dataKey={key}
              stackId={stacked ? "stack" : undefined}
              stroke={colors[i % colors.length]}
              fill={useGradient ? `url(#grad-${key})` : colors[i % colors.length]}
              fillOpacity={useGradient ? 1 : fillOp}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={connectNulls}
            />
          );
        })
      }
      renderComparisonSeries={({ comparisonData, colors, hiddenSeries, lineType }) =>
        comparisonData.map((series, i) => {
          const key = seriesKey(series);
          const compKey = `__cmp__${key}`;
          if (hiddenSeries.has(key)) return null;
          return (
            <Area
              key={compKey}
              type={lineType}
              dataKey={compKey}
              stroke={colors[i % colors.length]}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.4}
              isAnimationActive={false}
            />
          );
        })
      }
    />
  );
}
