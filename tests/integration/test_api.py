"""Integration tests — require running TimescaleDB and ClickHouse.

Run with: pytest tests/integration/ -v
(after docker compose up -d timescaledb clickhouse)
"""

import pytest
from httpx import ASGITransport, AsyncClient

from neoguard.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.skipif(True, reason="Requires running databases")
class TestMetricIngestion:
    async def test_ingest_single_metric(self, client: AsyncClient):
        resp = await client.post("/api/v1/metrics/ingest", json={
            "metrics": [
                {"name": "test.metric", "value": 42.0, "tags": {"env": "test"}}
            ]
        })
        assert resp.status_code == 202
        data = resp.json()
        assert data["accepted"] == 1

    async def test_ingest_batch(self, client: AsyncClient):
        metrics = [
            {"name": "test.batch", "value": float(i), "tags": {"i": str(i)}}
            for i in range(100)
        ]
        resp = await client.post("/api/v1/metrics/ingest", json={"metrics": metrics})
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 100

    async def test_ingest_validation_error(self, client: AsyncClient):
        resp = await client.post("/api/v1/metrics/ingest", json={"metrics": []})
        assert resp.status_code == 422


@pytest.mark.skipif(True, reason="Requires running databases")
class TestLogIngestion:
    async def test_ingest_logs(self, client: AsyncClient):
        resp = await client.post("/api/v1/logs/ingest", json={
            "logs": [
                {"service": "test-svc", "message": "Test log entry", "severity": "info"}
            ]
        })
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 1


@pytest.mark.skipif(True, reason="Requires running databases")
class TestHealthEndpoint:
    async def test_health(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "checks" in data
        assert "writers" in data


@pytest.mark.skipif(True, reason="Requires running databases")
class TestAlertRules:
    async def test_create_and_list_rules(self, client: AsyncClient):
        resp = await client.post("/api/v1/alerts/rules", json={
            "name": "Test Alert",
            "metric_name": "test.metric",
            "condition": "gt",
            "threshold": 90.0,
        })
        assert resp.status_code == 201
        rule = resp.json()
        assert rule["name"] == "Test Alert"

        resp = await client.get("/api/v1/alerts/rules")
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) >= 1
