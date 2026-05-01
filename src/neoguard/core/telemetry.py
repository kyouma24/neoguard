"""Lightweight in-process metrics registry for self-monitoring.

Three metric types:
- Counter: monotonically increasing, reset on flush
- Gauge: point-in-time value
- Histogram: bounded circular buffer for latency percentiles
"""

import threading
from collections import deque


class Counter:
    __slots__ = ("_value", "_lock")

    def __init__(self) -> None:
        self._value: float = 0.0
        self._lock = threading.Lock()

    def inc(self, value: float = 1.0) -> None:
        with self._lock:
            self._value += value

    def get(self) -> float:
        return self._value

    def reset(self) -> float:
        with self._lock:
            val = self._value
            self._value = 0.0
            return val


class Gauge:
    __slots__ = ("_value",)

    def __init__(self) -> None:
        self._value: float = 0.0

    def set(self, value: float) -> None:
        self._value = value

    def inc(self, value: float = 1.0) -> None:
        self._value += value

    def dec(self, value: float = 1.0) -> None:
        self._value -= value

    def get(self) -> float:
        return self._value


class Histogram:
    __slots__ = ("_buffer", "_count", "_sum", "_lock")

    def __init__(self, buffer_size: int = 4096) -> None:
        self._buffer: deque[float] = deque(maxlen=buffer_size)
        self._count: int = 0
        self._sum: float = 0.0
        self._lock = threading.Lock()

    def observe(self, value: float) -> None:
        with self._lock:
            self._buffer.append(value)
            self._count += 1
            self._sum += value

    def percentiles(self, quantiles: list[float] | None = None) -> dict[float, float]:
        if quantiles is None:
            quantiles = [0.5, 0.95, 0.99]
        with self._lock:
            if not self._buffer:
                return {q: 0.0 for q in quantiles}
            sorted_vals = sorted(self._buffer)
        result = {}
        n = len(sorted_vals)
        for q in quantiles:
            idx = int(q * (n - 1))
            result[q] = sorted_vals[idx]
        return result

    def count(self) -> int:
        return self._count

    def sum(self) -> float:
        return self._sum

    def reset(self) -> dict:
        with self._lock:
            result = {
                "count": self._count,
                "sum": self._sum,
                "p50": 0.0,
                "p95": 0.0,
                "p99": 0.0,
            }
            if self._buffer:
                sorted_vals = sorted(self._buffer)
                n = len(sorted_vals)
                result["p50"] = sorted_vals[int(0.5 * (n - 1))]
                result["p95"] = sorted_vals[int(0.95 * (n - 1))]
                result["p99"] = sorted_vals[int(0.99 * (n - 1))]
            self._buffer.clear()
            self._count = 0
            self._sum = 0.0
            return result


class MetricsRegistry:

    def __init__(self) -> None:
        self._counters: dict[tuple[str, frozenset], Counter] = {}
        self._gauges: dict[tuple[str, frozenset], Gauge] = {}
        self._histograms: dict[tuple[str, frozenset], Histogram] = {}
        self._lock = threading.Lock()

    def counter(self, name: str, tags: dict[str, str] | None = None) -> Counter:
        key = (name, frozenset((tags or {}).items()))
        if key not in self._counters:
            with self._lock:
                if key not in self._counters:
                    self._counters[key] = Counter()
        return self._counters[key]

    def gauge(self, name: str, tags: dict[str, str] | None = None) -> Gauge:
        key = (name, frozenset((tags or {}).items()))
        if key not in self._gauges:
            with self._lock:
                if key not in self._gauges:
                    self._gauges[key] = Gauge()
        return self._gauges[key]

    def histogram(self, name: str, tags: dict[str, str] | None = None) -> Histogram:
        key = (name, frozenset((tags or {}).items()))
        if key not in self._histograms:
            with self._lock:
                if key not in self._histograms:
                    self._histograms[key] = Histogram()
        return self._histograms[key]

    def snapshot(self) -> dict:
        result: dict[str, list[dict]] = {
            "counters": [],
            "gauges": [],
            "histograms": [],
        }
        for (name, frozen_tags), c in self._counters.items():
            result["counters"].append({
                "name": name,
                "tags": dict(frozen_tags),
                "value": c.get(),
            })
        for (name, frozen_tags), g in self._gauges.items():
            result["gauges"].append({
                "name": name,
                "tags": dict(frozen_tags),
                "value": g.get(),
            })
        for (name, frozen_tags), h in self._histograms.items():
            result["histograms"].append({
                "name": name,
                "tags": dict(frozen_tags),
                "count": h.count(),
                "sum": h.sum(),
                "percentiles": h.percentiles(),
            })
        return result


registry = MetricsRegistry()
