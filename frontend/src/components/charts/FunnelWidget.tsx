import {
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface FunnelStage {
  name: string;
  value: number;
  percentage: number;
  dropoff: number;
}

function computeAverage(datapoints: [string, number | null][]): number {
  const values = datapoints
    .map(([, v]) => v)
    .filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function FunnelWidget({ data, height = 300, displayOptions }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const cfg = displayOptions?.funnel;
  const showPercentage = cfg?.showPercentage ?? true;
  const showDifference = cfg?.showDifference ?? false;
  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const unit = displayOptions?.unit;

  // Build stages from series, sorted by value descending (widest at top)
  const rawStages = data.map((series) => {
    const tags = Object.entries(series.tags)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    return {
      name: tags || series.name,
      value: computeAverage(series.datapoints),
    };
  });

  rawStages.sort((a, b) => b.value - a.value);

  const firstValue = rawStages[0]?.value ?? 0;

  const stages: FunnelStage[] = rawStages.map((stage, i) => {
    const percentage = firstValue > 0 ? (stage.value / firstValue) * 100 : 0;
    const prevValue = i > 0 ? rawStages[i - 1].value : stage.value;
    const dropoff = prevValue > 0 ? ((prevValue - stage.value) / prevValue) * 100 : 0;
    return {
      name: stage.name,
      value: Math.round(stage.value * 100) / 100,
      percentage: Math.round(percentage * 10) / 10,
      dropoff: Math.round(dropoff * 10) / 10,
    };
  });

  if (!stages.length || stages.every((s) => s.value === 0)) {
    return <ChartEmptyState height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <FunnelChart margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number, _name: string, entry: { payload?: FunnelStage }) => {
            const stage = entry.payload;
            if (!stage) return [formatValue(value, unit), ""];
            const parts: string[] = [formatValue(value, unit)];
            if (showPercentage) {
              parts.push(`(${stage.percentage}% of total)`);
            }
            if (showDifference && stage.dropoff > 0) {
              parts.push(`↓ ${stage.dropoff}% drop`);
            }
            return [parts.join(" "), stage.name];
          }}
        />
        <Funnel
          dataKey="value"
          data={stages}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="name"
            position="right"
            style={{
              fill: "var(--text-primary)",
              fontSize: 12,
              fontWeight: 500,
            }}
            formatter={(name: string) => {
              const stage = stages.find((s) => s.name === name);
              if (!stage) return name;
              const label = name.length > 20 ? name.slice(0, 18) + "…" : name;
              const valuePart = formatValue(stage.value, unit);
              const pctPart = showPercentage ? ` (${stage.percentage}%)` : "";
              return `${label}: ${valuePart}${pctPart}`;
            }}
          />
          {stages.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.85} />
          ))}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
