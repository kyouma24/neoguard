import math
from datetime import datetime, timezone

import pytest

from neoguard.services.mql.ast_nodes import (
    AbsFunc,
    AsCountFunc,
    AsRateFunc,
    DerivativeFunc,
    LogFunc,
    MovingAverageFunc,
    RateFunc,
)
from neoguard.services.mql.executor import (
    _apply_functions,
    _compute_as_count,
    _compute_derivative,
    _compute_moving_average,
    _compute_rate,
)
from neoguard.models.metrics import MetricQueryResult


def _ts(minute: int) -> datetime:
    return datetime(2026, 5, 1, 0, minute, 0, tzinfo=timezone.utc)


def _result(datapoints: list[tuple[datetime, float | None]]) -> MetricQueryResult:
    return MetricQueryResult(name="test", tags={}, datapoints=datapoints)


class TestRateFunction:
    def test_basic_rate(self):
        dps = [(_ts(0), 0.0), (_ts(1), 60.0), (_ts(2), 180.0)]
        result = _compute_rate(dps)
        assert result[0] == (_ts(0), None)
        assert result[1][1] == pytest.approx(1.0)
        assert result[2][1] == pytest.approx(2.0)

    def test_counter_reset_clamped_to_zero(self):
        dps = [(_ts(0), 100.0), (_ts(1), 50.0)]
        result = _compute_rate(dps)
        assert result[1][1] == 0.0

    def test_single_point_returns_none(self):
        dps = [(_ts(0), 100.0)]
        result = _compute_rate(dps)
        assert result[0][1] is None

    def test_none_values_propagate(self):
        dps = [(_ts(0), 10.0), (_ts(1), None), (_ts(2), 30.0)]
        result = _compute_rate(dps)
        assert result[1][1] is None
        assert result[2][1] is None

    def test_empty_input(self):
        assert _compute_rate([]) == []


class TestDerivativeFunction:
    def test_basic_derivative(self):
        dps = [(_ts(0), 0.0), (_ts(1), 60.0), (_ts(2), 180.0)]
        result = _compute_derivative(dps)
        assert result[1][1] == pytest.approx(1.0)
        assert result[2][1] == pytest.approx(2.0)

    def test_allows_negative_derivative(self):
        dps = [(_ts(0), 100.0), (_ts(1), 40.0)]
        result = _compute_derivative(dps)
        assert result[1][1] == pytest.approx(-1.0)

    def test_single_point(self):
        dps = [(_ts(0), 100.0)]
        result = _compute_derivative(dps)
        assert result[0][1] is None


class TestMovingAverage:
    def test_window_3(self):
        dps = [(_ts(i), float(i)) for i in range(5)]
        result = _compute_moving_average(dps, 3)
        assert result[0][1] is None
        assert result[1][1] is None
        assert result[2][1] == pytest.approx(1.0)
        assert result[3][1] == pytest.approx(2.0)
        assert result[4][1] == pytest.approx(3.0)

    def test_window_1_is_identity(self):
        dps = [(_ts(0), 5.0), (_ts(1), 10.0)]
        result = _compute_moving_average(dps, 1)
        assert result[0][1] == pytest.approx(5.0)
        assert result[1][1] == pytest.approx(10.0)

    def test_none_values_excluded_from_buffer(self):
        dps = [(_ts(0), 1.0), (_ts(1), None), (_ts(2), 3.0)]
        result = _compute_moving_average(dps, 2)
        assert result[0][1] is None
        assert result[1][1] is None
        # buffer has [1.0, 3.0] — None was skipped, buffer fills from non-None values
        assert result[2][1] == pytest.approx(2.0)


class TestAsCount:
    def test_basic_as_count(self):
        dps = [(_ts(0), 100.0), (_ts(1), 150.0), (_ts(2), 200.0)]
        result = _compute_as_count(dps)
        assert result[0][1] is None
        assert result[1][1] == pytest.approx(50.0)
        assert result[2][1] == pytest.approx(50.0)

    def test_counter_reset_clamped(self):
        dps = [(_ts(0), 100.0), (_ts(1), 50.0)]
        result = _compute_as_count(dps)
        assert result[1][1] == 0.0


class TestAbsFunction:
    def test_abs_via_apply(self):
        r = _result([(_ts(0), -5.0), (_ts(1), 3.0), (_ts(2), None)])
        result = _apply_functions(r, (AbsFunc(),))
        assert result.datapoints[0][1] == 5.0
        assert result.datapoints[1][1] == 3.0
        assert result.datapoints[2][1] is None


class TestLogFunction:
    def test_log_positive(self):
        r = _result([(_ts(0), math.e), (_ts(1), 1.0)])
        result = _apply_functions(r, (LogFunc(),))
        assert result.datapoints[0][1] == pytest.approx(1.0)
        assert result.datapoints[1][1] == pytest.approx(0.0)

    def test_log_zero_returns_none(self):
        r = _result([(_ts(0), 0.0)])
        result = _apply_functions(r, (LogFunc(),))
        assert result.datapoints[0][1] is None

    def test_log_negative_returns_none(self):
        r = _result([(_ts(0), -5.0)])
        result = _apply_functions(r, (LogFunc(),))
        assert result.datapoints[0][1] is None

    def test_log_none_returns_none(self):
        r = _result([(_ts(0), None)])
        result = _apply_functions(r, (LogFunc(),))
        assert result.datapoints[0][1] is None


class TestFunctionChaining:
    def test_rate_then_abs(self):
        r = _result([(_ts(0), 100.0), (_ts(1), 40.0)])
        result = _apply_functions(r, (DerivativeFunc(), AbsFunc()))
        assert result.datapoints[0][1] is None
        assert result.datapoints[1][1] == pytest.approx(1.0)

    def test_preserves_name_and_tags(self):
        r = MetricQueryResult(name="cpu", tags={"host": "web-1"}, datapoints=[(_ts(0), 5.0)])
        result = _apply_functions(r, (AbsFunc(),))
        assert result.name == "cpu"
        assert result.tags == {"host": "web-1"}
