# NeoGuard Deployment Guide

## Prerequisites

- Docker and Docker Compose
- Python 3.11+
- Node.js 18+ (for frontend)
- AWS account with IAM role (for cloud monitoring)

---

## Local Development Setup

### 1. Start Databases

```bash
docker compose up -d timescaledb clickhouse
```

Wait for health checks to pass:
```bash
docker compose ps
```

Both services should show `healthy` status. TimescaleDB runs on port **5433** (remapped from 5432 to avoid conflicts with local PostgreSQL). ClickHouse runs on port **8123** (HTTP) and **9000** (native).

### 2. Install Python Dependencies

```bash
pip install -e ".[dev]"
```

This installs the `neoguard` package in editable mode along with all development dependencies (pytest, ruff, mypy).

### 3. Start the API Server

```bash
NEOGUARD_DB_PORT=5433 python -m uvicorn neoguard.main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag enables auto-reload during development. Remove it in production.

Verify it's running:
```bash
curl http://localhost:8000/health
```

Expected: `{"status": "healthy", ...}`

### 4. Start the Collector Agent

In a separate terminal:
```bash
python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10
```

This starts collecting OS metrics every 10 seconds.

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and proxies API requests to the backend.

---

## Environment Variables

All settings use the `NEOGUARD_` prefix. Override any default via environment variable.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEOGUARD_DB_HOST` | `localhost` | TimescaleDB hostname |
| `NEOGUARD_DB_PORT` | `5432` | TimescaleDB port (use 5433 if local PG conflicts) |
| `NEOGUARD_DB_NAME` | `neoguard` | Database name |
| `NEOGUARD_DB_USER` | `neoguard` | Database user |
| `NEOGUARD_DB_PASSWORD` | `neoguard_dev` | Database password |
| `NEOGUARD_DB_POOL_MIN` | `5` | Minimum asyncpg pool connections |
| `NEOGUARD_DB_POOL_MAX` | `20` | Maximum asyncpg pool connections |
| `NEOGUARD_CLICKHOUSE_HOST` | `localhost` | ClickHouse hostname |
| `NEOGUARD_CLICKHOUSE_PORT` | `8123` | ClickHouse HTTP port |
| `NEOGUARD_CLICKHOUSE_DATABASE` | `neoguard` | ClickHouse database name |
| `NEOGUARD_DEFAULT_TENANT_ID` | `default` | Tenant ID for single-tenant mode |
| `NEOGUARD_METRIC_BATCH_SIZE` | `5000` | Metrics buffer flush threshold |
| `NEOGUARD_METRIC_FLUSH_INTERVAL_MS` | `200` | Metrics buffer flush interval (ms) |
| `NEOGUARD_LOG_BATCH_SIZE` | `2000` | Logs buffer flush threshold |
| `NEOGUARD_LOG_FLUSH_INTERVAL_MS` | `500` | Logs buffer flush interval (ms) |
| `NEOGUARD_ALERT_EVAL_INTERVAL_SEC` | `15` | Alert evaluation frequency (seconds) |
| `NEOGUARD_DEBUG` | `false` | Enable debug logging (console format) |

---

## Production Deployment (Linux Server)

### Option A: Docker Compose (Recommended)

The entire stack runs via Docker Compose. The `docker-compose.yml` defines three services: `timescaledb`, `clickhouse`, and `neoguard-api`.

```bash
# Clone and deploy
git clone <repo-url> /opt/neoguard
cd /opt/neoguard

# Build and start everything
docker compose up -d --build
```

The API container connects to databases using internal Docker networking (hostnames: `timescaledb`, `clickhouse`). No port mapping conflicts.

**Production environment overrides** — create a `.env` file:
```env
NEOGUARD_DB_PASSWORD=<strong-password>
NEOGUARD_DEBUG=false
```

Update `docker-compose.yml` to use the production password in the `POSTGRES_PASSWORD` environment variable.

### Option B: Systemd Services (Bare Metal)

For running directly on the host without Docker for the application:

**1. Keep databases in Docker:**
```bash
docker compose up -d timescaledb clickhouse
```

**2. Create a systemd service for the API:**

```ini
# /etc/systemd/system/neoguard-api.service
[Unit]
Description=NeoGuard API Server
After=network.target

[Service]
Type=exec
User=neoguard
WorkingDirectory=/opt/neoguard
Environment=NEOGUARD_DB_PORT=5433
Environment=NEOGUARD_DB_PASSWORD=<password>
ExecStart=/opt/neoguard/.venv/bin/uvicorn neoguard.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**3. Create a systemd service for the collector:**

```ini
# /etc/systemd/system/neoguard-collector.service
[Unit]
Description=NeoGuard Collector Agent
After=neoguard-api.service

[Service]
Type=exec
User=neoguard
WorkingDirectory=/opt/neoguard
ExecStart=/opt/neoguard/.venv/bin/python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**4. Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable neoguard-api neoguard-collector
sudo systemctl start neoguard-api neoguard-collector
```

### Frontend Deployment

Build the frontend for production:
```bash
cd frontend
npm run build
```

This creates a `dist/` directory. Serve it with Nginx:

```nginx
# /etc/nginx/sites-available/neoguard
server {
    listen 80;
    server_name neoguard.example.com;

    root /opt/neoguard/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## AWS IAM Setup

To monitor AWS resources, NeoGuard needs an IAM role in each target account.

### 1. Create the IAM Role

In each AWS account you want to monitor, create a role with this trust policy (replace `<neoguard-account-id>` with the AWS account running NeoGuard):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<neoguard-account-id>:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "neoguard-<your-external-id>"
        }
      }
    }
  ]
}
```

### 2. Attach Policies

The role needs read-only access. Attach the AWS managed policy `ReadOnlyAccess`, or a custom policy with these minimum permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "rds:DescribeDBInstances",
        "lambda:ListFunctions",
        "lambda:ListTags",
        "elasticloadbalancing:DescribeLoadBalancers",
        "dynamodb:ListTables",
        "dynamodb:DescribeTable",
        "sqs:ListQueues",
        "ecs:ListClusters",
        "ecs:ListServices",
        "ecs:DescribeServices",
        "elasticache:DescribeCacheClusters",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "cloudwatch:GetMetricData",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. Register the Account in NeoGuard

```bash
curl -X POST http://localhost:8000/api/v1/aws/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Account",
    "account_id": "123456789012",
    "role_arn": "arn:aws:iam::123456789012:role/NeoGuardRole",
    "external_id": "neoguard-<your-external-id>",
    "regions": ["us-east-1", "us-west-2"]
  }'
```

The orchestrator will automatically start discovering resources and collecting CloudWatch metrics.

---

## Database Maintenance

### TimescaleDB

Compression and retention are automated via TimescaleDB policies:
- **Compression**: Chunks older than 24h are compressed (10-20x storage savings)
- **Retention**: Raw data older than 30 days is dropped automatically
- **Continuous aggregates**: 1-minute and 1-hour rollups are maintained automatically

Monitor with:
```sql
-- Check chunk sizes
SELECT * FROM chunks_detailed_size('metrics') ORDER BY chunk_name;

-- Check compression status
SELECT * FROM timescaledb_information.compressed_chunk_stats;

-- Check continuous aggregate status
SELECT * FROM timescaledb_information.continuous_aggregates;
```

### ClickHouse

Log retention is handled by TTL (30 days). No manual maintenance needed.

Monitor with:
```sql
-- Check table size
SELECT formatReadableSize(sum(bytes_on_disk)) FROM system.parts WHERE table = 'logs';

-- Check partition info
SELECT partition, count(), sum(rows) FROM system.parts WHERE table = 'logs' GROUP BY partition;
```

---

## Lift-and-Shift: Windows to Linux

The codebase is fully cross-platform. No Windows-specific dependencies.

**What changes on Linux:**
1. `NEOGUARD_DB_PORT` — set to `5432` if no local PostgreSQL conflict (was `5433` on Windows dev machine)
2. Process management — use systemd instead of `nohup` (see Systemd section above)
3. Additional psutil metrics become available: `iowait` CPU stat and `getloadavg`

**What stays the same:** Everything else — Python packages, Docker containers, config, API, frontend.
