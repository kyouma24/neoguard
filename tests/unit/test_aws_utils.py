"""Unit tests for AWS utility functions (no DB or AWS credentials needed)."""

from neoguard.services.aws.cloudwatch import (
    METRIC_DEFINITIONS,
    NAMESPACE_DIMENSION_KEY,
    _safe_id,
    _snake_case,
)
from neoguard.services.discovery.aws_discovery import _aws_tags_to_dict, _get_name_from_tags


class TestSafeId:
    def test_basic(self):
        assert _safe_id("my_metric") == "my_metric"

    def test_strips_special_chars(self):
        result = _safe_id("cpu-usage/percent")
        assert "-" not in result
        assert "/" not in result

    def test_numeric_prefix(self):
        result = _safe_id("123abc")
        assert result.startswith("m_")

    def test_max_length(self):
        long = "a" * 300
        result = _safe_id(long)
        assert len(result) <= 255

    def test_lowercase(self):
        result = _safe_id("CPU_Usage")
        assert result == "cpu_usage"


class TestSnakeCase:
    def test_camel_to_snake(self):
        assert _snake_case("CPUUtilization") == "cpuutilization"

    def test_mixed_case(self):
        assert _snake_case("FreeableMemory") == "freeable_memory"

    def test_already_lower(self):
        assert _snake_case("already_lower") == "already_lower"

    def test_dots_to_underscores(self):
        assert _snake_case("GetRecords.IteratorAge") == "get_records__iterator_age"


class TestAWSTagConversion:
    def test_standard_tags(self):
        tags = [{"Key": "Name", "Value": "web-01"}, {"Key": "env", "Value": "prod"}]
        result = _aws_tags_to_dict(tags)
        assert result == {"Name": "web-01", "env": "prod"}

    def test_lowercase_keys(self):
        tags = [{"key": "Name", "value": "web-01"}]
        result = _aws_tags_to_dict(tags)
        assert result == {"Name": "web-01"}

    def test_empty_list(self):
        assert _aws_tags_to_dict([]) == {}

    def test_none(self):
        assert _aws_tags_to_dict(None) == {}


class TestGetNameFromTags:
    def test_name_tag(self):
        assert _get_name_from_tags({"Name": "web-01"}, "fallback") == "web-01"

    def test_lowercase_name_tag(self):
        assert _get_name_from_tags({"name": "web-01"}, "fallback") == "web-01"

    def test_fallback(self):
        assert _get_name_from_tags({"env": "prod"}, "i-12345") == "i-12345"

    def test_empty_tags(self):
        assert _get_name_from_tags({}, "fallback") == "fallback"


class TestMetricDefinitions:
    def test_all_namespaces_have_definitions(self):
        for ns in NAMESPACE_DIMENSION_KEY:
            assert ns in METRIC_DEFINITIONS, f"Missing definitions for {ns}"

    def test_definitions_have_required_fields(self):
        for ns, defs in METRIC_DEFINITIONS.items():
            for d in defs:
                assert "name" in d, f"Missing name in {ns}"
                assert "stat" in d, f"Missing stat in {ns}: {d}"
                assert "unit" in d, f"Missing unit in {ns}: {d}"

    def test_namespace_count(self):
        assert len(METRIC_DEFINITIONS) >= 19

    def test_ec2_metrics(self):
        ec2_names = [d["name"] for d in METRIC_DEFINITIONS["AWS/EC2"]]
        assert "CPUUtilization" in ec2_names
        assert "NetworkIn" in ec2_names
        assert "StatusCheckFailed" in ec2_names
