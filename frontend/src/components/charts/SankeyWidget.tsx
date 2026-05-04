import { Sankey, Tooltip, ResponsiveContainer } from "recharts";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface SankeyNodeData {
  name: string;
  color: string;
}

interface SankeyLinkData {
  source: number;
  target: number;
  value: number;
  sourceName: string;
  targetName: string;
}

interface SankeyChartData {
  nodes: SankeyNodeData[];
  links: SankeyLinkData[];
}

interface CustomNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SankeyNodeData;
  containerWidth: number;
}

function CustomNode({ x, y, width, height, payload, containerWidth }: CustomNodeProps) {
  const isRight = x + width + 6 > containerWidth / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.color}
        rx={2}
        ry={2}
        opacity={0.9}
      />
      <text
        x={isRight ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isRight ? "end" : "start"}
        dominantBaseline="central"
        fill="var(--text-primary)"
        fontSize={11}
      >
        {payload.name}
      </text>
    </g>
  );
}

function averageValue(datapoints: [string, number | null][]): number {
  let sum = 0;
  let count = 0;
  for (const [, v] of datapoints) {
    if (v != null) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function buildSankeyData(
  data: MetricQueryResult[],
  sourceField: string,
  targetField: string,
): SankeyChartData {
  const nodeNames: string[] = [];
  const nodeIndex = new Map<string, number>();
  const links: SankeyLinkData[] = [];

  function getOrCreateNode(name: string): number {
    const existing = nodeIndex.get(name);
    if (existing !== undefined) return existing;
    const idx = nodeNames.length;
    nodeNames.push(name);
    nodeIndex.set(name, idx);
    return idx;
  }

  let hasTagBasedLinks = false;

  for (const series of data) {
    const sourceTag = series.tags[sourceField];
    const targetTag = series.tags[targetField];
    if (sourceTag && targetTag) {
      const srcIdx = getOrCreateNode(sourceTag);
      const tgtIdx = getOrCreateNode(targetTag);
      const value = averageValue(series.datapoints);
      if (value > 0) {
        links.push({
          source: srcIdx,
          target: tgtIdx,
          value,
          sourceName: sourceTag,
          targetName: targetTag,
        });
        hasTagBasedLinks = true;
      }
    }
  }

  // Fallback: when no source/target tags exist, build a single-level flow
  // using series names as targets from a common "all" source.
  if (!hasTagBasedLinks) {
    const rootIdx = getOrCreateNode("all");
    for (const series of data) {
      const value = averageValue(series.datapoints);
      if (value > 0) {
        const tgtIdx = getOrCreateNode(series.name);
        links.push({
          source: rootIdx,
          target: tgtIdx,
          value,
          sourceName: "all",
          targetName: series.name,
        });
      }
    }
  }

  const nodes: SankeyNodeData[] = nodeNames.map((name, i) => ({
    name,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return { nodes, links };
}

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

export function SankeyWidget({ data, height = 300, displayOptions }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const sankeyCfg = displayOptions?.sankey;
  const sourceField = sankeyCfg?.sourceField ?? "source";
  const targetField = sankeyCfg?.targetField ?? "target";
  const nodeWidth = sankeyCfg?.nodeWidth ?? 10;
  const nodePadding = sankeyCfg?.nodePadding ?? 20;
  const unit = displayOptions?.unit;

  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const chartData = buildSankeyData(data, sourceField, targetField);

  // Override node colors if a custom palette is provided
  for (let i = 0; i < chartData.nodes.length; i++) {
    chartData.nodes[i].color = colors[i % colors.length];
  }

  if (!chartData.links.length) {
    return <ChartEmptyState height={height} message="No flow data found" />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Sankey
        data={chartData}
        nodeWidth={nodeWidth}
        nodePadding={nodePadding}
        node={<CustomNode x={0} y={0} width={0} height={0} index={0} payload={{ name: "", color: "" }} containerWidth={0} />}
        link={{ stroke: "var(--border)", strokeOpacity: 0.4 }}
        margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
      >
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number) => formatValue(value, unit)}
          labelFormatter={(_label: string, payload: Array<{ payload?: SankeyLinkData }>) => {
            const item = payload?.[0]?.payload;
            if (item?.sourceName && item?.targetName) {
              return `${item.sourceName} → ${item.targetName}`;
            }
            return "";
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}
