"""Unit tests for collection orchestrator — tag extraction and metric threading."""

from datetime import datetime
from types import SimpleNamespace

from neoguard.services.collection.orchestrator import (
    NAMESPACE_FOR_TYPE,
    RESOURCE_ID_FIELD,
    _extract_metric_tags,
)


def _make_resource(**kwargs):
    defaults = {
        "id": "res-001",
        "tenant_id": "default",
        "resource_type": "ec2",
        "provider": "aws",
        "region": "us-east-1",
        "account_id": "123456789012",
        "name": "web-01",
        "external_id": "i-abc123",
        "tags": {},
        "metadata": {},
        "status": "active",
        "last_seen_at": None,
        "created_at": datetime(2026, 1, 1),
        "updated_at": datetime(2026, 1, 1),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestExtractMetricTags:
    def test_extracts_instance_type(self):
        res = _make_resource(metadata={"instance_type": "t3.micro"})
        tags = _extract_metric_tags(res)
        assert tags["instance_type"] == "t3.micro"

    def test_extracts_availability_zone(self):
        res = _make_resource(metadata={"availability_zone": "us-east-1a"})
        tags = _extract_metric_tags(res)
        assert tags["availability_zone"] == "us-east-1a"

    def test_extracts_vpc_id(self):
        res = _make_resource(metadata={"vpc_id": "vpc-abc123"})
        tags = _extract_metric_tags(res)
        assert tags["vpc_id"] == "vpc-abc123"

    def test_extracts_engine(self):
        res = _make_resource(
            resource_type="rds",
            metadata={"engine": "postgres", "instance_class": "db.r6g.large"},
        )
        tags = _extract_metric_tags(res)
        assert tags["engine"] == "postgres"
        assert tags["instance_class"] == "db.r6g.large"

    def test_extracts_node_type_for_elasticache(self):
        res = _make_resource(
            resource_type="elasticache",
            metadata={"node_type": "cache.r6g.large", "engine": "redis"},
        )
        tags = _extract_metric_tags(res)
        assert tags["node_type"] == "cache.r6g.large"
        assert tags["engine"] == "redis"

    def test_extracts_runtime_for_lambda(self):
        res = _make_resource(
            resource_type="lambda",
            metadata={"runtime": "python3.12"},
        )
        tags = _extract_metric_tags(res)
        assert tags["runtime"] == "python3.12"

    def test_extracts_launch_type_for_ecs(self):
        res = _make_resource(
            resource_type="ecs_service",
            metadata={"launch_type": "FARGATE"},
        )
        tags = _extract_metric_tags(res)
        assert tags["launch_type"] == "FARGATE"

    def test_always_includes_resource_name_and_type(self):
        res = _make_resource(name="web-01", resource_type="ec2", metadata={})
        tags = _extract_metric_tags(res)
        assert tags["resource_name"] == "web-01"
        assert tags["resource_type"] == "ec2"

    def test_skips_none_values(self):
        res = _make_resource(metadata={"instance_type": None, "vpc_id": "vpc-1"})
        tags = _extract_metric_tags(res)
        assert "instance_type" not in tags
        assert tags["vpc_id"] == "vpc-1"

    def test_skips_empty_string_values(self):
        res = _make_resource(metadata={"instance_type": "", "engine": "postgres"})
        tags = _extract_metric_tags(res)
        assert "instance_type" not in tags
        assert tags["engine"] == "postgres"

    def test_skips_non_string_values(self):
        res = _make_resource(metadata={"instance_type": 42, "vpc_id": "vpc-1"})
        tags = _extract_metric_tags(res)
        assert "instance_type" not in tags
        assert tags["vpc_id"] == "vpc-1"

    def test_handles_empty_metadata(self):
        res = _make_resource(metadata={})
        tags = _extract_metric_tags(res)
        assert tags["resource_name"] == "web-01"
        assert tags["resource_type"] == "ec2"
        assert "instance_type" not in tags

    def test_handles_none_metadata(self):
        res = _make_resource(metadata=None)
        tags = _extract_metric_tags(res)
        assert tags["resource_name"] == "web-01"

    def test_full_ec2_extraction(self):
        res = _make_resource(
            resource_type="ec2",
            name="web-prod-01",
            metadata={
                "instance_type": "c5.2xlarge",
                "availability_zone": "us-east-1a",
                "vpc_id": "vpc-prod",
                "private_ip": "10.0.1.5",
                "ami_id": "ami-abc123",
            },
        )
        tags = _extract_metric_tags(res)
        assert tags["instance_type"] == "c5.2xlarge"
        assert tags["availability_zone"] == "us-east-1a"
        assert tags["vpc_id"] == "vpc-prod"
        assert tags["resource_name"] == "web-prod-01"
        assert tags["resource_type"] == "ec2"
        assert "private_ip" not in tags
        assert "ami_id" not in tags


class TestNamespaceMappings:
    def test_all_resource_types_have_id_field(self):
        for rtype in NAMESPACE_FOR_TYPE:
            assert rtype in RESOURCE_ID_FIELD, f"Missing id field for {rtype}"

    def test_ec2_maps_to_aws_ec2(self):
        assert NAMESPACE_FOR_TYPE["ec2"] == "AWS/EC2"

    def test_ecs_service_maps_to_aws_ecs(self):
        assert NAMESPACE_FOR_TYPE["ecs_service"] == "AWS/ECS"

    def test_ecs_service_uses_name_field(self):
        assert RESOURCE_ID_FIELD["ecs_service"] == "name"

    def test_mapping_count(self):
        assert len(NAMESPACE_FOR_TYPE) == 24
        assert len(RESOURCE_ID_FIELD) == 24
