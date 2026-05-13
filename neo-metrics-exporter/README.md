# NeoGuard Agent

Production-grade host metrics agent for NeoGuard. Collects 200+ system metrics and ships them to the NeoGuard ingest API via compressed JSON batches.

**7.4 MB static binary. Zero runtime dependencies. Single config file.**

## Features

- **23 collectors** covering CPU, memory, disk, network, processes, TCP/UDP state, container awareness, file monitoring, and 7 Linux-specific subsystems
- **6 unique differentiators**: host health score, resource saturation projection (linear regression), process-system correlation, network socket mapping, container cgroup awareness, config-driven file watches
- **Crash-resilient**: disk-backed write-ahead log (WAL) survives agent restarts
- **Prometheus-compatible**: dual push (NeoGuard ingest) + pull (`/metrics` endpoint)
- **K8s-native**: health/readiness probes, env var expansion in config
- **Cloud-aware**: auto-detects AWS EC2 and Azure VM identity via IMDS
- **Cross-platform**: Linux (primary), Windows (SCM service), static binary for both
- **Secure**: TLS 1.2+, config file permission enforcement, API key redaction in logs
- **Operationally sound**: SIGHUP config reload, per-collector timeouts, collection jitter, graceful shutdown with retry flush

## Quickstart

### Linux

```bash
# Download
curl -Lo /usr/bin/neoguard-agent https://your-s3-bucket.s3.amazonaws.com/neoguard-agent-linux-amd64
chmod +x /usr/bin/neoguard-agent

# Configure
cp agent.yaml /etc/neoguard/agent.yaml
# Edit api_key and endpoint

# Run
neoguard-agent run --config /etc/neoguard/agent.yaml

# Or install as systemd service
sudo deploy/install.sh
```

### Windows

```powershell
# Copy binary + config
copy neoguard-agent.exe C:\neoguard\
copy agent.yaml C:\neoguard\agent.yaml
# Edit api_key and endpoint

# Run interactively
neoguard-agent.exe run --config C:\neoguard\agent.yaml

# Install as Windows service
neoguard-agent.exe service install --config C:\neoguard\agent.yaml
```

### Docker (testing)

```bash
make build-linux
docker build -f Dockerfile.test -t neoguard-test .
docker run --rm -it neoguard-test
```

## Commands

```
neoguard-agent run --config <path>         # Run the agent
neoguard-agent diagnose --config <path>    # Print diagnostic info
neoguard-agent test-connection --config <path>  # Test endpoint connectivity
neoguard-agent version                     # Print version info
neoguard-agent service install --config <path>  # Install Windows service
neoguard-agent service uninstall           # Remove Windows service
```

## Build

Requires Go 1.24+.

```bash
make build              # Native binary
make build-linux        # Linux amd64
make build-linux-arm64  # Linux arm64
make build-windows      # Windows amd64
make build-all          # All targets
make test               # Run tests
make test-race          # Run tests with race detector
make lint               # go vet
make package-deb        # Build .deb package (requires nfpm)
make package-rpm        # Build .rpm package (requires nfpm)
```

## Configuration

Config file supports `${ENV_VAR}` and `${ENV_VAR:-default}` syntax for environment variable expansion. See [docs/configuration.md](docs/configuration.md) for the full reference.

Minimal config:

```yaml
api_key: ${NEOGUARD_API_KEY}
endpoint: https://ingest.yourdomain.com
```

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System design, data flow, package structure |
| [Configuration Reference](docs/configuration.md) | Every config option documented |
| [Deployment Guide](docs/deployment.md) | Linux, Windows, Docker, K8s installation |
| [SOP (Standard Operating Procedures)](docs/sop.md) | Day-to-day operations, troubleshooting |
| [Metrics Catalog](docs/metrics.md) | Complete list of all 200+ metrics |

## Stats

- **99 Go files**, 10,006 lines of code
- **186 tests** (unit + integration), all passing
- **2 direct dependencies** (gopsutil, yaml.v3)
- **7.4 MB** static binary (CGO_ENABLED=0)
- Cross-compiles to Linux amd64/arm64, Windows amd64
