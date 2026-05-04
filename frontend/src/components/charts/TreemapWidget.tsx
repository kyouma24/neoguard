import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
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

interface TreemapLeaf {
  name: string;
  size: number;
  fill: string;
}

interface TreemapGroup {
  name: string;
  children: TreemapLeaf[];
}

type TreemapNode = TreemapLeaf | TreemapGroup;

function computeAverage(datapoints: [string, number | null][]): number {
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

function buildTreemapData(
  data: MetricQueryResult[],
  colors: string[],
  groupBy?: string,
): TreemapNode[] {
  const leaves: { name: string; size: number; group: string | undefined }[] = [];

  for (const series of data) {
    const avg = computeAverage(series.datapoints);
    if (avg <= 0) continue;

    const group = groupBy ? series.tags[groupBy] : undefined;
    leaves.push({ name: series.name, size: avg, group });
  }

  if (!groupBy) {
    return leaves.map((leaf, i) => ({
      name: leaf.name,
      size: leaf.size,
      fill: colors[i % colors.length],
    }));
  }

  const groups = new Map<string, TreemapLeaf[]>();
  let colorIndex = 0;

  for (const leaf of leaves) {
    const key = leaf.group ?? "Other";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push({
      name: leaf.name,
      size: leaf.size,
      fill: colors[colorIndex % colors.length],
    });
    colorIndex++;
  }

  const result: TreemapGroup[] = [];
  for (const [name, children] of groups) {
    result.push({ name, children });
  }
  return result;
}

interface CustomContentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  fill?: string;
  depth?: number;
}

function CustomContent({ x, y, width, height, name, fill, depth }: CustomContentProps) {
  if (width < 4 || height < 4) return null;

  const showLabel = width > 40 && height > 20;
  const isLeaf = (depth ?? 0) >= 1;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isLeaf ? (fill ?? "var(--color-primary)") : "transparent"}
        fillOpacity={isLeaf ? 0.85 : 0}
        stroke="var(--bg-primary)"
        strokeWidth={isLeaf ? 2 : 0}
        rx={2}
        ry={2}
      />
      {showLabel && isLeaf && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={Math.min(12, width / 8, height / 3)}
          style={{ pointerEvents: "none" }}
        >
          {name && name.length > width / 7
            ? name.slice(0, Math.floor(width / 7)) + "..."
            : name}
        </text>
      )}
    </g>
  );
}

interface TooltipPayloadEntry {
  payload?: {
    name?: string;
    size?: number;
  };
}

function CustomTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  unit?: PanelDisplayOptions["unit"];
}) {
  if (!active || !payload?.length) return null;

  const entry = payload[0]?.payload;
  if (!entry) return null;

  return (
    <div style={{ ...CHART_TOOLTIP_STYLE, padding: "6px 10px" }}>
      <div style={{ fontWeight: 500, marginBottom: 2 }}>{entry.name}</div>
      <div style={{ color: "var(--text-secondary)" }}>
        {formatValue(entry.size ?? 0, unit)}
      </div>
    </div>
  );
}

export function TreemapWidget({ data, height = 300, displayOptions }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const treemapCfg = displayOptions?.treemap;
  const groupBy = treemapCfg?.groupBy;
  const unit = displayOptions?.unit;

  const treeData = buildTreemapData(data, colors, groupBy);

  if (!treeData.length) {
    return <ChartEmptyState height={height} message="No positive values to display" />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={treeData}
        dataKey="size"
        nameKey="name"
        stroke="var(--bg-primary)"
        isAnimationActive={false}
        content={<CustomContent x={0} y={0} width={0} height={0} />}
      >
        <Tooltip
          content={<CustomTooltip unit={unit} />}
          cursor={false}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}
