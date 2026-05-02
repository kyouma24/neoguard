from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TagFilter:
    """Base class for tag filter expressions."""
    pass


@dataclass(frozen=True)
class ExactMatch(TagFilter):
    key: str
    value: str


@dataclass(frozen=True)
class WildcardMatch(TagFilter):
    key: str
    pattern: str


@dataclass(frozen=True)
class NegationMatch(TagFilter):
    key: str
    value: str


@dataclass(frozen=True)
class InSetMatch(TagFilter):
    key: str
    values: tuple[str, ...]


@dataclass(frozen=True)
class MQLFunction:
    """Base class for post-aggregation functions."""
    pass


@dataclass(frozen=True)
class RateFunc(MQLFunction):
    pass


@dataclass(frozen=True)
class DerivativeFunc(MQLFunction):
    pass


@dataclass(frozen=True)
class MovingAverageFunc(MQLFunction):
    window: int


@dataclass(frozen=True)
class AsRateFunc(MQLFunction):
    pass


@dataclass(frozen=True)
class AsCountFunc(MQLFunction):
    pass


@dataclass(frozen=True)
class AbsFunc(MQLFunction):
    pass


@dataclass(frozen=True)
class LogFunc(MQLFunction):
    pass


@dataclass(frozen=True)
class Rollup:
    method: str
    seconds: int


@dataclass(frozen=True)
class MQLQuery:
    aggregator: str
    metric_name: str
    filters: tuple[TagFilter, ...] = field(default_factory=tuple)
    functions: tuple[MQLFunction, ...] = field(default_factory=tuple)
    rollup: Rollup | None = None
