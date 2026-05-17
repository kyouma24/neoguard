# Soak Tests — v1 Release Gate

Sustained validation of the NeoGuard agent under real-world conditions. These tests run on a dedicated Linux host (EC2 t3.medium recommended) and produce evidence artifacts for each scenario.

## Target Host Requirements

| Field | Minimum |
|-------|---------|
| Instance | 2 vCPU, 4 GB RAM (e.g., EC2 t3.medium) |
| OS | Ubuntu 24.04 LTS or Amazon Linux 2023 |
| Kernel | 6.x with cgroup v2 |
| Disk | 30 GB |
| Docker | Docker CE 26.x |
| Python | 3.12+ |
| Network | Outbound access (package downloads), iptables available |
| Root | Required for iptables and cgroup tests |

## Quick Start

```bash
# Deploy the agent binary to /usr/bin/neoguard-agent first
# Then run all scenarios:
sudo NEOGUARD_SOAK_ENDPOINT=http://127.0.0.1:19900 bash test/soak/run_all.sh
```

## Scenarios

| # | Script | Duration | What it proves |
|---|--------|----------|----------------|
| S1 | `scenario_idle.sh` | 24h | No memory leak on idle host |
| S2 | `scenario_metrics.sh` | 24h | Stable metrics collection under load |
| S3 | `scenario_logs.sh` | 24h | Log pipeline steady state |
| S4 | `scenario_log_load.sh` | 1h | Backpressure under 100k lines/sec |
| S5 | `scenario_outage.sh` | ~2h | WAL buffering and post-outage delivery |
| S6 | `scenario_restart.sh` | ~30min | WAL integrity across 50 crash cycles |
| S7 | `scenario_install.sh` | ~30min | Package/image/install smoke |
| S8 | `scenario_container.sh` | ~5min | Non-container host detection (AGENT-007) |

## Execution Order

Run in order: S1, S2, S3, S4, S5, S6, S7, S8. Long-running scenarios first so memory leaks are detected before stress tests mask them.

## Evidence

Each scenario writes artifacts to `evidence/<scenario_name>/`. After all scenarios complete, `collect_evidence.sh` bundles everything into a timestamped tar.gz.

## Threshold Tiers

- **Expected**: Normal operating range
- **Warning**: Above expected but not release-blocking
- **Release-blocking**: Hard failure, blocks v1 ship

## Independence

Each scenario:
- Creates a fresh state directory (WAL, spool, checkpoints)
- Starts its own agent process
- Kills the process at the end
- Cleans up iptables/cgroups via trap

No daemon persists between scenarios. No host reboot required.
