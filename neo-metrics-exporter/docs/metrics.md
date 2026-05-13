# Metrics Catalog

Complete reference of every metric emitted by the NeoGuard agent.

**Legend**:
- **Platform**: `all` = Linux + Windows, `linux` = Linux only
- **Tier**: `normal` = standard interval, `slow` = slow interval, `composite` = derived from other collectors
- **Rate**: metrics marked with (rate) are computed as delta/second from cumulative counters

---

## Agent Self-Monitoring

**Collector**: `agentself` | **Platform**: all | **Tier**: normal

| Metric | Type | Description |
|---|---|---|
| `agent.uptime_seconds` | gauge | Agent process uptime |
| `agent.collection_duration_ms` | gauge | Last collection cycle duration |
| `agent.points_collected` | gauge | Points from last collection |
| `agent.buffer_size` | gauge | Current buffer occupancy |
| `agent.buffer_dropped` | gauge | Total points dropped (buffer overflow) |
| `agent.send_duration_ms` | gauge | Last transmission duration |
| `agent.points_sent` | gauge | Total points transmitted |
| `agent.send_errors` | gauge | Total send failures |
| `agent.go.goroutines` | gauge | Active goroutines |
| `agent.go.heap_alloc_bytes` | gauge | Go heap allocation |
| `agent.go.heap_sys_bytes` | gauge | Go heap reserved from OS |
| `agent.go.gc_pause_ns` | gauge | Last GC pause duration |
| `agent.go.num_gc` | gauge | Total GC cycles |

---

## CPU

**Collector**: `cpu` | **Platform**: all | **Tier**: normal

| Metric | Type | Tags | Description |
|---|---|---|---|
| `system.cpu.usage_total_pct` | gauge | — | Total CPU utilization % |
| `system.cpu.core_count` | gauge | — | Number of logical cores |
| `system.cpu.user_pct` | gauge | — | User mode % |
| `system.cpu.system_pct` | gauge | — | Kernel mode % |
| `system.cpu.idle_pct` | gauge | — | Idle % |
| `system.cpu.nice_pct` | gauge | — | Nice % (linux) |
| `system.cpu.iowait_pct` | gauge | — | I/O wait % (linux) |
| `system.cpu.irq_pct` | gauge | — | Hardware IRQ % (linux) |
| `system.cpu.softirq_pct` | gauge | — | Software IRQ % (linux) |
| `system.cpu.steal_pct` | gauge | — | Steal % (linux, VMs) |
| `system.cpu.guest_pct` | gauge | — | Guest % (linux) |
| `system.cpu.interrupt_pct` | gauge | — | Interrupt % (windows) |
| `system.cpu.dpc_pct` | gauge | — | DPC % (windows) |
| `system.cpu.load.1m` | gauge | — | Load avg 1 min (linux) |
| `system.cpu.load.5m` | gauge | — | Load avg 5 min (linux) |
| `system.cpu.load.15m` | gauge | — | Load avg 15 min (linux) |
| `system.cpu.frequency_mhz.avg` | gauge | — | Average frequency |
| `system.cpu.frequency_mhz.min` | gauge | — | Minimum frequency |
| `system.cpu.frequency_mhz.max` | gauge | — | Maximum frequency |
| `system.cpu.usage_pct` | gauge | core, mode | Per-core breakdown (opt-in: `cpu.per_core: true`) |
| `system.cpu.frequency_mhz` | gauge | core | Per-core frequency (opt-in: `cpu.per_core_frequency: true`) |

---

## Memory

**Collector**: `memory` | **Platform**: all | **Tier**: normal

| Metric | Type | Description |
|---|---|---|
| `system.memory.total_bytes` | gauge | Total physical RAM |
| `system.memory.used_bytes` | gauge | Used RAM |
| `system.memory.available_bytes` | gauge | Available RAM (includes cache) |
| `system.memory.free_bytes` | gauge | Free RAM (not including cache) |
| `system.memory.used_pct` | gauge | RAM utilization % |
| `system.memory.buffers_bytes` | gauge | Buffer cache (linux) |
| `system.memory.cached_bytes` | gauge | Page cache (linux) |
| `system.memory.slab_bytes` | gauge | Slab allocator (linux) |
| `system.memory.dirty_bytes` | gauge | Dirty pages (linux) |
| `system.memory.writeback_bytes` | gauge | Pages being written back (linux) |
| `system.memory.mapped_bytes` | gauge | Memory-mapped files (linux) |
| `system.memory.page_tables_bytes` | gauge | Page table memory (linux) |
| `system.memory.hugepages.total` | gauge | Total hugepages (linux) |
| `system.memory.hugepages.free` | gauge | Free hugepages (linux) |
| `system.memory.hugepages.size_bytes` | gauge | Hugepage size (linux) |
| `system.memory.committed_bytes` | gauge | Committed memory (windows) |
| `system.memory.swap.total_bytes` | gauge | Total swap |
| `system.memory.swap.used_bytes` | gauge | Used swap |
| `system.memory.swap.used_pct` | gauge | Swap utilization % |

---

## Disk

**Collector**: `disk` | **Platform**: all | **Tier**: normal | **Tags**: `mount`, `device`, `fstype`

| Metric | Type | Description |
|---|---|---|
| `system.disk.total_bytes` | gauge | Total disk space |
| `system.disk.used_bytes` | gauge | Used disk space |
| `system.disk.available_bytes` | gauge | Available disk space |
| `system.disk.used_pct` | gauge | Disk utilization % |
| `system.disk.inodes_total` | gauge | Total inodes (linux) |
| `system.disk.inodes_used` | gauge | Used inodes (linux) |
| `system.disk.inodes_used_pct` | gauge | Inode utilization % (linux) |

---

## Disk I/O

**Collector**: `diskio` | **Platform**: all | **Tier**: normal | **Tags**: `device`

All metrics are rate-based (delta per second).

| Metric | Type | Description |
|---|---|---|
| `system.disk.io.read_bytes_per_sec` | gauge | Read throughput |
| `system.disk.io.write_bytes_per_sec` | gauge | Write throughput |
| `system.disk.io.read_ops_per_sec` | gauge | Read IOPS |
| `system.disk.io.write_ops_per_sec` | gauge | Write IOPS |
| `system.disk.io.read_merged_per_sec` | gauge | Merged reads (linux) |
| `system.disk.io.write_merged_per_sec` | gauge | Merged writes (linux) |
| `system.disk.io.io_time_ms_per_sec` | gauge | Active I/O time (linux) |
| `system.disk.io.weighted_io_time_ms_per_sec` | gauge | Weighted I/O time (linux) |
| `system.disk.io.queue_depth` | gauge | Outstanding I/O requests (linux) |

---

## Network

**Collector**: `network` | **Platform**: all | **Tier**: normal | **Tags**: `interface`

All metrics are rate-based.

| Metric | Type | Description |
|---|---|---|
| `system.network.rx_bytes_per_sec` | gauge | Receive throughput |
| `system.network.tx_bytes_per_sec` | gauge | Transmit throughput |
| `system.network.rx_packets_per_sec` | gauge | Receive packet rate |
| `system.network.tx_packets_per_sec` | gauge | Transmit packet rate |
| `system.network.rx_errors_per_sec` | gauge | Receive error rate |
| `system.network.tx_errors_per_sec` | gauge | Transmit error rate |
| `system.network.rx_dropped_per_sec` | gauge | Receive drop rate |
| `system.network.tx_dropped_per_sec` | gauge | Transmit drop rate |

---

## System

**Collector**: `system` | **Platform**: all | **Tier**: normal

| Metric | Type | Tags | Description |
|---|---|---|---|
| `system.uptime_seconds` | gauge | — | System uptime |
| `system.boot_time` | gauge | — | Boot time (Unix timestamp) |
| `system.os.info` | gauge | os_name, os_version, kernel_version, arch | Always 1, info in tags |
| `system.users.logged_in` | gauge | — | Logged-in user count |

---

## TCP/UDP (Netstat)

**Collector**: `netstat` | **Platform**: all | **Tier**: normal

| Metric | Type | Description |
|---|---|---|
| `system.tcp.established` | gauge | ESTABLISHED connections |
| `system.tcp.time_wait` | gauge | TIME_WAIT connections |
| `system.tcp.close_wait` | gauge | CLOSE_WAIT connections |
| `system.tcp.listen` | gauge | LISTEN sockets |
| `system.tcp.syn_sent` | gauge | SYN_SENT connections |
| `system.tcp.syn_recv` | gauge | SYN_RECV connections |
| `system.tcp.fin_wait1` | gauge | FIN_WAIT1 connections |
| `system.tcp.fin_wait2` | gauge | FIN_WAIT2 connections |
| `system.tcp.last_ack` | gauge | LAST_ACK connections |
| `system.tcp.closing` | gauge | CLOSING connections |
| `system.tcp.active_opens_per_sec` | gauge | Active open rate |
| `system.tcp.passive_opens_per_sec` | gauge | Passive open rate |
| `system.tcp.retransmits_per_sec` | gauge | Retransmit rate |
| `system.tcp.in_segs_per_sec` | gauge | Inbound segment rate |
| `system.tcp.out_segs_per_sec` | gauge | Outbound segment rate |
| `system.tcp.in_errors_per_sec` | gauge | Inbound error rate |
| `system.tcp.reset_per_sec` | gauge | Reset rate |
| `system.udp.in_datagrams_per_sec` | gauge | UDP inbound datagram rate |
| `system.udp.out_datagrams_per_sec` | gauge | UDP outbound datagram rate |
| `system.udp.in_errors_per_sec` | gauge | UDP inbound error rate |
| `system.udp.no_port_per_sec` | gauge | UDP no-port error rate |

---

## Processes

**Collector**: `process` | **Platform**: all | **Tier**: normal
**Tags**: `process_name`, `process_pid`, `process_user`, `process_cmdline`

Reports top N processes (default 20) sorted by CPU usage, then memory.

| Metric | Type | Description |
|---|---|---|
| `process.cpu_pct` | gauge | Process CPU % |
| `process.memory_bytes` | gauge | Process RSS bytes |
| `process.memory_pct` | gauge | Process memory % of system |
| `process.threads` | gauge | Thread count |
| `process.open_fds` | gauge | Open file descriptors |
| `process.io_read_bytes` | gauge | Cumulative read bytes |
| `process.io_write_bytes` | gauge | Cumulative write bytes |
| `system.processes.total` | gauge | Total process count (no per-process tags) |

---

## Port Map

**Collector**: `portmap` | **Platform**: all | **Tier**: normal
**Tags**: `process_name`, `process_pid`, `port`, `protocol`, `bind_address`

| Metric | Type | Description |
|---|---|---|
| `system.service.port` | gauge | Always 1 per listening socket |

---

## File Watch

**Collector**: `filewatch` | **Platform**: all | **Tier**: normal | **Tags**: `path`, `filename`

Requires `file_watch.paths` in config.

| Metric | Type | Description |
|---|---|---|
| `system.file.exists` | gauge | 1 if file exists, 0 if not |
| `system.file.size_bytes` | gauge | File size |
| `system.file.age_seconds` | gauge | Seconds since last modification |
| `system.file.growth_bytes_per_sec` | gauge | File growth rate |

---

## Container

**Collector**: `container` | **Platform**: linux (stub on other) | **Tier**: normal | **Tags**: `container_runtime`

| Metric | Type | Description |
|---|---|---|
| `system.container.detected` | gauge | 1 if inside container, 0 if bare metal |
| `system.container.cpu_limit_cores` | gauge | CPU quota in cores |
| `system.container.cpu_usage_pct` | gauge | CPU usage relative to limit |
| `system.container.cpu_throttled_count` | gauge | Throttle events |
| `system.container.cpu_throttled_pct` | gauge | Throttle percentage |
| `system.container.memory_limit_bytes` | gauge | Memory limit |
| `system.container.memory_usage_bytes` | gauge | Memory usage |
| `system.container.memory_usage_pct` | gauge | Memory % of limit |

---

## Sensors

**Collector**: `sensors` | **Platform**: all | **Tier**: slow | **Tags**: `sensor`

| Metric | Type | Description |
|---|---|---|
| `system.sensors.temperature_celsius` | gauge | Hardware temperature |

---

## Health Score (Composite)

**Collector**: `healthscore` | **Platform**: all | **Tier**: composite | **Tags**: `health_status`

`health_status` tag: `healthy` (>=80), `degraded` (50-79), `critical` (<50).
Weights: CPU 30%, Memory 30%, Disk 25%, Network 15%.

| Metric | Type | Description |
|---|---|---|
| `system.health.score` | gauge | Weighted composite score (0-100) |
| `system.health.cpu_score` | gauge | CPU component |
| `system.health.memory_score` | gauge | Memory component |
| `system.health.disk_score` | gauge | Disk component (worst mount) |
| `system.health.network_score` | gauge | Network component |

---

## Saturation Projection (Composite)

**Collector**: `saturation` | **Platform**: all | **Tier**: composite

Uses linear regression over a sliding window to project time-to-full. `-1` means stable or improving.

| Metric | Type | Tags | Description |
|---|---|---|---|
| `system.memory.full_in_hours` | gauge | — | Hours until memory exhaustion |
| `system.cpu.saturated_in_hours` | gauge | — | Hours until CPU >95% sustained |
| `system.disk.full_in_hours` | gauge | mount, device | Hours until filesystem full |

---

## Process Correlation (Composite)

**Collector**: `correlation` | **Platform**: all | **Tier**: composite

| Metric | Type | Tags | Description |
|---|---|---|---|
| `system.cpu.top_process` | gauge | process_name, process_pid | CPU % of top consumer |
| `system.cpu.top3_pct` | gauge | — | Sum of top 3 CPU % |
| `system.memory.top_process` | gauge | process_name, process_pid | Memory bytes of top consumer |
| `system.memory.top3_pct` | gauge | — | Sum of top 3 memory % |
| `system.io.top_process` | gauge | process_name, process_pid | I/O bytes of top consumer |

---

## Linux-Only Collectors

### VMstat

**Collector**: `vmstat` | **Platform**: linux | **Tier**: normal

| Metric | Type | Description |
|---|---|---|
| `system.vmstat.pgfault_per_sec` | gauge | Page faults/sec |
| `system.vmstat.pgmajfault_per_sec` | gauge | Major page faults/sec |
| `system.vmstat.pswpin_per_sec` | gauge | Pages swapped in/sec |
| `system.vmstat.pswpout_per_sec` | gauge | Pages swapped out/sec |
| `system.vmstat.oom_kill_total` | gauge | Total OOM kills |

### Socket Stats

**Collector**: `sockstat` | **Platform**: linux | **Tier**: normal

| Metric | Type | Description |
|---|---|---|
| `system.sockstat.sockets_used` | gauge | Total sockets in use |
| `system.sockstat.tcp_inuse` | gauge | TCP sockets in use |
| `system.sockstat.tcp_orphan` | gauge | Orphaned TCP sockets |
| `system.sockstat.tcp_time_wait` | gauge | TIME_WAIT sockets |
| `system.sockstat.tcp_alloc` | gauge | Allocated TCP sockets |
| `system.sockstat.tcp_mem_pages` | gauge | TCP memory pages |
| `system.sockstat.udp_inuse` | gauge | UDP sockets in use |
| `system.sockstat.udp_mem_pages` | gauge | UDP memory pages |

### File Descriptors

**Collector**: `filefd` | **Platform**: linux | **Tier**: normal

| Metric | Type | Description |
|---|---|---|
| `system.filefd.allocated` | gauge | Allocated FDs |
| `system.filefd.maximum` | gauge | Max FDs |
| `system.filefd.used_pct` | gauge | FD utilization % |

### CPU Scheduler

**Collector**: `cpustat` | **Platform**: linux | **Tier**: normal

| Metric | Type | Description |
|---|---|---|
| `system.cpu.context_switches_total` | gauge | Context switches/sec |
| `system.cpu.interrupts_total` | gauge | Interrupts/sec |
| `system.cpu.forks_total` | gauge | Forks/sec |
| `system.cpu.procs_running` | gauge | Runnable processes |
| `system.cpu.procs_blocked` | gauge | I/O-blocked processes |

### Entropy

**Collector**: `entropy` | **Platform**: linux | **Tier**: slow

| Metric | Type | Description |
|---|---|---|
| `system.entropy.available_bits` | gauge | Available entropy |
| `system.entropy.pool_size_bits` | gauge | Entropy pool size |

### Pressure Stall Info (PSI)

**Collector**: `pressure` | **Platform**: linux | **Tier**: slow

| Metric | Type | Description |
|---|---|---|
| `system.pressure.cpu.some.avg10` | gauge | CPU pressure avg 10s |
| `system.pressure.cpu.some.avg60` | gauge | CPU pressure avg 60s |
| `system.pressure.cpu.some.avg300` | gauge | CPU pressure avg 300s |
| `system.pressure.cpu.some.total_us` | gauge | CPU pressure total us |
| `system.pressure.memory.some.avg10` | gauge | Memory pressure (some) avg 10s |
| `system.pressure.memory.some.avg60` | gauge | Memory pressure (some) avg 60s |
| `system.pressure.memory.some.avg300` | gauge | Memory pressure (some) avg 300s |
| `system.pressure.memory.full.avg10` | gauge | Memory pressure (full) avg 10s |
| `system.pressure.memory.full.avg60` | gauge | Memory pressure (full) avg 60s |
| `system.pressure.memory.full.avg300` | gauge | Memory pressure (full) avg 300s |
| `system.pressure.io.some.avg10` | gauge | I/O pressure (some) avg 10s |
| `system.pressure.io.some.avg60` | gauge | I/O pressure (some) avg 60s |
| `system.pressure.io.some.avg300` | gauge | I/O pressure (some) avg 300s |
| `system.pressure.io.full.avg10` | gauge | I/O pressure (full) avg 10s |
| `system.pressure.io.full.avg60` | gauge | I/O pressure (full) avg 60s |
| `system.pressure.io.full.avg300` | gauge | I/O pressure (full) avg 300s |

### Connection Tracking

**Collector**: `conntrack` | **Platform**: linux | **Tier**: slow

| Metric | Type | Description |
|---|---|---|
| `system.conntrack.entries` | gauge | Current tracked connections |
| `system.conntrack.max` | gauge | Max tracked connections |
| `system.conntrack.used_pct` | gauge | Conntrack table utilization % |

---

## Base Tags

Every metric includes these tags (set during identity resolution):

| Tag | Source | Example |
|---|---|---|
| `hostname` | OS hostname or cloud IMDS | `ip-10-0-1-42` |
| `agent_version` | Compiled into binary | `0.2.0` |
| `os` | `runtime.GOOS` | `linux` |
| `cloud_provider` | IMDS detection | `aws`, `azure`, `unknown` |
| `instance_id` | IMDS | `i-0abc123def456` |
| `region` | IMDS | `us-east-1` |

Plus any keys from `extra_tags` in config.
