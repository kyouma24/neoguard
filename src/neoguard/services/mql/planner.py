"""Query rollup planner — selects the optimal source table and interval.

Spec reference: D.6 — rollup planner.

Given a time range and widget width (in pixels), the planner computes:
  - target_buckets = widget_width_px * 2  (retina density)
  - ideal_interval = range_sec / target_buckets

Then snaps to the coarsest available rollup table that can satisfy the
ideal interval:

  | ideal_interval         | table       | interval |
  |------------------------|-------------|----------|
  | < 60 and range <= 6h   | metrics     | max(10, round(ideal)) |
  | < 300                  | metrics_1m  | 60       |
  | < 3600                 | metrics_5m  | 300      |
  | < 6*3600               | metrics_1h  | 3600     |
  | >= 6*3600              | metrics_1h  | 6*3600   |
"""

from __future__ import annotations


def plan_rollup(
    from_ts: int,
    to_ts: int,
    widget_width_px: int = 800,
) -> tuple[str, int]:
    """Return (table_name, interval_seconds) for the given time window.

    Args:
        from_ts: Start epoch seconds (inclusive).
        to_ts: End epoch seconds (exclusive).
        widget_width_px: Width of the rendering widget in CSS pixels.
            Defaults to 800 (common dashboard panel width).

    Returns:
        A tuple of (table_name, interval_seconds) where table_name is one
        of ``metrics``, ``metrics_1m``, ``metrics_5m``, ``metrics_1h``.
    """
    if widget_width_px < 1:
        widget_width_px = 1

    range_sec = max(to_ts - from_ts, 1)
    target_buckets = widget_width_px * 2  # retina density
    ideal_interval = range_sec / target_buckets

    if ideal_interval < 60 and range_sec <= 6 * 3600:
        # Short range — use raw metrics table with a floor of 10s
        interval = max(10, round(ideal_interval))
        return ("metrics", interval)

    if ideal_interval < 300:
        return ("metrics_1m", 60)

    if ideal_interval < 3600:
        return ("metrics_5m", 300)

    if ideal_interval < 6 * 3600:
        return ("metrics_1h", 3600)

    return ("metrics_1h", 6 * 3600)
