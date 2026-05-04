import { Line, LineChart } from "recharts";
import type { BaseTimeChartProps } from "./charts/BaseTimeChart";
import { BaseTimeChart } from "./charts/BaseTimeChart";
import { seriesKey } from "./charts/useChartInteractions";

interface Props extends BaseTimeChartProps {
  /* no extra props */
}

export function TimeSeriesChart(props: Props) {
  return (
    <BaseTimeChart
      {...props}
      ChartComponent={LineChart as React.ComponentType<Record<string, unknown>>}
      renderSeries={({ data, colors, hiddenSeries, lineType, connectNulls }) =>
        data.map((series, i) => {
          const key = seriesKey(series);
          if (hiddenSeries.has(key)) return null;
          return (
            <Line
              key={key}
              type={lineType}
              dataKey={key}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={false}
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
            <Line
              key={compKey}
              type={lineType}
              dataKey={compKey}
              stroke={colors[i % colors.length]}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={false}
            />
          );
        })
      }
    />
  );
}
