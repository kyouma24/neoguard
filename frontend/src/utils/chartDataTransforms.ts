/**
 * Data transformation utilities for chart widgets.
 *
 * These are extracted to a standalone utility module so they can be
 * imported without pulling in uPlot (which requires `window.matchMedia`
 * and fails in jsdom test environments).
 */

/**
 * Apply null handling mode to aligned chart data.
 *
 * - 'gap' (default): leave nulls as-is so the chart draws gaps.
 * - 'connect': leave nulls as-is but series config uses spanGaps.
 * - 'zero': replace null values with 0 in the data.
 *
 * 'connect' mode is handled at the series config level (spanGaps),
 * so this function only transforms data for 'zero' mode.
 *
 * @param data Array where index 0 = timestamps (Float64Array), subsequent = series values.
 * @param mode The null handling mode.
 * @returns Transformed data array.
 */
export function applyNullHandling(
  data: [Float64Array | number[], ...(number | null)[][]][number][],
  mode: "connect" | "gap" | "zero",
): typeof data {
  // The function accepts a generic array-of-arrays shape and returns the same.
  // This avoids a hard dependency on the uPlot.AlignedData type.
  if (mode !== "zero") return data;

  const result = (data as unknown[]).map((arr, i) => {
    if (i === 0) return arr; // timestamps
    const series = arr as (number | null)[];
    const out: (number | null)[] = new Array(series.length);
    for (let j = 0; j < series.length; j++) {
      out[j] = series[j] == null ? 0 : series[j];
    }
    return out;
  });
  return result as typeof data;
}

/**
 * Stack series data cumulatively or as percentages.
 *
 * @param data Array where index 0 = timestamps, subsequent = series values.
 * @param mode 'normal' for cumulative stacking, 'percent' for 100% stacking.
 * @returns New array with stacked values. Nulls propagate through.
 */
export function stackData<T extends [Float64Array | number[], ...(number | null)[][]]>(
  data: T,
  mode: "normal" | "percent",
): T {
  if (data.length <= 1) return data;

  const timestamps = data[0];
  const numPoints = (timestamps as Float64Array | number[]).length;
  const numSeries = data.length - 1;

  if (numPoints === 0 || numSeries === 0) return data;

  // Build cumulative stacks
  const stacked: (number | null)[][] = [];
  for (let s = 0; s < numSeries; s++) {
    stacked.push(new Array(numPoints));
  }

  for (let j = 0; j < numPoints; j++) {
    let cumulative = 0;

    if (mode === "percent") {
      // First pass: compute total for this timestamp
      let total = 0;
      let hasAnyValue = false;
      for (let s = 0; s < numSeries; s++) {
        const val = (data[s + 1] as (number | null)[])[j];
        if (val != null) {
          total += Math.abs(val);
          hasAnyValue = true;
        }
      }

      // Second pass: stack as percentage
      cumulative = 0;
      for (let s = 0; s < numSeries; s++) {
        const val = (data[s + 1] as (number | null)[])[j];
        if (val == null) {
          stacked[s][j] = null;
        } else if (!hasAnyValue || total === 0) {
          stacked[s][j] = 0;
        } else {
          cumulative += (Math.abs(val) / total) * 100;
          stacked[s][j] = cumulative;
        }
      }
    } else {
      // Normal stacking
      for (let s = 0; s < numSeries; s++) {
        const val = (data[s + 1] as (number | null)[])[j];
        if (val == null) {
          stacked[s][j] = null;
        } else {
          cumulative += val;
          stacked[s][j] = cumulative;
        }
      }
    }
  }

  return [timestamps, ...stacked] as unknown as T;
}
