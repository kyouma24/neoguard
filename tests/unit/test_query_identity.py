"""Unit tests for QueryIdentity — canonical query dedup keys."""

from __future__ import annotations

import pytest

from neoguard.services.mql.compiler import CompiledQuery
from neoguard.services.mql.identity import CACHE_KEY_PREFIX, QueryIdentity, _align_ts


def _make_compiled(sql: str = "SELECT avg(value) FROM metrics_1m WHERE tenant_id = $1", params: tuple = ("t-1",)) -> CompiledQuery:
    return CompiledQuery(sql=sql, params=params, metric_name="aws.ec2.cpu", post_processors=())


class TestQueryIdentityDeterminism:
    def test_same_inputs_produce_same_key(self):
        compiled = _make_compiled()
        id1 = QueryIdentity.from_compiled("tenant-a", compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        id2 = QueryIdentity.from_compiled("tenant-a", compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        assert id1.cache_key == id2.cache_key

    def test_different_tenant_produces_different_key(self):
        compiled = _make_compiled()
        id1 = QueryIdentity.from_compiled("tenant-a", compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        id2 = QueryIdentity.from_compiled("tenant-b", compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        assert id1.cache_key != id2.cache_key

    def test_different_sql_produces_different_key(self):
        c1 = _make_compiled(sql="SELECT avg(value) FROM metrics_1m WHERE tenant_id = $1")
        c2 = _make_compiled(sql="SELECT max(value) FROM metrics_1m WHERE tenant_id = $1")
        id1 = QueryIdentity.from_compiled("tenant-a", c1, from_ts=1000, to_ts=2000, interval_sec=60)
        id2 = QueryIdentity.from_compiled("tenant-a", c2, from_ts=1000, to_ts=2000, interval_sec=60)
        assert id1.cache_key != id2.cache_key

    def test_different_time_range_produces_different_key(self):
        compiled = _make_compiled()
        id1 = QueryIdentity.from_compiled("tenant-a", compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        id2 = QueryIdentity.from_compiled("tenant-a", compiled, from_ts=3000, to_ts=4000, interval_sec=60)
        assert id1.cache_key != id2.cache_key


class TestTimeAlignment:
    def test_alignment_rounds_down_to_interval(self):
        compiled = _make_compiled()
        identity = QueryIdentity.from_compiled("t", compiled, from_ts=61, to_ts=121, interval_sec=60)
        assert identity.aligned_from == 60
        assert identity.aligned_to == 120

    def test_zero_interval_does_not_crash(self):
        assert _align_ts(61, 0) == 61

    def test_already_aligned_unchanged(self):
        compiled = _make_compiled()
        identity = QueryIdentity.from_compiled("t", compiled, from_ts=120, to_ts=240, interval_sec=60)
        assert identity.aligned_from == 120
        assert identity.aligned_to == 240


class TestSuperAdminPath:
    def test_none_tenant_uses_cross_tenant_marker(self):
        compiled = _make_compiled()
        identity = QueryIdentity.from_compiled(None, compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        assert "CROSS_TENANT" in identity.cache_key
        assert identity.tenant_id == "CROSS_TENANT"


class TestKeyProperties:
    def test_singleflight_key_matches_cache_key(self):
        compiled = _make_compiled()
        identity = QueryIdentity.from_compiled("tenant-x", compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        assert identity.singleflight_key == identity.cache_key

    def test_cache_key_has_expected_prefix(self):
        compiled = _make_compiled()
        identity = QueryIdentity.from_compiled("tenant-x", compiled, from_ts=1000, to_ts=2000, interval_sec=60)
        assert identity.cache_key.startswith(f"{CACHE_KEY_PREFIX}:")
