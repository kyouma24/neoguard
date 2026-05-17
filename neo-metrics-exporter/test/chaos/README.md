# Chaos Tests

Failure-mode tests for the NeoGuard agent. These are destructive, require root, and must run on a dedicated Linux host (not in CI containers).

## Prerequisites

- Linux (kernel 5.x+)
- Root access
- cgroup v2 enabled (for `oom_test.sh`)
- iptables (for `network_partition_test.sh`)
- Python 3.8+ (mock HTTP servers)
- Go toolchain (binary auto-builds if missing)

## Running

All scripts are gated by an environment variable:

```bash
sudo NEOGUARD_CHAOS_ENABLED=1 bash test/chaos/network_partition_test.sh
```

Run all:

```bash
sudo NEOGUARD_CHAOS_ENABLED=1 bash -c 'for t in test/chaos/*_test.sh; do echo "=== $t ==="; bash "$t"; echo; done'
```

## Tests

| Script | Failure mode | Duration | Validates |
|--------|-------------|----------|-----------|
| `network_partition_test.sh` | Egress blocked via iptables | ~7 min | WAL buffering, post-restore delivery |
| `disk_full_test.sh` | WAL filesystem full (1 MB tmpfs) | ~75s | Graceful degradation, no crash |
| `oom_test.sh` | 80 MB cgroup memory limit | ~60s | Agent stays under limit, no OOM kill |
| `crash_recovery_test.sh` | SIGKILL during operation | ~90s | WAL survives crash, replays on restart |
| `log_burst_test.sh` | 100k lines/sec log write | ~65s | RSS < 250 MB, backpressure works |

## Configuration

Some tests accept environment variables for tuning:

- `NEOGUARD_CHAOS_PARTITION_SECS` — network partition duration (default: 300)

## Safety

- All scripts have cleanup traps (iptables rules, cgroups, mounts, temp dirs)
- Each uses a unique mock server port (19876-19880) to avoid collisions
- Scripts exit immediately without `NEOGUARD_CHAOS_ENABLED=1`
- No test modifies the source tree or repository state
