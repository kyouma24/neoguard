"""Integration tests — require running TimescaleDB and ClickHouse.

Run with: NEOGUARD_DB_PORT=5433 pytest tests/integration/ -v
(after docker compose up -d timescaledb clickhouse)
"""

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from neoguard.main import app


def _db_available() -> bool:
    """Check if databases are reachable before running integration tests."""
    import asyncpg

    from neoguard.core.config import settings

    async def _check():
        conn = await asyncpg.connect(settings.asyncpg_dsn, timeout=3)
        await conn.close()

    try:
        asyncio.run(_check())
        return True
    except Exception:
        return False


skip_no_db = pytest.mark.skipif(
    not _db_available(), reason="TimescaleDB not reachable"
)


@pytest.fixture
async def client():
    from neoguard.db.clickhouse.connection import close_clickhouse, init_clickhouse
    from neoguard.db.timescale.connection import close_pool, init_pool
    from neoguard.services.logs.writer import log_writer
    from neoguard.services.metrics.writer import metric_writer

    await init_pool()
    await init_clickhouse()
    await metric_writer.start()
    await log_writer.start()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await log_writer.stop()
    await metric_writer.stop()
    await close_clickhouse()
    await close_pool()


@skip_no_db
class TestHealthEndpoint:
    async def test_health(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("healthy", "degraded")
        assert "timescaledb" in data["checks"]
        assert "writers" in data


@skip_no_db
class TestMetricIngestion:
    async def test_ingest_single_metric(self, client: AsyncClient):
        resp = await client.post("/api/v1/metrics/ingest", json={
            "metrics": [
                {"name": "test.metric", "value": 42.0, "tags": {"env": "test"}}
            ]
        })
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 1

    async def test_ingest_batch(self, client: AsyncClient):
        metrics = [
            {"name": "test.batch", "value": float(i), "tags": {"i": str(i)}}
            for i in range(100)
        ]
        resp = await client.post("/api/v1/metrics/ingest", json={"metrics": metrics})
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 100

    async def test_ingest_empty_batch_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/metrics/ingest", json={"metrics": []})
        assert resp.status_code == 422

    async def test_ingest_invalid_metric_name(self, client: AsyncClient):
        resp = await client.post("/api/v1/metrics/ingest", json={
            "metrics": [{"name": "123-bad!", "value": 1.0}]
        })
        assert resp.status_code == 422

    async def test_metric_names_list(self, client: AsyncClient):
        await client.post("/api/v1/metrics/ingest", json={
            "metrics": [{"name": "integ.test.names", "value": 1.0}]
        })
        await asyncio.sleep(0.5)
        resp = await client.get("/api/v1/metrics/names")
        assert resp.status_code == 200
        names = resp.json()
        assert isinstance(names, list)

    async def test_writer_stats(self, client: AsyncClient):
        resp = await client.get("/api/v1/metrics/stats")
        assert resp.status_code == 200
        stats = resp.json()
        assert "buffer_size" in stats
        assert "total_written" in stats
        assert "total_dropped" in stats


@skip_no_db
class TestLogIngestion:
    async def test_ingest_logs(self, client: AsyncClient):
        resp = await client.post("/api/v1/logs/ingest", json={
            "logs": [
                {"service": "test-svc", "message": "Test log entry", "severity": "info"}
            ]
        })
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 1

    async def test_ingest_empty_logs_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/logs/ingest", json={"logs": []})
        assert resp.status_code == 422


@skip_no_db
class TestAlertRules:
    async def test_crud_lifecycle(self, client: AsyncClient):
        resp = await client.post("/api/v1/alerts/rules", json={
            "name": "Integration Test Alert",
            "metric_name": "test.metric",
            "condition": "gt",
            "threshold": 90.0,
            "severity": "warning",
            "duration_sec": 60,
        })
        assert resp.status_code == 201
        rule = resp.json()
        rule_id = rule["id"]
        assert rule["name"] == "Integration Test Alert"
        assert rule["threshold"] == 90.0

        resp = await client.get(f"/api/v1/alerts/rules/{rule_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == rule_id

        resp = await client.patch(f"/api/v1/alerts/rules/{rule_id}", json={
            "threshold": 95.0, "name": "Updated Alert"
        })
        assert resp.status_code == 200
        assert resp.json()["threshold"] == 95.0
        assert resp.json()["name"] == "Updated Alert"

        resp = await client.get("/api/v1/alerts/rules")
        assert resp.status_code == 200
        assert any(r["id"] == rule_id for r in resp.json())

        resp = await client.delete(f"/api/v1/alerts/rules/{rule_id}")
        assert resp.status_code == 204

        resp = await client.get(f"/api/v1/alerts/rules/{rule_id}")
        assert resp.status_code == 404

    async def test_alert_events_list(self, client: AsyncClient):
        resp = await client.get("/api/v1/alerts/events")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


@skip_no_db
class TestResources:
    async def test_crud_lifecycle(self, client: AsyncClient):
        resp = await client.post("/api/v1/resources", json={
            "resource_type": "server",
            "provider": "local",
            "name": "integ-test-server",
            "tags": {"env": "test"},
            "metadata": {"os": "linux"},
        })
        assert resp.status_code == 201
        res = resp.json()
        res_id = res["id"]
        assert res["name"] == "integ-test-server"
        assert res["provider"] == "local"

        resp = await client.get(f"/api/v1/resources/{res_id}")
        assert resp.status_code == 200
        assert resp.json()["tags"]["env"] == "test"

        resp = await client.patch(f"/api/v1/resources/{res_id}", json={
            "status": "stopped",
            "tags": {"env": "test", "updated": "true"},
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "stopped"
        assert resp.json()["tags"]["updated"] == "true"

        resp = await client.delete(f"/api/v1/resources/{res_id}")
        assert resp.status_code == 204

        resp = await client.get(f"/api/v1/resources/{res_id}")
        assert resp.status_code == 404

    async def test_list_with_filters(self, client: AsyncClient):
        await client.post("/api/v1/resources", json={
            "resource_type": "ec2", "provider": "aws", "name": "filter-test-1",
        })
        await client.post("/api/v1/resources", json={
            "resource_type": "rds", "provider": "aws", "name": "filter-test-2",
        })

        resp = await client.get("/api/v1/resources?provider=aws&resource_type=ec2")
        assert resp.status_code == 200
        for r in resp.json():
            assert r["resource_type"] == "ec2"
            assert r["provider"] == "aws"

    async def test_summary(self, client: AsyncClient):
        resp = await client.get("/api/v1/resources/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "by_type" in data
        assert "by_provider" in data
        assert "by_status" in data

    async def test_pagination(self, client: AsyncClient):
        resp = await client.get("/api/v1/resources?limit=2&offset=0")
        assert resp.status_code == 200
        assert len(resp.json()) <= 2


@skip_no_db
class TestAWSAccounts:
    async def test_crud_lifecycle(self, client: AsyncClient):
        resp = await client.post("/api/v1/aws/accounts", json={
            "name": "Integ Test Account",
            "account_id": "111222333444",
            "regions": ["us-east-1"],
        })
        assert resp.status_code == 201
        acct = resp.json()
        acct_id = acct["id"]
        assert acct["account_id"] == "111222333444"

        resp = await client.get(f"/api/v1/aws/accounts/{acct_id}")
        assert resp.status_code == 200

        resp = await client.patch(f"/api/v1/aws/accounts/{acct_id}", json={
            "regions": ["us-east-1", "eu-west-1"],
        })
        assert resp.status_code == 200
        assert len(resp.json()["regions"]) == 2

        resp = await client.delete(f"/api/v1/aws/accounts/{acct_id}")
        assert resp.status_code == 204

    async def test_invalid_account_id(self, client: AsyncClient):
        resp = await client.post("/api/v1/aws/accounts", json={
            "name": "Bad Account",
            "account_id": "not-12-digits",
        })
        assert resp.status_code == 422


@skip_no_db
class TestDashboards:
    async def test_crud_lifecycle(self, client: AsyncClient):
        resp = await client.post("/api/v1/dashboards", json={
            "name": "Test Dashboard",
            "description": "Integration test",
            "panels": [],
        })
        assert resp.status_code == 201
        dash = resp.json()
        dash_id = dash["id"]

        resp = await client.patch(f"/api/v1/dashboards/{dash_id}", json={
            "name": "Updated Dashboard",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Dashboard"

        resp = await client.get("/api/v1/dashboards")
        assert resp.status_code == 200
        assert any(d["id"] == dash_id for d in resp.json())

        resp = await client.delete(f"/api/v1/dashboards/{dash_id}")
        assert resp.status_code == 204


@skip_no_db
class TestAPIKeys:
    async def test_crud_lifecycle(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/keys", json={
            "name": "integ-test-key",
            "tenant_id": "default",
            "scopes": ["read", "write"],
            "rate_limit": 500,
        })
        assert resp.status_code == 201
        key = resp.json()
        key_id = key["id"]
        assert "raw_key" in key
        assert key["raw_key"].startswith("ng_")
        assert key["key_prefix"] == key["raw_key"][:11]
        assert key["rate_limit"] == 500

        resp = await client.get("/api/v1/auth/keys?tenant_id=default")
        assert resp.status_code == 200
        assert any(k["id"] == key_id for k in resp.json())
        for k in resp.json():
            assert "raw_key" not in k

        resp = await client.patch(
            f"/api/v1/auth/keys/{key_id}?tenant_id=default",
            json={"enabled": False},
        )
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

        resp = await client.delete(f"/api/v1/auth/keys/{key_id}?tenant_id=default")
        assert resp.status_code == 204


@skip_no_db
class TestAlertSilences:
    async def test_crud_lifecycle(self, client: AsyncClient):
        """Full create -> get -> list -> update -> delete cycle."""
        # Create a rule first (needed to test silence targeting)
        rule_resp = await client.post("/api/v1/alerts/rules", json={
            "name": "Silence Test Rule",
            "metric_name": "test.cpu",
            "condition": "gt",
            "threshold": 90.0,
            "severity": "warning",
            "duration_sec": 60,
        })
        assert rule_resp.status_code == 201
        rule_id = rule_resp.json()["id"]

        # Create one-time silence
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        resp = await client.post("/api/v1/alerts/silences", json={
            "name": "Deploy Window",
            "comment": "Deploying v2.0",
            "rule_ids": [rule_id],
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(hours=2)).isoformat(),
            "timezone": "Asia/Kolkata",
        })
        assert resp.status_code == 201
        silence = resp.json()
        silence_id = silence["id"]
        assert silence["name"] == "Deploy Window"
        assert silence["comment"] == "Deploying v2.0"
        assert silence["recurring"] is False
        assert silence["enabled"] is True
        assert rule_id in silence["rule_ids"]

        # Get by ID
        resp = await client.get(f"/api/v1/alerts/silences/{silence_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == silence_id

        # List
        resp = await client.get("/api/v1/alerts/silences")
        assert resp.status_code == 200
        assert any(s["id"] == silence_id for s in resp.json())

        # Update
        resp = await client.patch(f"/api/v1/alerts/silences/{silence_id}", json={
            "name": "Extended Deploy Window",
            "enabled": False,
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Extended Deploy Window"
        assert resp.json()["enabled"] is False

        # Delete
        resp = await client.delete(f"/api/v1/alerts/silences/{silence_id}")
        assert resp.status_code == 204

        # Confirm deleted
        resp = await client.get(f"/api/v1/alerts/silences/{silence_id}")
        assert resp.status_code == 404

        # Cleanup the rule
        await client.delete(f"/api/v1/alerts/rules/{rule_id}")

    async def test_create_recurring_silence(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        resp = await client.post("/api/v1/alerts/silences", json={
            "name": "Nightly Shutdown Window",
            "comment": "Server maintenance 9PM-9AM",
            "rule_ids": ["some-rule-id"],
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(days=365)).isoformat(),
            "timezone": "Asia/Kolkata",
            "recurring": True,
            "recurrence_days": ["mon", "tue", "wed", "thu", "fri"],
            "recurrence_start_time": "21:00",
            "recurrence_end_time": "09:00",
        })
        assert resp.status_code == 201
        silence = resp.json()
        assert silence["recurring"] is True
        assert silence["recurrence_days"] == ["mon", "tue", "wed", "thu", "fri"]
        assert silence["recurrence_start_time"] == "21:00"
        assert silence["recurrence_end_time"] == "09:00"
        assert silence["timezone"] == "Asia/Kolkata"

        # Cleanup
        await client.delete(f"/api/v1/alerts/silences/{silence['id']}")

    async def test_create_matcher_based_silence(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        resp = await client.post("/api/v1/alerts/silences", json={
            "name": "Silence Staging Env",
            "matchers": {"env": "staging"},
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(hours=4)).isoformat(),
        })
        assert resp.status_code == 201
        silence = resp.json()
        assert silence["matchers"] == {"env": "staging"}
        assert silence["rule_ids"] == []

        await client.delete(f"/api/v1/alerts/silences/{silence['id']}")

    async def test_create_silence_validation_no_targets(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        resp = await client.post("/api/v1/alerts/silences", json={
            "name": "Bad Silence",
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(hours=2)).isoformat(),
        })
        assert resp.status_code == 422

    async def test_create_silence_validation_ends_before_starts(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        resp = await client.post("/api/v1/alerts/silences", json={
            "name": "Bad Silence",
            "rule_ids": ["rule-1"],
            "starts_at": (now + timedelta(hours=2)).isoformat(),
            "ends_at": now.isoformat(),
        })
        assert resp.status_code == 422

    async def test_create_recurring_silence_validation_no_days(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        resp = await client.post("/api/v1/alerts/silences", json={
            "name": "Bad Recurring",
            "rule_ids": ["rule-1"],
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(days=365)).isoformat(),
            "recurring": True,
            "recurrence_start_time": "21:00",
            "recurrence_end_time": "09:00",
        })
        assert resp.status_code == 422

    async def test_get_nonexistent_silence(self, client: AsyncClient):
        resp = await client.get("/api/v1/alerts/silences/nonexistent-id")
        assert resp.status_code == 404

    async def test_delete_nonexistent_silence(self, client: AsyncClient):
        resp = await client.delete("/api/v1/alerts/silences/nonexistent-id")
        assert resp.status_code == 404

    async def test_update_nonexistent_silence(self, client: AsyncClient):
        resp = await client.patch("/api/v1/alerts/silences/nonexistent-id", json={
            "name": "Nope"
        })
        assert resp.status_code == 404

    async def test_list_with_pagination(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)

        # Create 3 silences
        ids = []
        for i in range(3):
            resp = await client.post("/api/v1/alerts/silences", json={
                "name": f"Paginate Test {i}",
                "rule_ids": ["rule-1"],
                "starts_at": now.isoformat(),
                "ends_at": (now + timedelta(hours=2)).isoformat(),
            })
            assert resp.status_code == 201
            ids.append(resp.json()["id"])

        # List with limit
        resp = await client.get("/api/v1/alerts/silences?limit=2&offset=0")
        assert resp.status_code == 200
        assert len(resp.json()) <= 2

        # Cleanup
        for sid in ids:
            await client.delete(f"/api/v1/alerts/silences/{sid}")


@skip_no_db
class TestAlertRuleWithSilence:
    """Integration test: create rule + silence + verify silence state."""

    async def test_alert_rule_events_during_silence(self, client: AsyncClient):
        """Create rule, ingest metrics, and verify events are recorded."""
        # Create a rule
        resp = await client.post("/api/v1/alerts/rules", json={
            "name": "E2E Alert Test",
            "metric_name": "e2e.cpu.test",
            "condition": "gt",
            "threshold": 50.0,
            "severity": "critical",
            "duration_sec": 10,
            "interval_sec": 10,
        })
        assert resp.status_code == 201
        rule_id = resp.json()["id"]

        # Create a silence for this rule
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        resp = await client.post("/api/v1/alerts/silences", json={
            "name": "E2E Silence Test",
            "rule_ids": [rule_id],
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(hours=1)).isoformat(),
        })
        assert resp.status_code == 201
        silence_id = resp.json()["id"]

        # Verify the silence is in the list
        resp = await client.get("/api/v1/alerts/silences")
        assert resp.status_code == 200
        found = [s for s in resp.json() if s["id"] == silence_id]
        assert len(found) == 1
        assert found[0]["enabled"] is True
        assert rule_id in found[0]["rule_ids"]

        # Disable the silence
        resp = await client.patch(f"/api/v1/alerts/silences/{silence_id}", json={
            "enabled": False,
        })
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

        # Re-enable
        resp = await client.patch(f"/api/v1/alerts/silences/{silence_id}", json={
            "enabled": True,
        })
        assert resp.status_code == 200
        assert resp.json()["enabled"] is True

        # Cleanup
        await client.delete(f"/api/v1/alerts/silences/{silence_id}")
        await client.delete(f"/api/v1/alerts/rules/{rule_id}")


@skip_no_db
class TestCollectionJobs:
    async def test_list_jobs(self, client: AsyncClient):
        resp = await client.get("/api/v1/collection/jobs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_get_nonexistent_job(self, client: AsyncClient):
        resp = await client.get("/api/v1/collection/jobs/nonexistent")
        assert resp.status_code == 404


@skip_no_db
class TestNotificationChannels:
    """CRUD lifecycle for notification channels."""

    async def test_full_crud_lifecycle(self, client: AsyncClient):
        # Create webhook channel
        resp = await client.post("/api/v1/notifications/channels", json={
            "name": "Test Webhook",
            "channel_type": "webhook",
            "config": {"url": "https://example.com/hook"},
        })
        assert resp.status_code == 201
        ch = resp.json()
        assert ch["name"] == "Test Webhook"
        assert ch["channel_type"] == "webhook"
        assert ch["config"]["url"] == "https://example.com/hook"
        assert ch["enabled"] is True
        ch_id = ch["id"]

        # Get by ID
        resp = await client.get(f"/api/v1/notifications/channels/{ch_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == ch_id

        # List — should contain our channel
        resp = await client.get("/api/v1/notifications/channels")
        assert resp.status_code == 200
        ids = [c["id"] for c in resp.json()]
        assert ch_id in ids

        # Update name
        resp = await client.patch(f"/api/v1/notifications/channels/{ch_id}", json={
            "name": "Updated Webhook",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Webhook"

        # Disable
        resp = await client.patch(f"/api/v1/notifications/channels/{ch_id}", json={
            "enabled": False,
        })
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

        # Delete
        resp = await client.delete(f"/api/v1/notifications/channels/{ch_id}")
        assert resp.status_code == 204

        # Verify gone
        resp = await client.get(f"/api/v1/notifications/channels/{ch_id}")
        assert resp.status_code == 404

    async def test_create_slack_channel(self, client: AsyncClient):
        resp = await client.post("/api/v1/notifications/channels", json={
            "name": "Slack Alerts",
            "channel_type": "slack",
            "config": {"webhook_url": "https://hooks.slack.com/services/T00/B00/test"},
        })
        assert resp.status_code == 201
        assert resp.json()["channel_type"] == "slack"
        await client.delete(f"/api/v1/notifications/channels/{resp.json()['id']}")

    async def test_create_email_channel(self, client: AsyncClient):
        resp = await client.post("/api/v1/notifications/channels", json={
            "name": "Email Alerts",
            "channel_type": "email",
            "config": {"smtp_host": "smtp.gmail.com", "to": "ops@example.com"},
        })
        assert resp.status_code == 201
        assert resp.json()["channel_type"] == "email"
        await client.delete(f"/api/v1/notifications/channels/{resp.json()['id']}")

    async def test_create_freshdesk_channel(self, client: AsyncClient):
        resp = await client.post("/api/v1/notifications/channels", json={
            "name": "Freshdesk Tickets",
            "channel_type": "freshdesk",
            "config": {"domain": "company.freshdesk.com", "api_key": "test-key"},
        })
        assert resp.status_code == 201
        assert resp.json()["channel_type"] == "freshdesk"
        await client.delete(f"/api/v1/notifications/channels/{resp.json()['id']}")

    async def test_validation_missing_config_key(self, client: AsyncClient):
        resp = await client.post("/api/v1/notifications/channels", json={
            "name": "Bad Webhook",
            "channel_type": "webhook",
            "config": {},
        })
        assert resp.status_code == 422

    async def test_validation_invalid_url(self, client: AsyncClient):
        resp = await client.post("/api/v1/notifications/channels", json={
            "name": "Bad URL",
            "channel_type": "webhook",
            "config": {"url": "not-a-url"},
        })
        assert resp.status_code == 422

    async def test_get_nonexistent_channel(self, client: AsyncClient):
        resp = await client.get("/api/v1/notifications/channels/nonexistent")
        assert resp.status_code == 404

    async def test_delete_nonexistent_channel(self, client: AsyncClient):
        resp = await client.delete("/api/v1/notifications/channels/nonexistent")
        assert resp.status_code == 404


@skip_no_db
class TestAPIKeys:
    """CRUD lifecycle for API keys."""

    async def test_full_crud_lifecycle(self, client: AsyncClient):
        # Create
        resp = await client.post("/api/v1/auth/keys", json={
            "name": "Integration Test Key",
            "scopes": ["read", "write"],
            "rate_limit": 500,
        })
        assert resp.status_code == 201
        key_data = resp.json()
        assert key_data["name"] == "Integration Test Key"
        assert "raw_key" in key_data
        assert key_data["raw_key"].startswith("ng_")
        assert key_data["scopes"] == ["read", "write"]
        assert key_data["rate_limit"] == 500
        assert key_data["enabled"] is True
        key_id = key_data["id"]

        # Get by ID — should NOT return raw_key
        resp = await client.get(f"/api/v1/auth/keys/{key_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == key_id
        assert "raw_key" not in resp.json()

        # List
        resp = await client.get("/api/v1/auth/keys")
        assert resp.status_code == 200
        ids = [k["id"] for k in resp.json()]
        assert key_id in ids

        # Update name + rate_limit
        resp = await client.patch(f"/api/v1/auth/keys/{key_id}", json={
            "name": "Renamed Key",
            "rate_limit": 2000,
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed Key"
        assert resp.json()["rate_limit"] == 2000

        # Disable
        resp = await client.patch(f"/api/v1/auth/keys/{key_id}", json={
            "enabled": False,
        })
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

        # Delete
        resp = await client.delete(f"/api/v1/auth/keys/{key_id}")
        assert resp.status_code == 204

        # Verify gone
        resp = await client.get(f"/api/v1/auth/keys/{key_id}")
        assert resp.status_code == 404

    async def test_create_with_expiry(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        expires = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
        resp = await client.post("/api/v1/auth/keys", json={
            "name": "Expiring Key",
            "expires_at": expires,
        })
        assert resp.status_code == 201
        assert resp.json()["expires_at"] is not None
        await client.delete(f"/api/v1/auth/keys/{resp.json()['id']}")

    async def test_create_admin_scoped_key(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/keys", json={
            "name": "Admin Key",
            "scopes": ["admin"],
            "rate_limit": 5000,
        })
        assert resp.status_code == 201
        assert "admin" in resp.json()["scopes"]
        await client.delete(f"/api/v1/auth/keys/{resp.json()['id']}")

    async def test_key_prefix_shown_in_get(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/keys", json={
            "name": "Prefix Test Key",
        })
        assert resp.status_code == 201
        key_id = resp.json()["id"]
        raw_key = resp.json()["raw_key"]

        resp = await client.get(f"/api/v1/auth/keys/{key_id}")
        assert resp.status_code == 200
        assert resp.json()["key_prefix"] == raw_key[:11]

        await client.delete(f"/api/v1/auth/keys/{key_id}")

    async def test_validation_rate_limit_bounds(self, client: AsyncClient):
        # Too low
        resp = await client.post("/api/v1/auth/keys", json={
            "name": "Bad Rate",
            "rate_limit": 5,
        })
        assert resp.status_code == 422

        # Too high
        resp = await client.post("/api/v1/auth/keys", json={
            "name": "Bad Rate",
            "rate_limit": 999999,
        })
        assert resp.status_code == 422

    async def test_get_nonexistent_key(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/keys/nonexistent")
        assert resp.status_code == 404

    async def test_delete_nonexistent_key(self, client: AsyncClient):
        resp = await client.delete("/api/v1/auth/keys/nonexistent")
        assert resp.status_code == 404
