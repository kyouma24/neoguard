import type uPlot from "uplot";
import type { ThresholdStep } from "../../types/display-options";
import type { Annotation } from "../../types";
import type { AnomalyBand } from "../../utils/anomalyDetection";

// Band fill color (light purple)
const ANOMALY_BAND_FILL = "rgba(168, 85, 247, 0.10)";
// Upper/lower boundary stroke
const ANOMALY_BAND_STROKE = "rgba(168, 85, 247, 0.35)";
// Anomaly point marker color (red)
const ANOMALY_POINT_COLOR = "#ef4444";

/**
 * uPlot plugin that draws horizontal threshold lines on the chart.
 * Replaces Recharts ReferenceLine + ReferenceArea for threshold visualization.
 */
export function thresholdPlugin(
  thresholds: { steps: ThresholdStep[]; showLines?: boolean; showBands?: boolean },
): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        const { ctx, bbox } = u;
        const { steps, showLines, showBands } = thresholds;
        if (!steps.length) return;

        const sorted = [...steps].sort((a, b) => a.value - b.value);

        // Draw bands between threshold steps
        if (showBands && sorted.length >= 2) {
          ctx.save();
          for (let i = 0; i < sorted.length - 1; i++) {
            const y1 = u.valToPos(sorted[i].value, "y", true);
            const y2 = u.valToPos(sorted[i + 1].value, "y", true);
            if (y1 == null || y2 == null) continue;
            ctx.fillStyle = sorted[i].color;
            ctx.globalAlpha = 0.06;
            const top = Math.min(y1, y2);
            const height = Math.abs(y2 - y1);
            ctx.fillRect(bbox.left, top, bbox.width, height);
          }
          ctx.restore();
        }

        // Draw threshold lines
        if (showLines) {
          ctx.save();
          for (const step of sorted) {
            const y = u.valToPos(step.value, "y", true);
            if (y == null) continue;
            ctx.strokeStyle = step.color;
            ctx.lineWidth = 1.5 * devicePixelRatio;
            ctx.setLineDash([5 * devicePixelRatio, 5 * devicePixelRatio]);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(bbox.left, y);
            ctx.lineTo(bbox.left + bbox.width, y);
            ctx.stroke();

            // Draw label if present
            if (step.label) {
              ctx.setLineDash([]);
              ctx.fillStyle = step.color;
              ctx.font = `${10 * devicePixelRatio}px sans-serif`;
              ctx.textAlign = "right";
              ctx.fillText(step.label, bbox.left + bbox.width - 4 * devicePixelRatio, y - 4 * devicePixelRatio);
            }
          }
          ctx.restore();
        }
      },
    },
  };
}

/**
 * uPlot plugin that draws vertical annotation markers.
 * Replaces Recharts-based AnnotationMarkers component.
 */
export function annotationPlugin(annotations: Annotation[]): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        if (!annotations.length) return;
        const { ctx, bbox } = u;
        ctx.save();
        for (const ann of annotations) {
          const ts = new Date(ann.starts_at).getTime() / 1000; // uPlot uses seconds
          const x = u.valToPos(ts, "x", true);
          if (x == null || x < bbox.left || x > bbox.left + bbox.width) continue;

          // Vertical line
          ctx.strokeStyle = "#a855f7";
          ctx.lineWidth = 1.5 * devicePixelRatio;
          ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio]);
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(x, bbox.top);
          ctx.lineTo(x, bbox.top + bbox.height);
          ctx.stroke();

          // Label
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#a855f7";
          ctx.font = `${10 * devicePixelRatio}px sans-serif`;
          ctx.textAlign = "left";
          ctx.fillText(ann.title, x + 4 * devicePixelRatio, bbox.top + 14 * devicePixelRatio);

          // Range region if ends_at is present
          if (ann.ends_at) {
            const endTs = new Date(ann.ends_at).getTime() / 1000;
            const x2 = u.valToPos(endTs, "x", true);
            if (x2 != null) {
              ctx.fillStyle = "#a855f7";
              ctx.globalAlpha = 0.06;
              ctx.fillRect(Math.min(x, x2), bbox.top, Math.abs(x2 - x), bbox.height);
            }
          }
        }
        ctx.restore();
      },
    },
  };
}

/**
 * uPlot plugin that syncs the cursor position with the Zustand crosshair store.
 * Implements cross-widget crosshair as per spec 02 C.4.1.
 */
export function crosshairSyncPlugin(
  setCrosshair: (timestamp: string | null, sourceWidgetId: string | null) => void,
  _clearCrosshair: () => void,
  widgetId: string | undefined,
): uPlot.Plugin {
  return {
    hooks: {
      setCursor(u: uPlot) {
        const idx = u.cursor.idx;
        if (idx != null && idx >= 0 && u.data[0][idx] != null) {
          const tsSeconds = u.data[0][idx] as number;
          const isoStr = new Date(tsSeconds * 1000).toISOString();
          setCrosshair(isoStr, widgetId ?? null);
        }
      },
      setSelect(u: uPlot) {
        // Handled in component via onTimeRangeChange
        void u;
      },
    },
  };
}

/**
 * uPlot plugin to draw a crosshair line at an externally-provided timestamp.
 * Used when another widget is the source of the crosshair.
 */
export function externalCrosshairPlugin(
  getTimestamp: () => string | null,
  getSourceWidgetId: () => string | null,
  widgetId: string | undefined,
): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        const ts = getTimestamp();
        const source = getSourceWidgetId();
        // Only draw if another widget is the source
        if (!ts || source === (widgetId ?? null)) return;

        const tsSeconds = new Date(ts).getTime() / 1000;
        const x = u.valToPos(tsSeconds, "x", true);
        if (x == null) return;

        const { ctx, bbox } = u;
        if (x < bbox.left || x > bbox.left + bbox.width) return;

        ctx.save();
        ctx.strokeStyle = "rgba(150, 150, 150, 0.5)";
        ctx.lineWidth = 1 * devicePixelRatio;
        ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio]);
        ctx.beginPath();
        ctx.moveTo(x, bbox.top);
        ctx.lineTo(x, bbox.top + bbox.height);
        ctx.stroke();
        ctx.restore();
      },
    },
  };
}

/**
 * uPlot plugin that renders anomaly detection bands and anomaly point markers.
 *
 * Draws:
 * 1. A shaded area between upper and lower bounds (light purple fill)
 * 2. Dashed upper/lower boundary lines
 * 3. A solid mean line
 * 4. Red circle markers on data points flagged as anomalies
 *
 * The bands array must be aligned with the x-axis timestamps of the uPlot data.
 * Each AnomalyBand entry corresponds to one timestamp.
 */
export function anomalyBandPlugin(
  bands: AnomalyBand[],
  showBands: boolean,
): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        if (!bands.length) return;

        const { ctx, bbox } = u;
        const xData = u.data[0] as number[];
        if (!xData.length) return;

        // Build a lookup from timestamp (seconds) to band entry for fast access.
        // Bands are keyed by the ISO timestamp string; x-axis data is in Unix seconds.
        const bandByTs = new Map<number, AnomalyBand>();
        for (const b of bands) {
          const sec = new Date(b.timestamp).getTime() / 1000;
          bandByTs.set(sec, b);
        }

        ctx.save();

        // -- 1. Shaded band area (upper -> lower) --
        if (showBands) {
          ctx.beginPath();
          let started = false;
          // Trace upper boundary left-to-right
          for (let i = 0; i < xData.length; i++) {
            const band = bandByTs.get(xData[i]);
            if (!band) continue;
            const x = u.valToPos(xData[i], "x", true);
            const yUpper = u.valToPos(band.upper, "y", true);
            if (x == null || yUpper == null) continue;
            if (x < bbox.left || x > bbox.left + bbox.width) continue;
            if (!started) {
              ctx.moveTo(x, yUpper);
              started = true;
            } else {
              ctx.lineTo(x, yUpper);
            }
          }
          // Trace lower boundary right-to-left to close the path
          for (let i = xData.length - 1; i >= 0; i--) {
            const band = bandByTs.get(xData[i]);
            if (!band) continue;
            const x = u.valToPos(xData[i], "x", true);
            const yLower = u.valToPos(band.lower, "y", true);
            if (x == null || yLower == null) continue;
            if (x < bbox.left || x > bbox.left + bbox.width) continue;
            ctx.lineTo(x, yLower);
          }
          ctx.closePath();
          ctx.fillStyle = ANOMALY_BAND_FILL;
          ctx.fill();

          // -- 2. Upper boundary dashed line --
          ctx.beginPath();
          started = false;
          for (let i = 0; i < xData.length; i++) {
            const band = bandByTs.get(xData[i]);
            if (!band) continue;
            const x = u.valToPos(xData[i], "x", true);
            const y = u.valToPos(band.upper, "y", true);
            if (x == null || y == null) continue;
            if (x < bbox.left || x > bbox.left + bbox.width) continue;
            if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
          }
          ctx.strokeStyle = ANOMALY_BAND_STROKE;
          ctx.lineWidth = 1 * devicePixelRatio;
          ctx.setLineDash([4 * devicePixelRatio, 4 * devicePixelRatio]);
          ctx.stroke();

          // -- 3. Lower boundary dashed line --
          ctx.beginPath();
          started = false;
          for (let i = 0; i < xData.length; i++) {
            const band = bandByTs.get(xData[i]);
            if (!band) continue;
            const x = u.valToPos(xData[i], "x", true);
            const y = u.valToPos(band.lower, "y", true);
            if (x == null || y == null) continue;
            if (x < bbox.left || x > bbox.left + bbox.width) continue;
            if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
          }
          ctx.stroke();

          // -- 4. Mean line (solid, subtle) --
          ctx.beginPath();
          ctx.setLineDash([]);
          started = false;
          for (let i = 0; i < xData.length; i++) {
            const band = bandByTs.get(xData[i]);
            if (!band) continue;
            const x = u.valToPos(xData[i], "x", true);
            const y = u.valToPos(band.mean, "y", true);
            if (x == null || y == null) continue;
            if (x < bbox.left || x > bbox.left + bbox.width) continue;
            if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
          }
          ctx.strokeStyle = ANOMALY_BAND_STROKE;
          ctx.lineWidth = 0.75 * devicePixelRatio;
          ctx.stroke();
        }

        // -- 5. Anomaly point markers (red circles) --
        ctx.setLineDash([]);
        for (let i = 0; i < xData.length; i++) {
          const band = bandByTs.get(xData[i]);
          if (!band || !band.isAnomaly || band.value == null) continue;
          const x = u.valToPos(xData[i], "x", true);
          const y = u.valToPos(band.value, "y", true);
          if (x == null || y == null) continue;
          if (x < bbox.left || x > bbox.left + bbox.width) continue;

          // Outer glow
          ctx.beginPath();
          ctx.arc(x, y, 5 * devicePixelRatio, 0, Math.PI * 2);
          ctx.fillStyle = ANOMALY_POINT_COLOR;
          ctx.globalAlpha = 0.25;
          ctx.fill();

          // Inner dot
          ctx.beginPath();
          ctx.arc(x, y, 3 * devicePixelRatio, 0, Math.PI * 2);
          ctx.fillStyle = ANOMALY_POINT_COLOR;
          ctx.globalAlpha = 1;
          ctx.fill();
        }

        ctx.restore();
      },
    },
  };
}
