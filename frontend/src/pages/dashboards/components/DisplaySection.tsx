import { useState } from "react";
import type { PanelType } from "../../../types";
import type {
  PanelDisplayOptions,
  UnitCategory,
  DataTransform,
  ThresholdStep,
  LegendPosition,
  LegendMode,
  LegendColumn,
  YAxisScale,
  StatColorMode,
  StatTextSize,
  ValueMapping,
  DataLink,
  SeriesColorOverride,
  YAxisRightConfig,
  HexbinDisplayConfig,
  HeatmapDisplayConfig,
  TreemapDisplayConfig,
  GeomapDisplayConfig,
  SankeyDisplayConfig,
  TopologyDisplayConfig,
  SparklineTableDisplayConfig,
  BarGaugeDisplayConfig,
  RadarDisplayConfig,
  CandlestickDisplayConfig,
  CalendarHeatmapDisplayConfig,
  BubbleDisplayConfig,
  WaterfallDisplayConfig,
  BoxPlotDisplayConfig,
  FunnelDisplayConfig,
  SloTrackerDisplayConfig,
  AlertListDisplayConfig,
  LogStreamDisplayConfig,
  ResourceInventoryDisplayConfig,
  ProgressDisplayConfig,
  ForecastDisplayConfig,
  DiffComparisonDisplayConfig,
  AnomalyConfig,
} from "../../../types/display-options";
import { UNIT_CATEGORIES, THRESHOLD_COLORS, DATA_TRANSFORM_OPTIONS } from "../../../types/display-options";
import { Input, NativeSelect } from "../../../design-system";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

interface Props {
  panelType: PanelType;
  displayOptions: PanelDisplayOptions;
  onChange: (opts: PanelDisplayOptions) => void;
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div style={{ padding: "0 0 12px 0", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>}
    </div>
  );
}

export function DisplaySection({ panelType, displayOptions, onChange }: Props) {
  const update = (partial: Partial<PanelDisplayOptions>) => onChange({ ...displayOptions, ...partial });

  const showLegend = ["timeseries", "area"].includes(panelType);
  const showYAxis = ["timeseries", "area", "scatter"].includes(panelType);
  const showStat = panelType === "stat";
  const showGauge = panelType === "gauge";
  const showTable = panelType === "table";
  const showHistogram = panelType === "histogram";
  const showPie = panelType === "pie";
  const showValueMappings = ["stat", "gauge", "table", "status"].includes(panelType);
  const showDataLinks = ["timeseries", "area"].includes(panelType);
  const showColorOverrides = ["timeseries", "area"].includes(panelType);
  const showTransform = ["timeseries", "area", "stat"].includes(panelType);

  return (
    <div>
      {showTransform && (
        <CollapsibleSection title="Transform" defaultOpen={!!displayOptions.transform && displayOptions.transform !== "none"}>
          <NativeSelect
            label="Data Transform"
            options={DATA_TRANSFORM_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
            value={displayOptions.transform ?? "none"}
            onChange={(v) => update({ transform: v as DataTransform })}
          />
          {displayOptions.transform && displayOptions.transform !== "none" && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Transform is applied at display time after data is fetched.
            </div>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Unit" defaultOpen>
        <NativeSelect
          label="Format"
          options={UNIT_CATEGORIES.map((c) => ({ value: c.value, label: `${c.group} - ${c.label}` }))}
          value={displayOptions.unit?.category ?? "none"}
          onChange={(v) => update({ unit: { ...displayOptions.unit, category: v as UnitCategory } })}
        />
        {displayOptions.unit?.category === "custom" && (
          <Input
            label="Custom suffix"
            value={displayOptions.unit?.customSuffix ?? ""}
            onChange={(e) => update({ unit: { ...displayOptions.unit!, customSuffix: e.target.value } })}
            placeholder="e.g., items"
          />
        )}
        <Input
          label="Decimal places"
          type="number"
          min={0}
          max={10}
          value={displayOptions.unit?.decimals ?? 2}
          onChange={(e) => update({ unit: { ...displayOptions.unit!, category: displayOptions.unit?.category ?? "none", decimals: parseInt(e.target.value) || 2 } })}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Thresholds">
        <ThresholdEditor
          steps={displayOptions.thresholds?.steps ?? []}
          showLines={displayOptions.thresholds?.showLines ?? false}
          showBands={displayOptions.thresholds?.showBands ?? false}
          baseColor={displayOptions.thresholds?.baseColor}
          onChange={(thresholds) => update({ thresholds: { mode: "absolute", ...thresholds } })}
        />
      </CollapsibleSection>

      {showLegend && (
        <CollapsibleSection title="Legend">
          <NativeSelect
            label="Position"
            options={[
              { value: "bottom", label: "Bottom" },
              { value: "right", label: "Right" },
              { value: "hidden", label: "Hidden" },
            ]}
            value={displayOptions.legend?.position ?? "bottom"}
            onChange={(v) => update({ legend: { ...displayOptions.legend, mode: displayOptions.legend?.mode ?? "list", position: v as LegendPosition } })}
          />
          <NativeSelect
            label="Mode"
            options={[
              { value: "list", label: "List" },
              { value: "table", label: "Table (with values)" },
            ]}
            value={displayOptions.legend?.mode ?? "list"}
            onChange={(v) => update({ legend: { ...displayOptions.legend, position: displayOptions.legend?.position ?? "bottom", mode: v as LegendMode } })}
          />
          {(displayOptions.legend?.mode ?? "list") === "table" && (
            <>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginTop: 4 }}>Columns</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["last", "avg", "min", "max", "total"] as LegendColumn[]).map((col) => {
                  const current = displayOptions.legend?.columns ?? ["last", "avg", "min", "max"];
                  const checked = current.includes(col);
                  return (
                    <label key={col} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...current, col] : current.filter((c) => c !== col);
                          update({ legend: { ...displayOptions.legend, position: displayOptions.legend?.position ?? "bottom", mode: "table", columns: next as LegendColumn[] } });
                        }}
                      />
                      {col.charAt(0).toUpperCase() + col.slice(1)}
                    </label>
                  );
                })}
              </div>
              <NativeSelect
                label="Sort by"
                options={[
                  { value: "name", label: "Name" },
                  { value: "last", label: "Last" },
                  { value: "avg", label: "Avg" },
                  { value: "min", label: "Min" },
                  { value: "max", label: "Max" },
                  { value: "total", label: "Total" },
                ]}
                value={displayOptions.legend?.sortBy ?? "name"}
                onChange={(v) => update({ legend: { ...displayOptions.legend, position: displayOptions.legend?.position ?? "bottom", mode: "table", sortBy: v as "name" | LegendColumn } })}
              />
              <NativeSelect
                label="Sort direction"
                options={[
                  { value: "asc", label: "Ascending" },
                  { value: "desc", label: "Descending" },
                ]}
                value={displayOptions.legend?.sortDirection ?? "asc"}
                onChange={(v) => update({ legend: { ...displayOptions.legend, position: displayOptions.legend?.position ?? "bottom", mode: "table", sortDirection: v as "asc" | "desc" } })}
              />
            </>
          )}
        </CollapsibleSection>
      )}

      {showYAxis && (
        <CollapsibleSection title="Y-Axis">
          <NativeSelect
            label="Scale"
            options={[
              { value: "linear", label: "Linear" },
              { value: "log", label: "Logarithmic" },
            ]}
            value={displayOptions.yAxis?.scale ?? "linear"}
            onChange={(v) => update({ yAxis: { ...displayOptions.yAxis, scale: v as YAxisScale } })}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input
              label="Min"
              value={displayOptions.yAxis?.min === "auto" || displayOptions.yAxis?.min == null ? "" : String(displayOptions.yAxis.min)}
              onChange={(e) => {
                const val = e.target.value.trim();
                update({ yAxis: { ...displayOptions.yAxis, min: val === "" ? "auto" : Number(val) } });
              }}
              placeholder="Auto"
            />
            <Input
              label="Max"
              value={displayOptions.yAxis?.max === "auto" || displayOptions.yAxis?.max == null ? "" : String(displayOptions.yAxis.max)}
              onChange={(e) => {
                const val = e.target.value.trim();
                update({ yAxis: { ...displayOptions.yAxis, max: val === "" ? "auto" : Number(val) } });
              }}
              placeholder="Auto"
            />
          </div>
        </CollapsibleSection>
      )}

      {showYAxis && (
        <CollapsibleSection title="Right Y-Axis">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.yAxis?.right?.enabled ?? false}
              onChange={(e) => {
                const right: YAxisRightConfig = {
                  ...(displayOptions.yAxis?.right ?? { enabled: false }),
                  enabled: e.target.checked,
                };
                update({ yAxis: { ...displayOptions.yAxis, right } });
              }}
            />
            Enable right Y-axis
          </label>
          {displayOptions.yAxis?.right?.enabled && (
            <>
              <NativeSelect
                label="Unit"
                options={UNIT_CATEGORIES.map((c) => ({ value: c.value, label: `${c.group} - ${c.label}` }))}
                value={displayOptions.yAxis?.right?.unit?.category ?? "none"}
                onChange={(v) => {
                  const right: YAxisRightConfig = {
                    ...displayOptions.yAxis!.right!,
                    unit: { ...displayOptions.yAxis?.right?.unit, category: v as import("../../../types/display-options").UnitCategory },
                  };
                  update({ yAxis: { ...displayOptions.yAxis, right } });
                }}
              />
              <Input
                label="Label"
                value={displayOptions.yAxis?.right?.label ?? ""}
                onChange={(e) => {
                  const right: YAxisRightConfig = {
                    ...displayOptions.yAxis!.right!,
                    label: e.target.value || undefined,
                  };
                  update({ yAxis: { ...displayOptions.yAxis, right } });
                }}
                placeholder="Axis label"
              />
              <NativeSelect
                label="Scale"
                options={[
                  { value: "linear", label: "Linear" },
                  { value: "log", label: "Logarithmic" },
                ]}
                value={displayOptions.yAxis?.right?.scale ?? "linear"}
                onChange={(v) => {
                  const right: YAxisRightConfig = {
                    ...displayOptions.yAxis!.right!,
                    scale: v as YAxisScale,
                  };
                  update({ yAxis: { ...displayOptions.yAxis, right } });
                }}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                All series use the left axis by default. Per-series axis assignment is planned for a future release.
              </div>
            </>
          )}
        </CollapsibleSection>
      )}

      {showStat && (
        <CollapsibleSection title="Stat Options" defaultOpen>
          <NativeSelect
            label="Color Mode"
            options={[
              { value: "value", label: "Value color" },
              { value: "background", label: "Background color" },
              { value: "none", label: "No threshold color" },
            ]}
            value={displayOptions.stat?.colorMode ?? "value"}
            onChange={(v) => update({ stat: { ...displayOptions.stat, colorMode: v as StatColorMode } })}
          />
          <NativeSelect
            label="Text Size"
            options={[
              { value: "sm", label: "Small" },
              { value: "md", label: "Medium" },
              { value: "lg", label: "Large" },
              { value: "xl", label: "Extra Large" },
            ]}
            value={displayOptions.stat?.textSize ?? "md"}
            onChange={(v) => update({ stat: { ...displayOptions.stat, textSize: v as StatTextSize } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.stat?.showSparkline ?? true}
              onChange={(e) => update({ stat: { ...displayOptions.stat, showSparkline: e.target.checked } })}
            />
            Show sparkline
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.stat?.showDelta ?? true}
              onChange={(e) => update({ stat: { ...displayOptions.stat, showDelta: e.target.checked } })}
            />
            Show delta
          </label>
        </CollapsibleSection>
      )}

      {showGauge && (
        <CollapsibleSection title="Gauge Options" defaultOpen>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input
              label="Min"
              type="number"
              value={displayOptions.gauge?.min ?? 0}
              onChange={(e) => update({ gauge: { ...displayOptions.gauge, min: Number(e.target.value) } })}
            />
            <Input
              label="Max"
              type="number"
              value={displayOptions.gauge?.max ?? 100}
              onChange={(e) => update({ gauge: { ...displayOptions.gauge, max: Number(e.target.value) } })}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.gauge?.showTicks ?? true}
              onChange={(e) => update({ gauge: { ...displayOptions.gauge, showTicks: e.target.checked } })}
            />
            Show tick marks
          </label>
        </CollapsibleSection>
      )}

      {showTable && (
        <CollapsibleSection title="Table Options" defaultOpen>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.table?.showTags ?? true}
              onChange={(e) => update({ table: { ...displayOptions.table, showTags: e.target.checked } })}
            />
            Show tag columns
          </label>
          <Input
            label="Page size"
            type="number"
            min={5}
            max={100}
            value={displayOptions.table?.pageSize ?? 25}
            onChange={(e) => update({ table: { ...displayOptions.table, pageSize: parseInt(e.target.value) || 25 } })}
          />
        </CollapsibleSection>
      )}

      {showHistogram && (
        <CollapsibleSection title="Histogram Options" defaultOpen>
          <Input
            label="Number of buckets"
            type="number"
            min={5}
            max={100}
            value={displayOptions.histogram?.buckets ?? 20}
            onChange={(e) => update({ histogram: { ...displayOptions.histogram, buckets: parseInt(e.target.value) || 20 } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.histogram?.cumulative ?? false}
              onChange={(e) => update({ histogram: { ...displayOptions.histogram, cumulative: e.target.checked } })}
            />
            Cumulative histogram
          </label>
        </CollapsibleSection>
      )}

      {["timeseries", "area"].includes(panelType) && (
        <CollapsibleSection title="Line Style">
          <NativeSelect
            label="Interpolation"
            options={[
              { value: "linear", label: "Linear" },
              { value: "monotone", label: "Smooth (monotone)" },
              { value: "stepBefore", label: "Step (before)" },
              { value: "stepAfter", label: "Step (after)" },
              { value: "natural", label: "Natural" },
            ]}
            value={displayOptions.lineInterpolation ?? "monotone"}
            onChange={(v) => update({ lineInterpolation: v as PanelDisplayOptions["lineInterpolation"] })}
          />
          <NativeSelect
            label="Null Handling"
            options={[
              { value: "gap", label: "Leave gaps" },
              { value: "connect", label: "Connect non-null points" },
              { value: "zero", label: "Treat as zero" },
            ]}
            value={displayOptions.nullHandling ?? "gap"}
            onChange={(v) => update({ nullHandling: v as "connect" | "gap" | "zero" })}
          />
          <NativeSelect
            label="Stacking"
            options={[
              { value: "none", label: "None" },
              { value: "normal", label: "Normal (cumulative)" },
              { value: "percent", label: "Percent (100% stacked)" },
            ]}
            value={displayOptions.stackingMode ?? "none"}
            onChange={(v) => update({ stackingMode: v as "none" | "normal" | "percent" })}
          />
          {panelType === "area" && (
            <>
              <NativeSelect
                label="Fill Mode"
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "gradient", label: "Gradient" },
                ]}
                value={displayOptions.fillMode ?? "solid"}
                onChange={(v) => update({ fillMode: v as "solid" | "gradient" })}
              />
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Fill Opacity: {(displayOptions.fillOpacity ?? 0.3).toFixed(1)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={displayOptions.fillOpacity ?? 0.3}
                  onChange={(e) => update({ fillOpacity: parseFloat(e.target.value) })}
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>
            </>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Time Override">
        <NativeSelect
          label="Time Range"
          options={[
            { value: "", label: "Use dashboard time" },
            { value: "5m", label: "Last 5 min" },
            { value: "15m", label: "Last 15 min" },
            { value: "1h", label: "Last 1 hour" },
            { value: "4h", label: "Last 4 hours" },
            { value: "12h", label: "Last 12 hours" },
            { value: "24h", label: "Last 24 hours" },
            { value: "3d", label: "Last 3 days" },
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
          ]}
          value={displayOptions.timeRangeOverride?.range ?? ""}
          onChange={(v) => {
            if (!v) {
              update({ timeRangeOverride: undefined });
            } else {
              update({ timeRangeOverride: { range: v } });
            }
          }}
        />
        {displayOptions.timeRangeOverride?.range && (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            This panel will use its own time range instead of the dashboard time.
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Colors">
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          Custom palette (comma-separated hex colors)
        </div>
        <Input
          value={displayOptions.colors?.palette?.join(", ") ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (!raw.trim()) {
              update({ colors: undefined });
              return;
            }
            const palette = raw.split(",").map((c) => c.trim()).filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c));
            if (palette.length > 0) {
              update({ colors: { ...displayOptions.colors, palette } });
            }
          }}
          placeholder="#635bff, #22c55e, #f59e0b..."
        />
      </CollapsibleSection>

      {showColorOverrides && (
        <CollapsibleSection title="Series Color Overrides">
          <SeriesColorOverrideEditor
            overrides={displayOptions.colors?.overrides ?? []}
            onChange={(overrides) => update({ colors: { ...displayOptions.colors, overrides } })}
          />
        </CollapsibleSection>
      )}

      {showPie && (
        <CollapsibleSection title="Pie Options" defaultOpen>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.showLabels ?? false}
              onChange={(e) => update({ showLabels: e.target.checked })}
            />
            Show labels
          </label>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Donut width: {displayOptions.donutWidth ?? 40}%
            </label>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={displayOptions.donutWidth ?? 40}
              onChange={(e) => update({ donutWidth: parseInt(e.target.value) })}
              style={{ width: "100%", cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
              <span>Pie (0%)</span>
              <span>Donut (90%)</span>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {showValueMappings && (
        <CollapsibleSection title="Value Mappings">
          <ValueMappingEditor
            mappings={displayOptions.valueMappings ?? []}
            onChange={(mappings) => update({ valueMappings: mappings.length > 0 ? mappings : undefined })}
          />
        </CollapsibleSection>
      )}

      {showDataLinks && (
        <CollapsibleSection title="Data Links">
          <DataLinkEditor
            links={displayOptions.dataLinks ?? []}
            onChange={(links) => update({ dataLinks: links.length > 0 ? links : undefined })}
          />
        </CollapsibleSection>
      )}

      {panelType === "hexbin_map" && (
        <CollapsibleSection title="Hexbin Map Options" defaultOpen>
          <Input
            label="Group by tag"
            value={displayOptions.hexbin?.groupBy ?? ""}
            onChange={(e) => update({ hexbin: { ...displayOptions.hexbin, groupBy: e.target.value || undefined } as HexbinDisplayConfig })}
            placeholder="e.g., region"
          />
          <Input
            label="Hex size"
            type="number"
            min={8}
            max={128}
            value={displayOptions.hexbin?.hexSize ?? 32}
            onChange={(e) => update({ hexbin: { ...displayOptions.hexbin, hexSize: parseInt(e.target.value) || 32 } as HexbinDisplayConfig })}
          />
          <Input
            label="Color metric"
            value={displayOptions.hexbin?.colorMetric ?? ""}
            onChange={(e) => update({ hexbin: { ...displayOptions.hexbin, colorMetric: e.target.value || undefined } as HexbinDisplayConfig })}
            placeholder="Metric for hex color"
          />
        </CollapsibleSection>
      )}

      {panelType === "heatmap" && (
        <CollapsibleSection title="Heatmap Options" defaultOpen>
          <Input
            label="Bucket count"
            type="number"
            min={5}
            max={50}
            value={displayOptions.heatmap?.bucketCount ?? 10}
            onChange={(e) => update({ heatmap: { ...displayOptions.heatmap, bucketCount: parseInt(e.target.value) || 10 } as HeatmapDisplayConfig })}
          />
          <NativeSelect
            label="Color scheme"
            options={[
              { value: "greens", label: "Greens" },
              { value: "blues", label: "Blues" },
              { value: "reds", label: "Reds" },
              { value: "purples", label: "Purples" },
              { value: "oranges", label: "Oranges" },
              { value: "viridis", label: "Viridis" },
              { value: "inferno", label: "Inferno" },
              { value: "plasma", label: "Plasma" },
            ]}
            value={displayOptions.heatmap?.colorScheme ?? "greens"}
            onChange={(v) => update({ heatmap: { ...displayOptions.heatmap, colorScheme: v as HeatmapDisplayConfig["colorScheme"] } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.heatmap?.showCellValues ?? false}
              onChange={(e) => update({ heatmap: { ...displayOptions.heatmap, showCellValues: e.target.checked } as HeatmapDisplayConfig })}
            />
            Show cell values
          </label>
        </CollapsibleSection>
      )}

      {panelType === "treemap" && (
        <CollapsibleSection title="Treemap Options" defaultOpen>
          <Input
            label="Group by tag"
            value={displayOptions.treemap?.groupBy ?? ""}
            onChange={(e) => update({ treemap: { ...displayOptions.treemap, groupBy: e.target.value || undefined } as TreemapDisplayConfig })}
            placeholder="e.g., service"
          />
          <Input
            label="Max depth"
            type="number"
            min={1}
            max={5}
            value={displayOptions.treemap?.maxDepth ?? 2}
            onChange={(e) => update({ treemap: { ...displayOptions.treemap, maxDepth: parseInt(e.target.value) || 2 } as TreemapDisplayConfig })}
          />
        </CollapsibleSection>
      )}

      {panelType === "geomap" && (
        <CollapsibleSection title="Geomap Options" defaultOpen>
          <NativeSelect
            label="Map style"
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "satellite", label: "Satellite" },
            ]}
            value={displayOptions.geomap?.mapStyle ?? "dark"}
            onChange={(v) => update({ geomap: { ...displayOptions.geomap, mapStyle: v as GeomapDisplayConfig["mapStyle"] } })}
          />
          <NativeSelect
            label="Marker size"
            options={[
              { value: "fixed", label: "Fixed" },
              { value: "proportional", label: "Proportional" },
            ]}
            value={displayOptions.geomap?.markerSize ?? "fixed"}
            onChange={(v) => update({ geomap: { ...displayOptions.geomap, markerSize: v as GeomapDisplayConfig["markerSize"] } })}
          />
          <NativeSelect
            label="Region scope"
            options={[
              { value: "world", label: "World" },
              { value: "us", label: "US" },
              { value: "eu", label: "EU" },
              { value: "ap", label: "Asia-Pacific" },
            ]}
            value={displayOptions.geomap?.regionScope ?? "world"}
            onChange={(v) => update({ geomap: { ...displayOptions.geomap, regionScope: v as GeomapDisplayConfig["regionScope"] } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.geomap?.showLabels ?? false}
              onChange={(e) => update({ geomap: { ...displayOptions.geomap, showLabels: e.target.checked } as GeomapDisplayConfig })}
            />
            Show labels
          </label>
        </CollapsibleSection>
      )}

      {panelType === "sankey" && (
        <CollapsibleSection title="Sankey Options" defaultOpen>
          <Input
            label="Source field"
            value={displayOptions.sankey?.sourceField ?? "source"}
            onChange={(e) => update({ sankey: { ...displayOptions.sankey, sourceField: e.target.value || undefined } as SankeyDisplayConfig })}
            placeholder="source"
          />
          <Input
            label="Target field"
            value={displayOptions.sankey?.targetField ?? "target"}
            onChange={(e) => update({ sankey: { ...displayOptions.sankey, targetField: e.target.value || undefined } as SankeyDisplayConfig })}
            placeholder="target"
          />
          <Input
            label="Value field"
            value={displayOptions.sankey?.valueField ?? ""}
            onChange={(e) => update({ sankey: { ...displayOptions.sankey, valueField: e.target.value || undefined } as SankeyDisplayConfig })}
            placeholder="Metric field for flow values"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input
              label="Node width"
              type="number"
              min={4}
              max={60}
              value={displayOptions.sankey?.nodeWidth ?? 20}
              onChange={(e) => update({ sankey: { ...displayOptions.sankey, nodeWidth: parseInt(e.target.value) || 20 } as SankeyDisplayConfig })}
            />
            <Input
              label="Node padding"
              type="number"
              min={2}
              max={40}
              value={displayOptions.sankey?.nodePadding ?? 10}
              onChange={(e) => update({ sankey: { ...displayOptions.sankey, nodePadding: parseInt(e.target.value) || 10 } as SankeyDisplayConfig })}
            />
          </div>
        </CollapsibleSection>
      )}

      {panelType === "topology" && (
        <CollapsibleSection title="Topology Options" defaultOpen>
          <NativeSelect
            label="Layout"
            options={[
              { value: "force", label: "Force-directed" },
              { value: "hierarchical", label: "Hierarchical" },
              { value: "circular", label: "Circular" },
            ]}
            value={displayOptions.topology?.layout ?? "force"}
            onChange={(v) => update({ topology: { ...displayOptions.topology, layout: v as TopologyDisplayConfig["layout"] } })}
          />
          <NativeSelect
            label="Edge style"
            options={[
              { value: "curved", label: "Curved" },
              { value: "straight", label: "Straight" },
            ]}
            value={displayOptions.topology?.edgeStyle ?? "curved"}
            onChange={(v) => update({ topology: { ...displayOptions.topology, edgeStyle: v as TopologyDisplayConfig["edgeStyle"] } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.topology?.showMetrics ?? false}
              onChange={(e) => update({ topology: { ...displayOptions.topology, showMetrics: e.target.checked } as TopologyDisplayConfig })}
            />
            Show metrics on nodes
          </label>
          <Input
            label="Group by tag"
            value={displayOptions.topology?.groupBy ?? ""}
            onChange={(e) => update({ topology: { ...displayOptions.topology, groupBy: e.target.value || undefined } as TopologyDisplayConfig })}
            placeholder="e.g., namespace"
          />
        </CollapsibleSection>
      )}

      {panelType === "sparkline_table" && (
        <CollapsibleSection title="Sparkline Table Options" defaultOpen>
          <Input
            label="Sparkline width (px)"
            type="number"
            min={60}
            max={200}
            value={displayOptions.sparklineTable?.sparklineWidth ?? 120}
            onChange={(e) => update({ sparklineTable: { ...displayOptions.sparklineTable, sparklineWidth: parseInt(e.target.value) || 120 } as SparklineTableDisplayConfig })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.sparklineTable?.showTrend ?? false}
              onChange={(e) => update({ sparklineTable: { ...displayOptions.sparklineTable, showTrend: e.target.checked } as SparklineTableDisplayConfig })}
            />
            Show trend indicator
          </label>
          <Input
            label="Page size"
            type="number"
            min={5}
            max={100}
            value={displayOptions.sparklineTable?.pageSize ?? 25}
            onChange={(e) => update({ sparklineTable: { ...displayOptions.sparklineTable, pageSize: parseInt(e.target.value) || 25 } as SparklineTableDisplayConfig })}
          />
        </CollapsibleSection>
      )}

      {panelType === "bar_gauge" && (
        <CollapsibleSection title="Bar Gauge Options" defaultOpen>
          <NativeSelect
            label="Orientation"
            options={[
              { value: "horizontal", label: "Horizontal" },
              { value: "vertical", label: "Vertical" },
            ]}
            value={displayOptions.barGauge?.orientation ?? "horizontal"}
            onChange={(v) => update({ barGauge: { ...displayOptions.barGauge, orientation: v as BarGaugeDisplayConfig["orientation"] } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.barGauge?.showValue ?? true}
              onChange={(e) => update({ barGauge: { ...displayOptions.barGauge, showValue: e.target.checked } as BarGaugeDisplayConfig })}
            />
            Show value label
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input
              label="Min width (px)"
              type="number"
              min={20}
              max={200}
              value={displayOptions.barGauge?.minWidth ?? 40}
              onChange={(e) => update({ barGauge: { ...displayOptions.barGauge, minWidth: parseInt(e.target.value) || 40 } as BarGaugeDisplayConfig })}
            />
            <Input
              label="Max items"
              type="number"
              min={1}
              max={100}
              value={displayOptions.barGauge?.maxItems ?? 20}
              onChange={(e) => update({ barGauge: { ...displayOptions.barGauge, maxItems: parseInt(e.target.value) || 20 } as BarGaugeDisplayConfig })}
            />
          </div>
        </CollapsibleSection>
      )}

      {panelType === "radar" && (
        <CollapsibleSection title="Radar Options" defaultOpen>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Fill opacity: {(displayOptions.radar?.fillOpacity ?? 0.3).toFixed(1)}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={displayOptions.radar?.fillOpacity ?? 0.3}
              onChange={(e) => update({ radar: { ...displayOptions.radar, fillOpacity: parseFloat(e.target.value) } as RadarDisplayConfig })}
              style={{ width: "100%", cursor: "pointer" }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.radar?.showPoints ?? true}
              onChange={(e) => update({ radar: { ...displayOptions.radar, showPoints: e.target.checked } as RadarDisplayConfig })}
            />
            Show data points
          </label>
          <Input
            label="Max value"
            type="number"
            value={displayOptions.radar?.maxValue ?? ""}
            onChange={(e) => {
              const val = e.target.value.trim();
              update({ radar: { ...displayOptions.radar, maxValue: val === "" ? undefined : Number(val) } as RadarDisplayConfig });
            }}
            placeholder="Auto"
          />
        </CollapsibleSection>
      )}

      {panelType === "candlestick" && (
        <CollapsibleSection title="Candlestick Options" defaultOpen>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Up color</label>
              <input
                type="color"
                value={displayOptions.candlestick?.upColor ?? "#22c55e"}
                onChange={(e) => update({ candlestick: { ...displayOptions.candlestick, upColor: e.target.value } as CandlestickDisplayConfig })}
                style={{ width: "100%", height: 32, border: "none", padding: 0, cursor: "pointer" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Down color</label>
              <input
                type="color"
                value={displayOptions.candlestick?.downColor ?? "#ef4444"}
                onChange={(e) => update({ candlestick: { ...displayOptions.candlestick, downColor: e.target.value } as CandlestickDisplayConfig })}
                style={{ width: "100%", height: 32, border: "none", padding: 0, cursor: "pointer" }}
              />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.candlestick?.showVolume ?? false}
              onChange={(e) => update({ candlestick: { ...displayOptions.candlestick, showVolume: e.target.checked } as CandlestickDisplayConfig })}
            />
            Show volume bars
          </label>
        </CollapsibleSection>
      )}

      {panelType === "calendar_heatmap" && (
        <CollapsibleSection title="Calendar Heatmap Options" defaultOpen>
          <NativeSelect
            label="Color scheme"
            options={[
              { value: "greens", label: "Greens" },
              { value: "blues", label: "Blues" },
              { value: "reds", label: "Reds" },
              { value: "oranges", label: "Oranges" },
            ]}
            value={displayOptions.calendarHeatmap?.colorScheme ?? "greens"}
            onChange={(v) => update({ calendarHeatmap: { ...displayOptions.calendarHeatmap, colorScheme: v as CalendarHeatmapDisplayConfig["colorScheme"] } })}
          />
          <Input
            label="Months to show"
            type="number"
            min={1}
            max={24}
            value={displayOptions.calendarHeatmap?.monthsToShow ?? 12}
            onChange={(e) => update({ calendarHeatmap: { ...displayOptions.calendarHeatmap, monthsToShow: parseInt(e.target.value) || 12 } as CalendarHeatmapDisplayConfig })}
          />
          <NativeSelect
            label="Start day"
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
            ]}
            value={String(displayOptions.calendarHeatmap?.startDay ?? 0)}
            onChange={(v) => update({ calendarHeatmap: { ...displayOptions.calendarHeatmap, startDay: Number(v) as 0 | 1 } })}
          />
        </CollapsibleSection>
      )}

      {panelType === "bubble" && (
        <CollapsibleSection title="Bubble Options" defaultOpen>
          <Input
            label="X metric"
            value={displayOptions.bubble?.xMetric ?? ""}
            onChange={(e) => update({ bubble: { ...displayOptions.bubble, xMetric: e.target.value || undefined } as BubbleDisplayConfig })}
            placeholder="Metric for X axis"
          />
          <Input
            label="Y metric"
            value={displayOptions.bubble?.yMetric ?? ""}
            onChange={(e) => update({ bubble: { ...displayOptions.bubble, yMetric: e.target.value || undefined } as BubbleDisplayConfig })}
            placeholder="Metric for Y axis"
          />
          <Input
            label="Size metric"
            value={displayOptions.bubble?.sizeMetric ?? ""}
            onChange={(e) => update({ bubble: { ...displayOptions.bubble, sizeMetric: e.target.value || undefined } as BubbleDisplayConfig })}
            placeholder="Metric for bubble size"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input
              label="Min bubble size"
              type="number"
              min={2}
              max={50}
              value={displayOptions.bubble?.minBubbleSize ?? 4}
              onChange={(e) => update({ bubble: { ...displayOptions.bubble, minBubbleSize: parseInt(e.target.value) || 4 } as BubbleDisplayConfig })}
            />
            <Input
              label="Max bubble size"
              type="number"
              min={10}
              max={200}
              value={displayOptions.bubble?.maxBubbleSize ?? 40}
              onChange={(e) => update({ bubble: { ...displayOptions.bubble, maxBubbleSize: parseInt(e.target.value) || 40 } as BubbleDisplayConfig })}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.bubble?.showLabels ?? false}
              onChange={(e) => update({ bubble: { ...displayOptions.bubble, showLabels: e.target.checked } as BubbleDisplayConfig })}
            />
            Show labels
          </label>
        </CollapsibleSection>
      )}

      {panelType === "waterfall" && (
        <CollapsibleSection title="Waterfall Options" defaultOpen>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.waterfall?.showTotal ?? true}
              onChange={(e) => update({ waterfall: { ...displayOptions.waterfall, showTotal: e.target.checked } as WaterfallDisplayConfig })}
            />
            Show total bar
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Positive</label>
              <input
                type="color"
                value={displayOptions.waterfall?.positiveColor ?? "#22c55e"}
                onChange={(e) => update({ waterfall: { ...displayOptions.waterfall, positiveColor: e.target.value } as WaterfallDisplayConfig })}
                style={{ width: "100%", height: 32, border: "none", padding: 0, cursor: "pointer" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Negative</label>
              <input
                type="color"
                value={displayOptions.waterfall?.negativeColor ?? "#ef4444"}
                onChange={(e) => update({ waterfall: { ...displayOptions.waterfall, negativeColor: e.target.value } as WaterfallDisplayConfig })}
                style={{ width: "100%", height: 32, border: "none", padding: 0, cursor: "pointer" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Total</label>
              <input
                type="color"
                value={displayOptions.waterfall?.totalColor ?? "#3b82f6"}
                onChange={(e) => update({ waterfall: { ...displayOptions.waterfall, totalColor: e.target.value } as WaterfallDisplayConfig })}
                style={{ width: "100%", height: 32, border: "none", padding: 0, cursor: "pointer" }}
              />
            </div>
          </div>
        </CollapsibleSection>
      )}

      {panelType === "box_plot" && (
        <CollapsibleSection title="Box Plot Options" defaultOpen>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.boxPlot?.showOutliers ?? true}
              onChange={(e) => update({ boxPlot: { ...displayOptions.boxPlot, showOutliers: e.target.checked } as BoxPlotDisplayConfig })}
            />
            Show outliers
          </label>
          <NativeSelect
            label="Whisker type"
            options={[
              { value: "minmax", label: "Min/Max" },
              { value: "iqr1.5", label: "IQR x 1.5" },
            ]}
            value={displayOptions.boxPlot?.whiskerType ?? "minmax"}
            onChange={(v) => update({ boxPlot: { ...displayOptions.boxPlot, whiskerType: v as BoxPlotDisplayConfig["whiskerType"] } })}
          />
        </CollapsibleSection>
      )}

      {panelType === "funnel" && (
        <CollapsibleSection title="Funnel Options" defaultOpen>
          <NativeSelect
            label="Orientation"
            options={[
              { value: "horizontal", label: "Horizontal" },
              { value: "vertical", label: "Vertical" },
            ]}
            value={displayOptions.funnel?.orientation ?? "vertical"}
            onChange={(v) => update({ funnel: { ...displayOptions.funnel, orientation: v as FunnelDisplayConfig["orientation"] } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.funnel?.showPercentage ?? true}
              onChange={(e) => update({ funnel: { ...displayOptions.funnel, showPercentage: e.target.checked } as FunnelDisplayConfig })}
            />
            Show percentage
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.funnel?.showDifference ?? false}
              onChange={(e) => update({ funnel: { ...displayOptions.funnel, showDifference: e.target.checked } as FunnelDisplayConfig })}
            />
            Show step difference
          </label>
        </CollapsibleSection>
      )}

      {panelType === "slo_tracker" && (
        <CollapsibleSection title="SLO Tracker Options" defaultOpen>
          <Input
            label="Target SLO (%)"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={displayOptions.sloTracker?.targetSlo ?? 99.9}
            onChange={(e) => update({ sloTracker: { ...displayOptions.sloTracker, targetSlo: parseFloat(e.target.value) || 99.9 } as SloTrackerDisplayConfig })}
          />
          <Input
            label="Window (days)"
            type="number"
            min={1}
            max={365}
            value={displayOptions.sloTracker?.windowDays ?? 30}
            onChange={(e) => update({ sloTracker: { ...displayOptions.sloTracker, windowDays: parseInt(e.target.value) || 30 } as SloTrackerDisplayConfig })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.sloTracker?.showBurnRate ?? true}
              onChange={(e) => update({ sloTracker: { ...displayOptions.sloTracker, showBurnRate: e.target.checked } as SloTrackerDisplayConfig })}
            />
            Show burn rate
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.sloTracker?.showErrorBudget ?? true}
              onChange={(e) => update({ sloTracker: { ...displayOptions.sloTracker, showErrorBudget: e.target.checked } as SloTrackerDisplayConfig })}
            />
            Show error budget
          </label>
        </CollapsibleSection>
      )}

      {panelType === "alert_list" && (
        <CollapsibleSection title="Alert List Options" defaultOpen>
          <Input
            label="Max items"
            type="number"
            min={1}
            max={100}
            value={displayOptions.alertList?.maxItems ?? 20}
            onChange={(e) => update({ alertList: { ...displayOptions.alertList, maxItems: parseInt(e.target.value) || 20 } as AlertListDisplayConfig })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.alertList?.showResolved ?? false}
              onChange={(e) => update({ alertList: { ...displayOptions.alertList, showResolved: e.target.checked } as AlertListDisplayConfig })}
            />
            Show resolved alerts
          </label>
        </CollapsibleSection>
      )}

      {panelType === "log_stream" && (
        <CollapsibleSection title="Log Stream Options" defaultOpen>
          <Input
            label="Max lines"
            type="number"
            min={10}
            max={1000}
            value={displayOptions.logStream?.maxLines ?? 100}
            onChange={(e) => update({ logStream: { ...displayOptions.logStream, maxLines: parseInt(e.target.value) || 100 } as LogStreamDisplayConfig })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.logStream?.showTimestamp ?? true}
              onChange={(e) => update({ logStream: { ...displayOptions.logStream, showTimestamp: e.target.checked } as LogStreamDisplayConfig })}
            />
            Show timestamp
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.logStream?.showSeverity ?? true}
              onChange={(e) => update({ logStream: { ...displayOptions.logStream, showSeverity: e.target.checked } as LogStreamDisplayConfig })}
            />
            Show severity
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.logStream?.wrapLines ?? false}
              onChange={(e) => update({ logStream: { ...displayOptions.logStream, wrapLines: e.target.checked } as LogStreamDisplayConfig })}
            />
            Wrap long lines
          </label>
          <Input
            label="Filter query"
            value={displayOptions.logStream?.filterQuery ?? ""}
            onChange={(e) => update({ logStream: { ...displayOptions.logStream, filterQuery: e.target.value || undefined } as LogStreamDisplayConfig })}
            placeholder="e.g., severity:error"
          />
        </CollapsibleSection>
      )}

      {panelType === "resource_inventory" && (
        <CollapsibleSection title="Resource Inventory Options" defaultOpen>
          <Input
            label="Resource type"
            value={displayOptions.resourceInventory?.resourceType ?? ""}
            onChange={(e) => update({ resourceInventory: { ...displayOptions.resourceInventory, resourceType: e.target.value || undefined } as ResourceInventoryDisplayConfig })}
            placeholder="e.g., ec2, rds, lambda"
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.resourceInventory?.showHealth ?? true}
              onChange={(e) => update({ resourceInventory: { ...displayOptions.resourceInventory, showHealth: e.target.checked } as ResourceInventoryDisplayConfig })}
            />
            Show health status
          </label>
          <Input
            label="Page size"
            type="number"
            min={5}
            max={100}
            value={displayOptions.resourceInventory?.pageSize ?? 25}
            onChange={(e) => update({ resourceInventory: { ...displayOptions.resourceInventory, pageSize: parseInt(e.target.value) || 25 } as ResourceInventoryDisplayConfig })}
          />
        </CollapsibleSection>
      )}

      {panelType === "progress" && (
        <CollapsibleSection title="Progress Options" defaultOpen>
          <NativeSelect
            label="Shape"
            options={[
              { value: "circular", label: "Circular" },
              { value: "linear", label: "Linear" },
            ]}
            value={displayOptions.progress?.shape ?? "circular"}
            onChange={(v) => update({ progress: { ...displayOptions.progress, shape: v as ProgressDisplayConfig["shape"] } })}
          />
          <Input
            label="Target value"
            type="number"
            value={displayOptions.progress?.targetValue ?? 100}
            onChange={(e) => update({ progress: { ...displayOptions.progress, targetValue: Number(e.target.value) || 100 } as ProgressDisplayConfig })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.progress?.showLabel ?? true}
              onChange={(e) => update({ progress: { ...displayOptions.progress, showLabel: e.target.checked } as ProgressDisplayConfig })}
            />
            Show label
          </label>
        </CollapsibleSection>
      )}

      {panelType === "forecast_line" && (
        <CollapsibleSection title="Forecast Options" defaultOpen>
          <NativeSelect
            label="Method"
            options={[
              { value: "linear", label: "Linear" },
              { value: "exponential", label: "Exponential" },
              { value: "holt_winters", label: "Holt-Winters" },
            ]}
            value={displayOptions.forecast?.method ?? "linear"}
            onChange={(v) => update({ forecast: { ...displayOptions.forecast, method: v as ForecastDisplayConfig["method"] } })}
          />
          <Input
            label="Forecast periods"
            type="number"
            min={1}
            max={100}
            value={displayOptions.forecast?.forecastPeriods ?? 10}
            onChange={(e) => update({ forecast: { ...displayOptions.forecast, forecastPeriods: parseInt(e.target.value) || 10 } as ForecastDisplayConfig })}
          />
          <Input
            label="Confidence level (%)"
            type="number"
            min={50}
            max={99}
            value={displayOptions.forecast?.confidenceLevel ?? 95}
            onChange={(e) => update({ forecast: { ...displayOptions.forecast, confidenceLevel: parseInt(e.target.value) || 95 } as ForecastDisplayConfig })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.forecast?.showConfidenceBand ?? true}
              onChange={(e) => update({ forecast: { ...displayOptions.forecast, showConfidenceBand: e.target.checked } as ForecastDisplayConfig })}
            />
            Show confidence band
          </label>
        </CollapsibleSection>
      )}

      {panelType === "diff_comparison" && (
        <CollapsibleSection title="Diff Comparison Options" defaultOpen>
          <NativeSelect
            label="Layout"
            options={[
              { value: "side_by_side", label: "Side by Side" },
              { value: "overlay", label: "Overlay" },
            ]}
            value={displayOptions.diffComparison?.layout ?? "side_by_side"}
            onChange={(v) => update({ diffComparison: { ...displayOptions.diffComparison, layout: v as DiffComparisonDisplayConfig["layout"] } })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.diffComparison?.showPercentChange ?? true}
              onChange={(e) => update({ diffComparison: { ...displayOptions.diffComparison, showPercentChange: e.target.checked } as DiffComparisonDisplayConfig })}
            />
            Show percent change
          </label>
        </CollapsibleSection>
      )}

      {["timeseries", "area"].includes(panelType) && (
        <CollapsibleSection title="Anomaly Detection">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayOptions.anomaly?.enabled ?? false}
              onChange={(e) => update({ anomaly: { ...displayOptions.anomaly, enabled: e.target.checked } as AnomalyConfig })}
            />
            Enable anomaly detection
          </label>
          {displayOptions.anomaly?.enabled && (
            <>
              <Input
                label="Std dev multiplier"
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={displayOptions.anomaly?.stdDevMultiplier ?? 2}
                onChange={(e) => update({ anomaly: { ...displayOptions.anomaly, stdDevMultiplier: parseFloat(e.target.value) || 2 } as AnomalyConfig })}
              />
              <Input
                label="Rolling window (points)"
                type="number"
                min={5}
                max={200}
                value={displayOptions.anomaly?.rollingWindow ?? 20}
                onChange={(e) => update({ anomaly: { ...displayOptions.anomaly, rollingWindow: parseInt(e.target.value) || 20 } as AnomalyConfig })}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={displayOptions.anomaly?.showBands ?? true}
                  onChange={(e) => update({ anomaly: { ...displayOptions.anomaly, showBands: e.target.checked } as AnomalyConfig })}
                />
                Show anomaly bands
              </label>
            </>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Description">
        <Input
          label="Panel description"
          value={displayOptions.description ?? ""}
          onChange={(e) => update({ description: e.target.value || undefined })}
          placeholder="Optional description shown as tooltip"
        />
      </CollapsibleSection>
    </div>
  );
}

function ThresholdEditor({
  steps,
  showLines,
  showBands,
  baseColor,
  onChange,
}: {
  steps: ThresholdStep[];
  showLines: boolean;
  showBands: boolean;
  baseColor?: string;
  onChange: (cfg: { steps: ThresholdStep[]; showLines: boolean; showBands: boolean; baseColor?: string }) => void;
}) {
  const addStep = () => {
    const newVal = steps.length > 0 ? (steps[steps.length - 1].value + 10) : 0;
    const color = steps.length === 0 ? THRESHOLD_COLORS.warning : THRESHOLD_COLORS.critical;
    onChange({ steps: [...steps, { value: newVal, color }], showLines, showBands, baseColor });
  };

  const removeStep = (idx: number) => {
    onChange({ steps: steps.filter((_, i) => i !== idx), showLines, showBands, baseColor });
  };

  const updateStep = (idx: number, partial: Partial<ThresholdStep>) => {
    onChange({
      steps: steps.map((s, i) => (i === idx ? { ...s, ...partial } : s)),
      showLines,
      showBands,
      baseColor,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="color"
            value={step.color}
            onChange={(e) => updateStep(i, { color: e.target.value })}
            style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer" }}
          />
          <input
            type="number"
            value={step.value}
            onChange={(e) => updateStep(i, { value: Number(e.target.value) })}
            style={{
              width: 80,
              padding: "4px 8px",
              fontSize: 12,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
            }}
          />
          <input
            type="text"
            value={step.label ?? ""}
            onChange={(e) => updateStep(i, { label: e.target.value || undefined })}
            placeholder="Label"
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: 12,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={() => removeStep(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 2 }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      <button
        onClick={addStep}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          color: "var(--color-primary-500)",
          fontWeight: 500,
        }}
      >
        <Plus size={12} /> Add threshold
      </button>

      {steps.length > 0 && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showLines}
              onChange={(e) => onChange({ steps, showLines: e.target.checked, showBands, baseColor })}
            />
            Show threshold lines
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showBands}
              onChange={(e) => onChange({ steps, showLines, showBands: e.target.checked, baseColor })}
            />
            Show colored bands
          </label>
        </>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "4px 8px",
  fontSize: 12,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
} as const;

function ValueMappingEditor({
  mappings,
  onChange,
}: {
  mappings: ValueMapping[];
  onChange: (mappings: ValueMapping[]) => void;
}) {
  const addMapping = () => {
    onChange([...mappings, { type: "value", match: 0, displayText: "", color: "" }]);
  };

  const removeMapping = (idx: number) => {
    onChange(mappings.filter((_, i) => i !== idx));
  };

  const updateMapping = (idx: number, partial: Partial<ValueMapping>) => {
    onChange(mappings.map((m, i) => (i === idx ? { ...m, ...partial } : m)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Map specific values or ranges to custom display text and colors.
      </div>
      {mappings.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={m.type}
            onChange={(e) => updateMapping(i, { type: e.target.value as "value" | "range" })}
            style={{ ...inputStyle, width: 70 }}
          >
            <option value="value">Value</option>
            <option value="range">Range</option>
          </select>
          {m.type === "value" ? (
            <input
              type="number"
              value={m.match ?? 0}
              onChange={(e) => updateMapping(i, { match: Number(e.target.value) })}
              placeholder="Value"
              style={{ ...inputStyle, width: 60 }}
            />
          ) : (
            <>
              <input
                type="number"
                value={m.from ?? 0}
                onChange={(e) => updateMapping(i, { from: Number(e.target.value) })}
                placeholder="From"
                style={{ ...inputStyle, width: 55 }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>–</span>
              <input
                type="number"
                value={m.to ?? 100}
                onChange={(e) => updateMapping(i, { to: Number(e.target.value) })}
                placeholder="To"
                style={{ ...inputStyle, width: 55 }}
              />
            </>
          )}
          <input
            type="text"
            value={m.displayText}
            onChange={(e) => updateMapping(i, { displayText: e.target.value })}
            placeholder="Display text"
            style={{ ...inputStyle, flex: 1, minWidth: 80 }}
          />
          <input
            type="color"
            value={m.color || "#22c55e"}
            onChange={(e) => updateMapping(i, { color: e.target.value })}
            style={{ width: 24, height: 24, border: "none", padding: 0, cursor: "pointer" }}
          />
          <button
            onClick={() => removeMapping(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 2 }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={addMapping}
        style={{
          display: "flex", alignItems: "center", gap: 4, padding: "6px 0",
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "var(--color-primary-500)", fontWeight: 500,
        }}
      >
        <Plus size={12} /> Add mapping
      </button>
    </div>
  );
}

function DataLinkEditor({
  links,
  onChange,
}: {
  links: DataLink[];
  onChange: (links: DataLink[]) => void;
}) {
  const addLink = () => {
    onChange([...links, { label: "", url: "" }]);
  };

  const removeLink = (idx: number) => {
    onChange(links.filter((_, i) => i !== idx));
  };

  const updateLink = (idx: number, partial: Partial<DataLink>) => {
    onChange(links.map((l, i) => (i === idx ? { ...l, ...partial } : l)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Click a data point to open a link. Placeholders: {"${__value}"}, {"${__time}"}, {"${__series.name}"}, {"${variableName}"}
      </div>
      {links.map((link, i) => (
        <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="text"
            value={link.label}
            onChange={(e) => updateLink(i, { label: e.target.value })}
            placeholder="Label"
            style={{ ...inputStyle, width: 100 }}
          />
          <input
            type="text"
            value={link.url}
            onChange={(e) => updateLink(i, { url: e.target.value })}
            placeholder="http://example.com?v=${__value}"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => removeLink(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 2 }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={addLink}
        style={{
          display: "flex", alignItems: "center", gap: 4, padding: "6px 0",
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "var(--color-primary-500)", fontWeight: 500,
        }}
      >
        <Plus size={12} /> Add data link
      </button>
    </div>
  );
}

function SeriesColorOverrideEditor({
  overrides,
  onChange,
}: {
  overrides: SeriesColorOverride[];
  onChange: (overrides: SeriesColorOverride[]) => void;
}) {
  const addOverride = () => {
    onChange([...overrides, { seriesPattern: "", color: "#635bff" }]);
  };

  const removeOverride = (idx: number) => {
    onChange(overrides.filter((_, i) => i !== idx));
  };

  const updateOverride = (idx: number, partial: Partial<SeriesColorOverride>) => {
    onChange(overrides.map((o, i) => (i === idx ? { ...o, ...partial } : o)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Override colors for specific series by name pattern.
      </div>
      {overrides.map((o, i) => (
        <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="text"
            value={o.seriesPattern}
            onChange={(e) => updateOverride(i, { seriesPattern: e.target.value })}
            placeholder="Series name or pattern"
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="color"
            value={o.color}
            onChange={(e) => updateOverride(i, { color: e.target.value })}
            style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer" }}
          />
          <button
            onClick={() => removeOverride(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 2 }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={addOverride}
        style={{
          display: "flex", alignItems: "center", gap: 4, padding: "6px 0",
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "var(--color-primary-500)", fontWeight: 500,
        }}
      >
        <Plus size={12} /> Add override
      </button>
    </div>
  );
}
