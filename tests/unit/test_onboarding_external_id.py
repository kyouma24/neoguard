"""Unit tests for cryptographic external ID generation."""

import re
import string

from neoguard.services.onboarding.external_id import generate_external_id


class TestExternalIdFormat:
    """Validate the ng-<40hex> output format."""

    def test_starts_with_prefix(self):
        result = generate_external_id("tenant-001")
        assert result.startswith("ng-")

    def test_total_length_is_43(self):
        result = generate_external_id("tenant-001")
        assert len(result) == 43, f"Expected 43 chars, got {len(result)}: {result}"

    def test_hex_portion_is_valid(self):
        result = generate_external_id("tenant-001")
        hex_part = result[3:]  # strip "ng-"
        assert len(hex_part) == 40
        assert all(c in string.hexdigits for c in hex_part)

    def test_matches_regex_pattern(self):
        result = generate_external_id("tenant-001")
        assert re.fullmatch(r"ng-[0-9a-f]{40}", result), f"Does not match pattern: {result}"


class TestExternalIdRandomness:
    """Ensure outputs are unpredictable and non-deterministic."""

    def test_same_tenant_produces_different_ids(self):
        id1 = generate_external_id("tenant-001")
        id2 = generate_external_id("tenant-001")
        assert id1 != id2, "Two calls with same tenant_id must produce different results"

    def test_different_tenants_produce_different_ids(self):
        id1 = generate_external_id("tenant-aaa")
        id2 = generate_external_id("tenant-bbb")
        assert id1 != id2, "Different tenant_ids should produce different results"

    def test_100_ids_all_unique(self):
        ids = {generate_external_id("collision-test") for _ in range(100)}
        assert len(ids) == 100, f"Expected 100 unique IDs, got {len(ids)}"

    def test_1000_ids_no_collisions(self):
        """Extended collision resistance check."""
        ids = set()
        for i in range(1000):
            eid = generate_external_id(f"tenant-{i % 10}")
            assert eid not in ids, f"Collision on iteration {i}: {eid}"
            ids.add(eid)


class TestExternalIdEdgeCases:
    """Handle unusual tenant_id inputs gracefully."""

    def test_empty_tenant_id(self):
        result = generate_external_id("")
        assert result.startswith("ng-")
        assert len(result) == 43

    def test_long_tenant_id(self):
        long_id = "t" * 10_000
        result = generate_external_id(long_id)
        assert result.startswith("ng-")
        assert len(result) == 43

    def test_unicode_tenant_id(self):
        result = generate_external_id("tenant-éèê")
        assert result.startswith("ng-")
        assert len(result) == 43

    def test_special_characters_in_tenant_id(self):
        result = generate_external_id("tenant/with|pipes&special=chars!@#$%")
        assert result.startswith("ng-")
        assert len(result) == 43
        hex_part = result[3:]
        assert all(c in string.hexdigits for c in hex_part)

    def test_newlines_in_tenant_id(self):
        result = generate_external_id("tenant\nwith\nnewlines\r\n")
        assert result.startswith("ng-")
        assert len(result) == 43

    def test_null_bytes_in_tenant_id(self):
        result = generate_external_id("tenant\x00with\x00nulls")
        assert result.startswith("ng-")
        assert len(result) == 43

    def test_uuid_style_tenant_id(self):
        result = generate_external_id("01903f7a-1b3c-7def-8abc-1234567890ab")
        assert result.startswith("ng-")
        assert len(result) == 43


class TestExternalIdSecurity:
    """Verify output does not leak input data."""

    def test_tenant_id_not_in_output(self):
        tenant = "super-secret-tenant-42"
        result = generate_external_id(tenant)
        assert tenant not in result

    def test_tenant_id_hex_not_in_output(self):
        """Even hex-encoded tenant should not appear verbatim."""
        tenant = "abcdef"
        result = generate_external_id(tenant)
        # The 40-char hex portion should not start with or contain the tenant
        # as a recognizable substring (probabilistically near-zero, but check)
        hex_part = result[3:]
        # We just verify the output is not simply hex(tenant_id)
        assert hex_part != tenant.encode().hex().ljust(40, "0")

    def test_output_is_lowercase_hex(self):
        """HMAC hexdigest returns lowercase; verify no uppercase leaks."""
        for _ in range(10):
            result = generate_external_id("test")
            hex_part = result[3:]
            assert hex_part == hex_part.lower()
