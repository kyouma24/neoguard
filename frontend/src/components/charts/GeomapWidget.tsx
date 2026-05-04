import { useState, useCallback } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions, GeomapDisplayConfig } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

/**
 * Approximate [x, y] positions for AWS regions on a 1000x500 Mercator-like projection.
 * x: 0 (180W) to 1000 (180E), y: 0 (top/north) to 500 (bottom/south).
 */
const AWS_REGION_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
  // North America
  "us-east-1":      { x: 270, y: 165, label: "N. Virginia" },
  "us-east-2":      { x: 256, y: 155, label: "Ohio" },
  "us-west-1":      { x: 195, y: 165, label: "N. California" },
  "us-west-2":      { x: 195, y: 140, label: "Oregon" },
  "ca-central-1":   { x: 265, y: 130, label: "Canada (Central)" },
  "ca-west-1":      { x: 210, y: 120, label: "Calgary" },

  // South America
  "sa-east-1":      { x: 330, y: 360, label: "Sao Paulo" },

  // Europe
  "eu-west-1":      { x: 475, y: 120, label: "Ireland" },
  "eu-west-2":      { x: 498, y: 118, label: "London" },
  "eu-west-3":      { x: 507, y: 130, label: "Paris" },
  "eu-central-1":   { x: 520, y: 120, label: "Frankfurt" },
  "eu-central-2":   { x: 530, y: 130, label: "Zurich" },
  "eu-south-1":     { x: 520, y: 140, label: "Milan" },
  "eu-south-2":     { x: 495, y: 150, label: "Spain" },
  "eu-north-1":     { x: 530, y: 90, label: "Stockholm" },

  // Middle East
  "me-south-1":     { x: 600, y: 190, label: "Bahrain" },
  "me-central-1":   { x: 590, y: 185, label: "UAE" },
  "il-central-1":   { x: 570, y: 170, label: "Tel Aviv" },

  // Africa
  "af-south-1":     { x: 530, y: 380, label: "Cape Town" },

  // Asia Pacific
  "ap-south-1":     { x: 650, y: 200, label: "Mumbai" },
  "ap-south-2":     { x: 660, y: 210, label: "Hyderabad" },
  "ap-southeast-1": { x: 720, y: 255, label: "Singapore" },
  "ap-southeast-2": { x: 810, y: 380, label: "Sydney" },
  "ap-southeast-3": { x: 725, y: 245, label: "Jakarta" },
  "ap-southeast-4": { x: 800, y: 360, label: "Melbourne" },
  "ap-northeast-1": { x: 790, y: 160, label: "Tokyo" },
  "ap-northeast-2": { x: 775, y: 165, label: "Seoul" },
  "ap-northeast-3": { x: 785, y: 170, label: "Osaka" },
  "ap-east-1":      { x: 745, y: 195, label: "Hong Kong" },

  // China (operated by partners)
  "cn-north-1":     { x: 740, y: 155, label: "Beijing" },
  "cn-northwest-1": { x: 710, y: 160, label: "Ningxia" },
};

/**
 * Simplified continental outlines as SVG paths.
 * These are intentionally approximate -- enough to provide geographic context.
 */
const CONTINENT_PATHS = [
  // North America
  "M 155,55 L 190,50 220,55 260,50 280,55 290,80 300,95 285,100 290,120 " +
  "280,135 270,145 275,155 280,170 270,180 250,190 230,195 210,185 " +
  "200,175 195,160 185,155 175,140 170,120 160,100 155,80 Z",

  // Central America + Caribbean
  "M 230,195 L 240,200 250,210 260,215 255,225 245,230 240,225 230,215 225,205 Z",

  // South America
  "M 260,240 L 280,235 310,245 340,260 350,280 355,300 350,320 345,340 " +
  "335,360 320,375 305,385 290,380 280,365 275,340 270,315 265,290 260,265 Z",

  // Europe
  "M 470,55 L 490,50 510,45 530,50 545,55 550,65 555,75 550,85 " +
  "540,95 530,100 535,110 525,120 520,130 510,140 500,145 490,140 " +
  "480,130 475,115 468,100 465,80 470,65 Z",

  // Africa
  "M 480,155 L 500,150 520,155 540,160 555,170 565,185 570,205 " +
  "565,230 560,260 555,290 545,320 535,350 525,370 515,385 " +
  "505,380 495,365 490,340 485,310 480,280 478,250 475,220 " +
  "470,195 472,170 Z",

  // Asia (simplified)
  "M 555,50 L 580,45 610,40 650,35 690,40 720,45 750,50 770,55 " +
  "790,65 800,80 795,95 790,110 785,130 790,150 795,160 " +
  "785,170 770,175 755,180 740,185 730,195 720,210 710,200 " +
  "690,190 670,195 650,200 630,190 615,180 600,170 585,160 " +
  "570,145 560,125 555,105 550,85 552,65 Z",

  // Southeast Asia / Indonesia
  "M 700,225 L 720,220 735,230 750,240 760,250 740,255 720,250 705,240 Z",

  // Australia
  "M 770,330 L 800,320 830,325 845,340 840,360 830,375 810,385 " +
  "790,380 775,370 768,355 770,340 Z",
];

/** Region scope bounding boxes: [xMin, yMin, xMax, yMax] */
const SCOPE_VIEWBOXES: Record<string, [number, number, number, number]> = {
  world: [0, 0, 1000, 500],
  us:    [150, 80, 320, 220],
  eu:    [440, 40, 580, 170],
  ap:    [620, 80, 860, 420],
};

interface RegionMarker {
  region: string;
  label: string;
  x: number;
  y: number;
  value: number;
  seriesCount: number;
}

function aggregateByRegion(data: MetricQueryResult[]): RegionMarker[] {
  const regionMap = new Map<string, { sum: number; count: number }>();

  for (const series of data) {
    const region = series.tags["region"] ?? series.tags["aws_region"] ?? series.tags["azure_region"];
    if (!region) continue;

    const pos = AWS_REGION_POSITIONS[region];
    if (!pos) continue;

    // Take the last non-null value from the series
    const points = series.datapoints;
    let lastValue: number | null = null;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i][1] !== null) {
        lastValue = points[i][1];
        break;
      }
    }
    if (lastValue === null) continue;

    const existing = regionMap.get(region);
    if (existing) {
      existing.sum += lastValue;
      existing.count += 1;
    } else {
      regionMap.set(region, { sum: lastValue, count: 1 });
    }
  }

  const markers: RegionMarker[] = [];
  for (const [region, agg] of regionMap) {
    const pos = AWS_REGION_POSITIONS[region];
    if (!pos) continue;
    markers.push({
      region,
      label: pos.label,
      x: pos.x,
      y: pos.y,
      value: agg.sum,
      seriesCount: agg.count,
    });
  }

  return markers;
}

function defaultGradientColor(value: number, minVal: number, maxVal: number): string {
  if (maxVal === minVal) return "#22c55e";
  const ratio = Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal)));

  // Green (low) -> Yellow (mid) -> Red (high)
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(34 + t * (245 - 34));
    const g = Math.round(197 + t * (158 - 197));
    const b = Math.round(94 + t * (11 - 94));
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (ratio - 0.5) * 2;
    const r = Math.round(245 + t * (239 - 245));
    const g = Math.round(158 + t * (68 - 158));
    const b = Math.round(11 + t * (68 - 11));
    return `rgb(${r},${g},${b})`;
  }
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  marker: RegionMarker | null;
}

export function GeomapWidget({ data, height = 300, displayOptions }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    marker: null,
  });

  const geoCfg: GeomapDisplayConfig = displayOptions?.geomap ?? {};
  const mapStyle = geoCfg.mapStyle ?? "dark";
  const markerSizeMode = geoCfg.markerSize ?? "proportional";
  const regionScope = geoCfg.regionScope ?? "world";
  const showLabels = geoCfg.showLabels ?? false;
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;

  const markers = aggregateByRegion(data);

  if (markers.length === 0) {
    return <ChartEmptyState height={height} message="No region data available" />;
  }

  const allValues = markers.map((m) => m.value);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);

  const [vbX, vbY, vbW, vbH] = SCOPE_VIEWBOXES[regionScope] ?? SCOPE_VIEWBOXES.world;

  const MIN_RADIUS = 5;
  const MAX_RADIUS = 22;

  function getMarkerRadius(value: number): number {
    if (markerSizeMode === "fixed") return 10;
    if (maxVal === minVal) return (MIN_RADIUS + MAX_RADIUS) / 2;
    const ratio = (value - minVal) / (maxVal - minVal);
    return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
  }

  function getMarkerColor(value: number): string {
    if (thresholds?.steps?.length) {
      return getThresholdColor(value, thresholds.steps, thresholds.baseColor);
    }
    return defaultGradientColor(value, minVal, maxVal);
  }

  const bgColor = mapStyle === "light"
    ? "#e8ecf0"
    : mapStyle === "satellite"
      ? "#0c1929"
      : "#141a23";

  const landColor = mapStyle === "light"
    ? "#c8d0d8"
    : mapStyle === "satellite"
      ? "#1a2d45"
      : "#1e2530";

  const landStroke = mapStyle === "light"
    ? "#a0aab4"
    : mapStyle === "satellite"
      ? "#253a55"
      : "#2a323d";

  const gridColor = mapStyle === "light"
    ? "#d0d8e0"
    : mapStyle === "satellite"
      ? "#162238"
      : "#1a2028";

  const handleMouseEnter = useCallback((marker: RegionMarker, evt: React.MouseEvent) => {
    const svgRect = (evt.currentTarget as SVGElement).closest("svg")?.getBoundingClientRect();
    if (!svgRect) return;
    setTooltip({
      visible: true,
      x: evt.clientX - svgRect.left,
      y: evt.clientY - svgRect.top,
      marker,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false, marker: null }));
  }, []);

  return (
    <div style={{ height, position: "relative", overflow: "hidden" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        {/* Background */}
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill={bgColor} />

        {/* Grid lines (subtle lat/long) */}
        {regionScope === "world" && (
          <g stroke={gridColor} strokeWidth={0.5}>
            {/* Latitude lines */}
            {[100, 200, 250, 300, 400].map((y) => (
              <line key={`lat-${y}`} x1={0} y1={y} x2={1000} y2={y} />
            ))}
            {/* Longitude lines */}
            {[200, 400, 500, 600, 800].map((x) => (
              <line key={`lng-${x}`} x1={x} y1={0} x2={x} y2={500} />
            ))}
          </g>
        )}

        {/* Continental outlines */}
        {CONTINENT_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={landColor}
            stroke={landStroke}
            strokeWidth={0.8}
          />
        ))}

        {/* Region markers */}
        {markers.map((marker) => {
          const r = getMarkerRadius(marker.value);
          const color = getMarkerColor(marker.value);

          return (
            <g
              key={marker.region}
              onMouseEnter={(evt) => handleMouseEnter(marker, evt)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: "pointer" }}
            >
              {/* Glow effect */}
              <circle
                cx={marker.x}
                cy={marker.y}
                r={r + 4}
                fill={color}
                opacity={0.15}
              />
              {/* Outer ring */}
              <circle
                cx={marker.x}
                cy={marker.y}
                r={r}
                fill={color}
                opacity={0.3}
                stroke={color}
                strokeWidth={1.5}
              />
              {/* Inner dot */}
              <circle
                cx={marker.x}
                cy={marker.y}
                r={Math.max(3, r * 0.5)}
                fill={color}
                opacity={0.9}
              />
              {/* Optional label */}
              {showLabels && (
                <text
                  x={marker.x}
                  y={marker.y - r - 5}
                  textAnchor="middle"
                  fontSize={regionScope === "world" ? 8 : 10}
                  fill={mapStyle === "light" ? "#374151" : "#d1d5db"}
                  fontWeight={500}
                  style={{ pointerEvents: "none" }}
                >
                  {marker.region}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip overlay */}
      {tooltip.visible && tooltip.marker && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltip.x + 12, (typeof window !== "undefined" ? 250 : 250)),
            top: Math.max(0, tooltip.y - 10),
            background: "var(--bg-elevated, #1e1e2e)",
            border: "1px solid var(--border, #333)",
            borderRadius: "var(--radius-sm, 4px)",
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--text-primary, #e0e0e0)",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {tooltip.marker.label}
            <span style={{ fontWeight: 400, color: "var(--text-muted, #999)", marginLeft: 6 }}>
              {tooltip.marker.region}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: getMarkerColor(tooltip.marker.value),
              }}
            />
            <span style={{ fontWeight: 600 }}>
              {formatValue(tooltip.marker.value, unit)}
            </span>
          </div>
          {tooltip.marker.seriesCount > 1 && (
            <div style={{ color: "var(--text-muted, #999)", marginTop: 2 }}>
              {tooltip.marker.seriesCount} series
            </div>
          )}
        </div>
      )}
    </div>
  );
}
