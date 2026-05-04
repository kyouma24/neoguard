import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions, TopologyDisplayConfig } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface TopologyNode {
  id: string;
  label: string;
  value: number | null;
  tags: Record<string, string>;
  x: number;
  y: number;
  radius: number;
  color: string;
  group?: string;
}

interface TopologyEdge {
  source: string;
  target: string;
}

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
}

const EDGE_TAG_KEYS = ["depends_on", "target", "upstream"];
const MIN_NODE_RADIUS = 14;
const MAX_NODE_RADIUS = 40;
const PADDING = 60;
const REPULSION_STRENGTH = 3000;
const ATTRACTION_STRENGTH = 0.01;
const DAMPING = 0.8;
const LAYOUT_ITERATIONS = 8;

function getLastValue(datapoints: [string, number | null][]): number | null {
  for (let i = datapoints.length - 1; i >= 0; i--) {
    if (datapoints[i][1] != null) return datapoints[i][1];
  }
  return null;
}

function buildGraph(
  data: MetricQueryResult[],
  topologyCfg: TopologyDisplayConfig | undefined,
  thresholds: PanelDisplayOptions["thresholds"],
  width: number,
  height: number,
): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  const nodeMap = new Map<string, TopologyNode>();
  const edges: TopologyEdge[] = [];
  const groupBy = topologyCfg?.groupBy;

  const values: number[] = [];
  for (const series of data) {
    const v = getLastValue(series.datapoints);
    if (v != null) values.push(Math.abs(v));
  }
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 1;
  const valRange = maxVal - minVal || 1;

  for (let i = 0; i < data.length; i++) {
    const series = data[i];
    const nodeId =
      Object.entries(series.tags)
        .filter(([k]) => !EDGE_TAG_KEYS.includes(k))
        .map(([k, v]) => `${k}:${v}`)
        .join(",") || series.name;

    const lastVal = getLastValue(series.datapoints);
    const absVal = lastVal != null ? Math.abs(lastVal) : 0;
    const normalizedSize =
      values.length > 0 ? (absVal - minVal) / valRange : 0.5;
    const radius =
      MIN_NODE_RADIUS + normalizedSize * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);

    let color: string;
    if (thresholds?.steps.length && lastVal != null) {
      color = getThresholdColor(lastVal, thresholds.steps, thresholds.baseColor);
    } else {
      color = DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    }

    const group = groupBy ? series.tags[groupBy] : undefined;

    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, {
        id: nodeId,
        label: series.tags["name"] ?? series.name,
        value: lastVal,
        tags: series.tags,
        x: PADDING + Math.random() * (width - 2 * PADDING),
        y: PADDING + Math.random() * (height - 2 * PADDING),
        radius,
        color,
        group,
      });
    }

    for (const edgeKey of EDGE_TAG_KEYS) {
      const targetId = series.tags[edgeKey];
      if (targetId) {
        edges.push({ source: nodeId, target: targetId });
      }
    }
  }

  const nodes = Array.from(nodeMap.values());
  return { nodes, edges };
}

function applyForceLayout(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  width: number,
  height: number,
): TopologyNode[] {
  if (nodes.length === 0) return nodes;
  if (nodes.length === 1) {
    return [{ ...nodes[0], x: width / 2, y: height / 2 }];
  }

  const positions = nodes.map((n) => ({ x: n.x, y: n.y, vx: 0, vy: 0 }));
  const idxMap = new Map<string, number>();
  nodes.forEach((n, i) => idxMap.set(n.id, i));

  for (let iter = 0; iter < LAYOUT_ITERATIONS; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;
        const force = REPULSION_STRENGTH / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        positions[i].vx += fx;
        positions[i].vy += fy;
        positions[j].vx -= fx;
        positions[j].vy -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const si = idxMap.get(edge.source);
      const ti = idxMap.get(edge.target);
      if (si == null || ti == null) continue;
      const dx = positions[ti].x - positions[si].x;
      const dy = positions[ti].y - positions[si].y;
      const fx = dx * ATTRACTION_STRENGTH;
      const fy = dy * ATTRACTION_STRENGTH;
      positions[si].vx += fx;
      positions[si].vy += fy;
      positions[ti].vx -= fx;
      positions[ti].vy -= fy;
    }

    // Update positions with damping and bounds
    for (let i = 0; i < positions.length; i++) {
      positions[i].vx *= DAMPING;
      positions[i].vy *= DAMPING;
      positions[i].x += positions[i].vx;
      positions[i].y += positions[i].vy;
      // Clamp to bounds
      positions[i].x = Math.max(
        PADDING,
        Math.min(width - PADDING, positions[i].x),
      );
      positions[i].y = Math.max(
        PADDING,
        Math.min(height - PADDING, positions[i].y),
      );
    }
  }

  return nodes.map((n, i) => ({
    ...n,
    x: positions[i].x,
    y: positions[i].y,
  }));
}

function applyCircularLayout(
  nodes: TopologyNode[],
  width: number,
  height: number,
): TopologyNode[] {
  if (nodes.length === 0) return nodes;
  if (nodes.length === 1) {
    return [{ ...nodes[0], x: width / 2, y: height / 2 }];
  }
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - PADDING;
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

function applyHierarchicalLayout(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  width: number,
  height: number,
): TopologyNode[] {
  if (nodes.length === 0) return nodes;
  if (nodes.length === 1) {
    return [{ ...nodes[0], x: width / 2, y: height / 2 }];
  }

  // Build adjacency for topological ordering
  const idSet = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    children.set(n.id, []);
  }
  for (const e of edges) {
    if (idSet.has(e.source) && idSet.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
      children.get(e.source)?.push(e.target);
    }
  }

  // BFS layers
  const layers: string[][] = [];
  const visited = new Set<string>();
  let queue = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  if (queue.length === 0) queue = [nodes[0].id];

  while (queue.length > 0) {
    const layer: string[] = [];
    const nextQueue: string[] = [];
    for (const id of queue) {
      if (visited.has(id)) continue;
      visited.add(id);
      layer.push(id);
      for (const child of children.get(id) ?? []) {
        if (!visited.has(child)) nextQueue.push(child);
      }
    }
    if (layer.length > 0) layers.push(layer);
    queue = nextQueue;
  }

  // Place unvisited nodes in the last layer
  const remaining = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (remaining.length > 0) layers.push(remaining);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const result: TopologyNode[] = [];
  const layerHeight = (height - 2 * PADDING) / Math.max(layers.length - 1, 1);

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const layerWidth = (width - 2 * PADDING) / Math.max(layer.length + 1, 1);
    for (let ni = 0; ni < layer.length; ni++) {
      const node = nodeMap.get(layer[ni]);
      if (node) {
        result.push({
          ...node,
          x: PADDING + layerWidth * (ni + 1),
          y: PADDING + layerHeight * li,
        });
      }
    }
  }

  return result;
}

function curvedPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Perpendicular offset for curvature
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = dist * 0.15;
  const cx = mx - (dy / dist) * offset;
  const cy = my + (dx / dist) * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export function TopologyWidget({ data, height = 400, displayOptions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const topologyCfg = displayOptions?.topology;
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const layout = topologyCfg?.layout ?? "force";
  const edgeStyle = topologyCfg?.edgeStyle ?? "curved";
  const showMetrics = topologyCfg?.showMetrics ?? true;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [tooltipInfo, setTooltipInfo] = useState<{
    x: number;
    y: number;
    node: TopologyNode;
  } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [nodePositions, setNodePositions] = useState<TopologyNode[]>([]);
  const [edges, setEdges] = useState<TopologyEdge[]>([]);
  const [layoutApplied, setLayoutApplied] = useState(false);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Build graph and apply layout
  useEffect(() => {
    const { nodes: rawNodes, edges: rawEdges } = buildGraph(
      data,
      topologyCfg,
      thresholds,
      containerWidth,
      height,
    );

    let positioned: TopologyNode[];
    switch (layout) {
      case "circular":
        positioned = applyCircularLayout(rawNodes, containerWidth, height);
        break;
      case "hierarchical":
        positioned = applyHierarchicalLayout(
          rawNodes,
          rawEdges,
          containerWidth,
          height,
        );
        break;
      case "force":
      default:
        positioned = applyForceLayout(
          rawNodes,
          rawEdges,
          containerWidth,
          height,
        );
        break;
    }

    setNodePositions(positioned);
    setEdges(rawEdges);
    setLayoutApplied(true);
  }, [data, topologyCfg, thresholds, containerWidth, height, layout]);

  // Node position lookup for edges
  const nodeMap = useMemo(() => {
    const m = new Map<string, TopologyNode>();
    for (const n of nodePositions) m.set(n.id, n);
    return m;
  }, [nodePositions]);

  // Connected node IDs for hover highlighting
  const connectedToHovered = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const connected = new Set<string>();
    connected.add(hoveredNodeId);
    for (const e of edges) {
      if (e.source === hoveredNodeId) connected.add(e.target);
      if (e.target === hoveredNodeId) connected.add(e.source);
    }
    return connected;
  }, [hoveredNodeId, edges]);

  // Drag handlers
  const handleMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.preventDefault();
      const node = nodeMap.get(nodeId);
      if (!node) return;
      const svgRect = (
        e.currentTarget as SVGElement
      ).ownerSVGElement?.getBoundingClientRect();
      if (!svgRect) return;
      setDragState({
        nodeId,
        offsetX: e.clientX - svgRect.left - node.x,
        offsetY: e.clientY - svgRect.top - node.y,
      });
    },
    [nodeMap],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const svgRect = e.currentTarget.getBoundingClientRect();
      const newX = Math.max(
        PADDING,
        Math.min(
          containerWidth - PADDING,
          e.clientX - svgRect.left - dragState.offsetX,
        ),
      );
      const newY = Math.max(
        PADDING,
        Math.min(height - PADDING, e.clientY - svgRect.top - dragState.offsetY),
      );
      setNodePositions((prev) =>
        prev.map((n) =>
          n.id === dragState.nodeId ? { ...n, x: newX, y: newY } : n,
        ),
      );
    },
    [dragState, containerWidth, height],
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Hover handlers
  const handleNodeEnter = useCallback(
    (node: TopologyNode, e: React.MouseEvent) => {
      setHoveredNodeId(node.id);
      const svgRect = (
        e.currentTarget as SVGElement
      ).ownerSVGElement?.getBoundingClientRect();
      if (svgRect) {
        setTooltipInfo({
          x: e.clientX - svgRect.left,
          y: e.clientY - svgRect.top,
          node,
        });
      }
    },
    [],
  );

  const handleNodeLeave = useCallback(() => {
    setHoveredNodeId(null);
    setTooltipInfo(null);
  }, []);

  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  if (!layoutApplied) {
    return (
      <div
        ref={containerRef}
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Calculating layout...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height, position: "relative", overflow: "hidden" }}
    >
      <svg
        width="100%"
        height={height}
        style={{ cursor: dragState ? "grabbing" : "default" }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Edges */}
        {edges.map((edge, i) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);
          if (!sourceNode || !targetNode) return null;

          const isHighlighted =
            hoveredNodeId != null &&
            (edge.source === hoveredNodeId || edge.target === hoveredNodeId);
          const isDimmed = hoveredNodeId != null && !isHighlighted;

          if (edgeStyle === "curved") {
            return (
              <path
                key={`edge-${i}`}
                d={curvedPath(
                  sourceNode.x,
                  sourceNode.y,
                  targetNode.x,
                  targetNode.y,
                )}
                fill="none"
                stroke={
                  isHighlighted
                    ? "var(--color-primary, #635bff)"
                    : "var(--border)"
                }
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isDimmed ? 0.15 : isHighlighted ? 0.9 : 0.4}
                markerEnd={isHighlighted ? "url(#arrowhead-active)" : "url(#arrowhead)"}
              />
            );
          }

          return (
            <line
              key={`edge-${i}`}
              x1={sourceNode.x}
              y1={sourceNode.y}
              x2={targetNode.x}
              y2={targetNode.y}
              stroke={
                isHighlighted
                  ? "var(--color-primary, #635bff)"
                  : "var(--border)"
              }
              strokeWidth={isHighlighted ? 2 : 1}
              strokeOpacity={isDimmed ? 0.15 : isHighlighted ? 0.9 : 0.4}
              markerEnd={isHighlighted ? "url(#arrowhead-active)" : "url(#arrowhead)"}
            />
          );
        })}

        {/* Arrow marker definitions */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill="var(--border)"
              fillOpacity="0.4"
            />
          </marker>
          <marker
            id="arrowhead-active"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill="var(--color-primary, #635bff)"
              fillOpacity="0.9"
            />
          </marker>
        </defs>

        {/* Nodes */}
        {nodePositions.map((node) => {
          const isHovered = hoveredNodeId === node.id;
          const isConnected = connectedToHovered.has(node.id);
          const isDimmed = hoveredNodeId != null && !isConnected;

          return (
            <g
              key={node.id}
              style={{ cursor: dragState?.nodeId === node.id ? "grabbing" : "grab" }}
              onMouseDown={(e) => handleMouseDown(node.id, e)}
              onMouseEnter={(e) => handleNodeEnter(node, e)}
              onMouseLeave={handleNodeLeave}
            >
              {/* Glow ring on hover */}
              {isHovered && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius + 4}
                  fill="none"
                  stroke={node.color}
                  strokeWidth={2}
                  strokeOpacity={0.3}
                />
              )}

              {/* Main circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill={node.color}
                fillOpacity={isDimmed ? 0.2 : 0.85}
                stroke={isHovered ? node.color : "var(--bg-primary, #1a1a2e)"}
                strokeWidth={isHovered ? 2.5 : 1.5}
              />

              {/* Metric value inside node */}
              {showMetrics && node.value != null && node.radius >= 18 && (
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  fontSize={Math.max(9, Math.min(12, node.radius * 0.45))}
                  fontWeight={600}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {formatValue(node.value, unit)}
                </text>
              )}

              {/* Label below node */}
              <text
                x={node.x}
                y={node.y + node.radius + 14}
                textAnchor="middle"
                dominantBaseline="central"
                fill={isDimmed ? "var(--text-muted)" : "var(--text-primary)"}
                fontSize={11}
                fontWeight={isHovered ? 600 : 400}
                style={{ pointerEvents: "none", userSelect: "none" }}
                opacity={isDimmed ? 0.3 : 1}
              >
                {node.label.length > 20
                  ? node.label.slice(0, 18) + "..."
                  : node.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltipInfo && (
        <div
          style={{
            position: "absolute",
            left: tooltipInfo.x + 16,
            top: tooltipInfo.y - 10,
            background: "var(--bg-secondary, #1e1e38)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm, 4px)",
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--text-primary)",
            pointerEvents: "none",
            zIndex: 10,
            maxWidth: 260,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              marginBottom: 4,
              color: tooltipInfo.node.color,
            }}
          >
            {tooltipInfo.node.label}
          </div>
          {tooltipInfo.node.value != null && (
            <div style={{ marginBottom: 2 }}>
              Value: {formatValue(tooltipInfo.node.value, unit)}
            </div>
          )}
          {Object.entries(tooltipInfo.node.tags).length > 0 && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTop: "1px solid var(--border)",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              {Object.entries(tooltipInfo.node.tags).map(([k, v]) => (
                <div key={k}>
                  <span style={{ opacity: 0.7 }}>{k}:</span> {v}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
