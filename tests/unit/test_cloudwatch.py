"""Unit tests for CloudWatch metrics collector — extra tags merging."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from neoguard.models.aws import AWSAccount
from neoguard.services.aws.cloudwatch import collect_cloudwatch_metrics


def _make_account(**kwargs) -> AWSAccount:
    defaults = {
        "id": "acct-001",
        "tenant_id": "default",
        "name": "Test",
        "account_id": "123456789012",
        "regions": ["us-east-1"],
        "role_arn": "",
        "external_id": "",
        "enabled": True,
        "collect_config": {},
        "last_sync_at": None,
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
    }
    defaults.update(kwargs)
    return AWSAccount(**defaults)


def _mock_cw_response(query_ids, timestamps, values):
    """Build a CloudWatch GetMetricData page response."""
    results = []
    for qid in query_ids:
        results.append({
            "Id": qid,
            "Timestamps": timestamps,
            "Values": values,
        })
    return [{"MetricDataResults": results}]


@patch("neoguard.services.aws.cloudwatch.metric_writer", new_callable=MagicMock)
@patch("neoguard.services.aws.cloudwatch.get_client")
class TestCollectWithExtraTags:
    async def test_extra_tags_merged_into_metric_points(self, mock_client, mock_writer):
        mock_writer.write = AsyncMock()
        cw = MagicMock()
        mock_client.return_value = cw

        ts = [datetime(2026, 4, 30, 12, 0, 0, tzinfo=UTC)]
        paginator = MagicMock()
        cw.get_paginator.return_value = paginator

        query_id = None

        def fake_paginate(**kwargs):
            nonlocal query_id
            queries = kwargs["MetricDataQueries"]
            query_id = queries[0]["Id"]
            return [{"MetricDataResults": [{
                "Id": query_id,
                "Timestamps": ts,
                "Values": [42.0],
            }]}]

        paginator.paginate = fake_paginate

        extra_tags = {
            "instance_type": "c5.2xlarge",
            "availability_zone": "us-east-1a",
            "vpc_id": "vpc-prod",
            "resource_name": "web-01",
            "resource_type": "ec2",
        }
        entries = [("i-abc123", extra_tags)]

        account = _make_account()
        count = await collect_cloudwatch_metrics(
            account, "us-east-1", "AWS/EC2", entries,
        )

        assert count >= 1
        mock_writer.write.assert_called_once()
        points = mock_writer.write.call_args[0][1]
        point = points[0]

        assert point.tags["resource_id"] == "i-abc123"
        assert point.tags["region"] == "us-east-1"
        assert point.tags["account_id"] == "123456789012"
        assert point.tags["namespace"] == "AWS/EC2"
        assert point.tags["instance_type"] == "c5.2xlarge"
        assert point.tags["availability_zone"] == "us-east-1a"
        assert point.tags["vpc_id"] == "vpc-prod"
        assert point.tags["resource_name"] == "web-01"
        assert point.tags["resource_type"] == "ec2"

    async def test_plain_string_entries_backward_compat(self, mock_client, mock_writer):
        mock_writer.write = AsyncMock()
        cw = MagicMock()
        mock_client.return_value = cw

        ts = [datetime(2026, 4, 30, 12, 0, 0, tzinfo=UTC)]
        paginator = MagicMock()
        cw.get_paginator.return_value = paginator

        def fake_paginate(**kwargs):
            queries = kwargs["MetricDataQueries"]
            return [{"MetricDataResults": [{
                "Id": queries[0]["Id"],
                "Timestamps": ts,
                "Values": [10.0],
            }]}]

        paginator.paginate = fake_paginate

        entries = ["i-plain"]

        account = _make_account()
        count = await collect_cloudwatch_metrics(
            account, "us-east-1", "AWS/EC2", entries,
        )

        assert count >= 1
        points = mock_writer.write.call_args[0][1]
        point = points[0]
        assert point.tags["resource_id"] == "i-plain"
        assert "instance_type" not in point.tags
        assert "availability_zone" not in point.tags

    async def test_empty_extra_tags_no_pollution(self, mock_client, mock_writer):
        mock_writer.write = AsyncMock()
        cw = MagicMock()
        mock_client.return_value = cw

        ts = [datetime(2026, 4, 30, 12, 0, 0, tzinfo=UTC)]
        paginator = MagicMock()
        cw.get_paginator.return_value = paginator

        def fake_paginate(**kwargs):
            queries = kwargs["MetricDataQueries"]
            return [{"MetricDataResults": [{
                "Id": queries[0]["Id"],
                "Timestamps": ts,
                "Values": [5.0],
            }]}]

        paginator.paginate = fake_paginate

        entries = [("i-empty", {})]

        account = _make_account()
        count = await collect_cloudwatch_metrics(
            account, "us-east-1", "AWS/EC2", entries,
        )

        assert count >= 1
        points = mock_writer.write.call_args[0][1]
        point = points[0]
        assert point.tags["resource_id"] == "i-empty"
        expected_keys = {"resource_id", "region", "account_id", "namespace", "stat"}
        assert set(point.tags.keys()) == expected_keys

    async def test_no_definitions_returns_zero(self, mock_client, mock_writer):
        account = _make_account()
        count = await collect_cloudwatch_metrics(
            account, "us-east-1", "AWS/FakeNamespace", [("res-1", {})],
        )
        assert count == 0

    async def test_no_dimension_key_returns_zero(self, mock_client, mock_writer):
        account = _make_account()
        count = await collect_cloudwatch_metrics(
            account, "us-east-1", "AWS/FakeService", ["res-1"],
        )
        assert count == 0

    async def test_multiple_resources_get_distinct_tags(self, mock_client, mock_writer):
        mock_writer.write = AsyncMock()
        cw = MagicMock()
        mock_client.return_value = cw

        ts = [datetime(2026, 4, 30, 12, 0, 0, tzinfo=UTC)]
        paginator = MagicMock()
        cw.get_paginator.return_value = paginator

        def fake_paginate(**kwargs):
            queries = kwargs["MetricDataQueries"]
            results = []
            for q in queries:
                results.append({
                    "Id": q["Id"],
                    "Timestamps": ts,
                    "Values": [99.0],
                })
            return [{"MetricDataResults": results}]

        paginator.paginate = fake_paginate

        entries = [
            ("i-web", {"instance_type": "t3.micro", "availability_zone": "us-east-1a"}),
            ("i-api", {"instance_type": "c5.xlarge", "availability_zone": "us-east-1b"}),
        ]

        account = _make_account()
        count = await collect_cloudwatch_metrics(
            account, "us-east-1", "AWS/EC2", entries,
        )

        assert count >= 2
        points = mock_writer.write.call_args[0][1]

        web_points = [p for p in points if p.tags["resource_id"] == "i-web"]
        api_points = [p for p in points if p.tags["resource_id"] == "i-api"]

        assert len(web_points) >= 1
        assert len(api_points) >= 1
        assert web_points[0].tags["instance_type"] == "t3.micro"
        assert web_points[0].tags["availability_zone"] == "us-east-1a"
        assert api_points[0].tags["instance_type"] == "c5.xlarge"
        assert api_points[0].tags["availability_zone"] == "us-east-1b"
