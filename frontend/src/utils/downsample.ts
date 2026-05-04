/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 * Preserves visual shape while reducing point count.
 * Zero dependencies.
 *
 * @param data Array of [timestamp, value] tuples (value may be null for gaps)
 * @param targetPoints Maximum points to return
 * @returns Downsampled array preserving visual shape
 */
export function lttbDownsample(
  data: [number, number | null][],
  targetPoints: number,
): [number, number | null][] {
  // If the data fits within target, return as-is
  if (data.length <= targetPoints || targetPoints < 3) {
    return data;
  }

  // Filter out null-value points for LTTB selection, but track original indices
  const nonNull: { index: number; x: number; y: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i][1] !== null) {
      nonNull.push({ index: i, x: data[i][0], y: data[i][1] as number });
    }
  }

  // If all values are null or we have too few non-null points, return as-is
  if (nonNull.length <= targetPoints) {
    return data;
  }

  const sampled: [number, number | null][] = [];

  // Always include the first non-null point
  sampled.push(data[nonNull[0].index]);

  // Create (targetPoints - 2) buckets from the remaining interior points
  const bucketCount = targetPoints - 2;
  const bucketSize = (nonNull.length - 2) / bucketCount;

  let prevSelected = nonNull[0];

  for (let i = 0; i < bucketCount; i++) {
    // Current bucket range
    const bucketStart = Math.floor(1 + i * bucketSize);
    const bucketEnd = Math.min(
      Math.floor(1 + (i + 1) * bucketSize),
      nonNull.length - 1,
    );

    // Next bucket average (for triangle area calculation)
    const nextBucketStart = Math.floor(1 + (i + 1) * bucketSize);
    const nextBucketEnd = Math.min(
      Math.floor(1 + (i + 2) * bucketSize),
      nonNull.length - 1,
    );

    // Compute average of next bucket (or use last point if this is the last bucket)
    let avgX = 0;
    let avgY = 0;
    let nextCount = 0;
    if (i < bucketCount - 1) {
      for (let j = nextBucketStart; j < nextBucketEnd; j++) {
        avgX += nonNull[j].x;
        avgY += nonNull[j].y;
        nextCount++;
      }
    } else {
      // Last bucket — use the last point as the "next" reference
      avgX = nonNull[nonNull.length - 1].x;
      avgY = nonNull[nonNull.length - 1].y;
      nextCount = 1;
    }

    if (nextCount > 0) {
      avgX /= nextCount;
      avgY /= nextCount;
    }

    // Find the point in the current bucket that forms the largest triangle
    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (prevSelected.x - avgX) * (nonNull[j].y - prevSelected.y) -
          (prevSelected.x - nonNull[j].x) * (avgY - prevSelected.y),
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[nonNull[maxIdx].index]);
    prevSelected = nonNull[maxIdx];
  }

  // Always include the last non-null point
  sampled.push(data[nonNull[nonNull.length - 1].index]);

  return sampled;
}
