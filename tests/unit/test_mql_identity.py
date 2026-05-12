"""Tests for QueryIdentity primitive — Task 0.1.

Three test layers:
  A. Dataclass behavior (equality, hash, frozen, properties)
  B. from_compiled() factory (correct identity from CompiledQuery)
  C. Regression: QueryIdentity.cache_key == make_cache_key() for 8 inputs
"""

import hashlib

import orjson
import pytest

from neoguard.services.mql.compiler import CompiledQuery
from neoguard.services.mql.cache import make_cache_key
from neoguard.services.mql.identity import QueryIdentity, _align_ts


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SQL_A = "SELECT time_bucket('60s', ts) AS bucket, avg(value) FROM metrics WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket ORDER BY bucket"
SQL_B = "SELECT time_bucket('300s', ts) AS bucket, max(value) FROM metrics_5m WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket ORDER BY bucket"
PARAMS_A = ("tenant-abc", "aws.ec2.cpu")
PARAMS_B = ("tenant-abc", "aws.rds.connections")

COMPILED_A = CompiledQuery(sql=SQL_A, params=PARAMS_A, metric_name="aws.ec2.cpu", post_processors=())
COMPILED_B = CompiledQuery(sql=SQL_B, params=PARAMS_B, metric_name="aws.rds.connections", post_processors=())


# ---------------------------------------------------------------------------
# Layer A: Dataclass behavior
# ---------------------------------------------------------------------------


class TestDataclassBehavior:
    def test_frozen_immutability(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        with pytest.raises(Exception):
            identity.tenant_id = "changed"  # type: ignore[misc]

    def test_equality_same_inputs(self):
        a = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        b = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        assert a == b

    def test_hash_same_inputs(self):
        a = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        b = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        assert hash(a) == hash(b)

    def test_inequality_different_tenant(self):
        a = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        b = QueryIdentity.from_compiled("t2", COMPILED_A, 1000, 2000, 60)
        assert a != b

    def test_inequality_different_sql(self):
        a = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        b = QueryIdentity.from_compiled("t1", COMPILED_B, 1000, 2000, 60)
        assert a != b

    def test_inequality_different_time(self):
        a = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        b = QueryIdentity.from_compiled("t1", COMPILED_A, 3000, 4000, 60)
        assert a != b

    def test_inequality_different_interval(self):
        a = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        b = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 300)
        assert a != b

    def test_str_returns_cache_key(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        assert str(identity) == identity.cache_key

    def test_singleflight_key_equals_cache_key(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        assert identity.singleflight_key == identity.cache_key

    def test_usable_as_dict_key(self):
        a = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        d = {a: "value"}
        b = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        assert d[b] == "value"


# ---------------------------------------------------------------------------
# Layer B: from_compiled() factory
# ---------------------------------------------------------------------------


class TestFromCompiled:
    def test_sql_hash_is_sha256_prefix(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        expected = hashlib.sha256(SQL_A.encode()).hexdigest()[:32]
        assert identity.sql_hash == expected

    def test_params_hash_is_sha256_of_orjson(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 1000, 2000, 60)
        expected = hashlib.sha256(orjson.dumps(PARAMS_A)).hexdigest()[:32]
        assert identity.params_hash == expected

    def test_alignment_floors_timestamps(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 999, 2001, 60)
        assert identity.aligned_from == 960  # 999 // 60 * 60
        assert identity.aligned_to == 1980  # 2001 // 60 * 60

    def test_none_tenant_maps_to_cross_tenant(self):
        identity = QueryIdentity.from_compiled(None, COMPILED_A, 1000, 2000, 60)
        assert identity.tenant_id == "CROSS_TENANT"

    def test_empty_string_tenant_maps_to_cross_tenant(self):
        identity = QueryIdentity.from_compiled("", COMPILED_A, 1000, 2000, 60)
        assert identity.tenant_id == "CROSS_TENANT"

    def test_zero_interval_no_alignment(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 999, 2001, 0)
        assert identity.aligned_from == 999
        assert identity.aligned_to == 2001

    def test_negative_interval_no_alignment(self):
        identity = QueryIdentity.from_compiled("t1", COMPILED_A, 999, 2001, -5)
        assert identity.aligned_from == 999
        assert identity.aligned_to == 2001


# ---------------------------------------------------------------------------
# Layer C: Regression — cache_key == make_cache_key() for 8 inputs
# ---------------------------------------------------------------------------


class TestCacheKeyRegression:
    """QueryIdentity.from_compiled(...).cache_key MUST produce the same
    string as make_cache_key(...) for identical inputs."""

    def _assert_equivalence(
        self,
        tenant_id: str | None,
        compiled: CompiledQuery,
        from_ts: int,
        to_ts: int,
        interval: int,
    ):
        identity_key = QueryIdentity.from_compiled(
            tenant_id, compiled, from_ts, to_ts, interval
        ).cache_key

        legacy_key = make_cache_key(
            tenant_id, compiled.sql, from_ts, to_ts, interval
        )

        assert identity_key == legacy_key, (
            f"Regression: keys diverge.\n"
            f"  identity: {identity_key}\n"
            f"  legacy:   {legacy_key}"
        )

    def test_normal_tenant(self):
        self._assert_equivalence("tenant-abc-123", COMPILED_A, 1000, 2000, 60)

    def test_none_tenant(self):
        self._assert_equivalence(None, COMPILED_A, 1000, 2000, 60)

    def test_empty_string_tenant(self):
        self._assert_equivalence("", COMPILED_A, 1000, 2000, 60)

    def test_unicode_tenant(self):
        self._assert_equivalence("tenant-ünicode-中文", COMPILED_A, 1000, 2000, 60)

    def test_different_sql(self):
        self._assert_equivalence("t1", COMPILED_B, 1000, 2000, 300)

    def test_different_time_range(self):
        self._assert_equivalence("t1", COMPILED_A, 86400, 172800, 60)

    def test_different_interval(self):
        self._assert_equivalence("t1", COMPILED_A, 1000, 2000, 300)

    def test_alignment_edge(self):
        self._assert_equivalence("t1", COMPILED_A, 999, 2001, 60)


# ---------------------------------------------------------------------------
# _align_ts unit tests
# ---------------------------------------------------------------------------


class TestAlignTs:
    def test_exact_boundary(self):
        assert _align_ts(120, 60) == 120

    def test_mid_interval(self):
        assert _align_ts(90, 60) == 60

    def test_zero_interval(self):
        assert _align_ts(999, 0) == 999

    def test_negative_interval(self):
        assert _align_ts(999, -1) == 999
