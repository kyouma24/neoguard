---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# NeoGuard Agent - Sales Enablement Sheet

## What It Does

NeoGuard installs a lightweight agent on Linux and Windows hosts to collect infrastructure health, process activity, network behavior, container signals, and optional log data. It gives operations teams a single view of machine health, workload pressure, and agent reliability without requiring customers to assemble separate collectors for metrics and logs.

## What Customers Get by Default

| Capability | Linux | Windows | Business Purpose |
|---|---:|---:|---|
| CPU, memory, disk, disk I/O, network throughput | Yes | Yes | Detect saturation, noisy hosts, and infrastructure bottlenecks |
| Host identity and uptime | Yes | Yes | Track machine inventory and availability |
| Process inventory and resource usage | Yes | Yes | Identify expensive or unstable workloads |
| Listening ports and network socket summary | Yes | Yes | See exposed services and connection pressure |
| Agent self-monitoring | Yes | Yes | Prove the collector is healthy and transmitting |
| Health, saturation, and correlation signals | Yes | Yes | Surface actionable risk instead of raw telemetry only |
| Container detection | Yes | Limited | Distinguish containerized from bare-metal workloads |

## Linux-Only Depth

Linux hosts also get:

- VM and kernel memory pressure indicators
- Socket and file-descriptor pressure
- CPU scheduler details
- Entropy, PSI pressure, and conntrack metrics
- Container CPU/memory limit visibility

These signals are especially useful for Kubernetes nodes, dense VMs, and production servers where failure often starts below the application layer.

## Optional Capabilities

| Optional Feature | Enablement Needed | Customer Value |
|---|---:|---|
| Per-core CPU metrics | Yes | Diagnose core imbalance and affinity issues |
| Per-core CPU frequency | Yes | Detect throttling and power-state behavior |
| Process command-line capture | Yes | Improve process attribution and troubleshooting |
| Process aggregation | Yes | Reduce cardinality while preserving workload insight |
| File watch metrics | Yes | Monitor selected files and directories |
| Log collection pipeline | Yes | Correlate logs with host metrics in one agent |
| Health HTTP endpoint | Yes | Integrate with load balancers and orchestrators |

## Log Collection Capabilities

When enabled, the same agent can also:

- Tail files with cursor persistence and rotation handling
- Parse raw, JSON, and regex log formats
- Support multiline events such as stack traces
- Redact common credentials before transmission
- Buffer and retry logs during outages
- Correlate logs with the same host identity used for metrics

## Why It Is Easier to Sell

- One agent covers both metrics and logs.
- Linux and Windows are both supported from the same product line.
- Default telemetry is broad enough for first-value deployment without heavy tuning.
- Advanced features are opt-in, so customers can control cardinality and privacy.
- The agent monitors itself, which helps prove data quality during pilots and production rollout.

## Best-Fit Use Cases

- Infrastructure monitoring for mixed Linux and Windows fleets
- Kubernetes worker-node visibility
- Enterprise hosts behind internal PKI or TLS inspection
- Teams that want log and metric correlation without running separate agents
- Customers that need gradual rollout: useful defaults first, deeper visibility later

## Positioning Line

NeoGuard gives teams production-grade host visibility from one lightweight agent: useful defaults on day one, deeper diagnostics when needed, and unified metrics-plus-logs correlation across Linux and Windows.
