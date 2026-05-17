# NeoGuard Agent Dependencies

This document lists all direct Go dependencies (from `require` block in `go.mod`) and their purpose.

## Direct Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| `github.com/google/uuid` | v1.6.0 | BSD-3-Clause | UUIDv4 generation for agent_id |
| `github.com/shirou/gopsutil/v4` | v4.26.4 | BSD-3-Clause | Cross-platform system metrics (CPU, memory, disk, network, process) |
| `golang.org/x/sys` | v0.41.0 | BSD-3-Clause | Low-level OS syscalls for Linux-specific features |
| `gopkg.in/yaml.v3` | v3.0.1 | Apache-2.0 + MIT | YAML configuration parsing |
| `go.uber.org/automaxprocs` | v1.6.0 | MIT | Sets GOMAXPROCS from Linux container CPU quota (cgroup v1/v2) |

## Indirect Dependencies

See `go.mod` `require` block for full list of transitive dependencies.

## Maintenance Status

All direct dependencies are actively maintained and production-proven:
- `gopsutil`: 10K+ stars, used by Prometheus node_exporter, Datadog agent
- `automaxprocs`: 4K+ stars, maintained by Uber, used in production Go services
- `uuid`, `sys`, `yaml.v3`: standard Go ecosystem libraries

## Dependency Updates

Check for security updates monthly:
```bash
go list -u -m all | grep '\['
go get -u ./...
go mod tidy
```

Verify no breaking changes with full test suite:
```bash
go test ./...
```
