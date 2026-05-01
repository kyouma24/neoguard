"""NeoGuard Collector Agent

Standalone process that gathers system metrics and ships them
to the NeoGuard API. Run with: python -m neoguard.collector.agent
"""

import asyncio
import platform
import time

import httpx
import psutil


def _m(name: str, value: float, tags: dict, mtype: str = "gauge") -> dict:
    return {"name": name, "value": value, "tags": tags, "metric_type": mtype, "timestamp": None}


class CollectorAgent:
    def __init__(
        self,
        api_url: str = "http://localhost:8000",
        interval_sec: float = 10.0,
        tenant_id: str = "default",
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.interval_sec = interval_sec
        self.tenant_id = tenant_id
        self.hostname = platform.node()
        self._running = False

    async def run(self) -> None:
        self._running = True

        async with httpx.AsyncClient(timeout=10.0) as client:
            while self._running:
                start = time.monotonic()
                try:
                    metrics = self._collect()
                    await self._ship(client, metrics)
                except Exception:
                    pass

                elapsed = time.monotonic() - start
                sleep_time = max(0, self.interval_sec - elapsed)
                await asyncio.sleep(sleep_time)

    def stop(self) -> None:
        self._running = False

    def _collect(self) -> list[dict]:
        tags = {"host": self.hostname}
        metrics: list[dict] = []

        metrics.append(_m("system.cpu.percent", psutil.cpu_percent(interval=None), tags))

        cpu_times = psutil.cpu_times_percent(interval=None)
        for field in ("user", "system", "idle", "iowait"):
            val = getattr(cpu_times, field, None)
            if val is not None:
                metrics.append(_m(f"system.cpu.{field}", val, tags))

        mem = psutil.virtual_memory()
        metrics.append(_m("system.memory.percent", mem.percent, tags))
        metrics.append(_m("system.memory.used_bytes", float(mem.used), tags))
        metrics.append(_m("system.memory.available_bytes", float(mem.available), tags))

        swap = psutil.swap_memory()
        metrics.append(_m("system.swap.percent", swap.percent, tags))

        for part in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disk_tags = {**tags, "mountpoint": part.mountpoint, "device": part.device}
                metrics.append(_m("system.disk.percent", usage.percent, disk_tags))
                metrics.append(_m("system.disk.used_bytes", float(usage.used), disk_tags))
            except PermissionError:
                continue

        net = psutil.net_io_counters()
        metrics.append(_m("system.network.bytes_sent", float(net.bytes_sent), tags, "counter"))
        metrics.append(_m("system.network.bytes_recv", float(net.bytes_recv), tags, "counter"))
        metrics.append(
            _m("system.network.packets_sent", float(net.packets_sent), tags, "counter")
        )
        metrics.append(
            _m("system.network.packets_recv", float(net.packets_recv), tags, "counter")
        )

        load = getattr(psutil, "getloadavg", None)
        if load:
            avg1, avg5, avg15 = load()
            metrics.append(_m("system.load.1", avg1, tags))
            metrics.append(_m("system.load.5", avg5, tags))
            metrics.append(_m("system.load.15", avg15, tags))

        metrics.extend(self._collect_disk_io(tags))
        metrics.extend(self._collect_processes(tags))
        metrics.extend(self._collect_tcp(tags))

        return metrics

    def _collect_disk_io(self, tags: dict) -> list[dict]:
        metrics: list[dict] = []
        try:
            counters = psutil.disk_io_counters(perdisk=True)
            if not counters:
                return metrics
            for disk, io in counters.items():
                dtags = {**tags, "device": disk}
                metrics.append(_m("system.disk.read_bytes", float(io.read_bytes), dtags, "counter"))
                metrics.append(
                    _m("system.disk.write_bytes", float(io.write_bytes), dtags, "counter")
                )
                metrics.append(_m("system.disk.read_count", float(io.read_count), dtags, "counter"))
                metrics.append(
                    _m("system.disk.write_count", float(io.write_count), dtags, "counter")
                )
                if hasattr(io, "read_time"):
                    metrics.append(
                        _m("system.disk.read_time_ms", float(io.read_time), dtags, "counter")
                    )
                    metrics.append(
                        _m("system.disk.write_time_ms", float(io.write_time), dtags, "counter")
                    )
        except Exception:
            pass
        return metrics

    def _collect_processes(self, tags: dict) -> list[dict]:
        metrics: list[dict] = []
        try:
            pids = psutil.pids()
            metrics.append(_m("system.process.count", float(len(pids)), tags))

            top_cpu: list[tuple[str, float, float]] = []
            for proc in psutil.process_iter(["name", "cpu_percent", "memory_percent"]):
                try:
                    info = proc.info
                    cpu = info.get("cpu_percent") or 0.0
                    mem = info.get("memory_percent") or 0.0
                    name = info.get("name") or "unknown"
                    top_cpu.append((name, cpu, mem))
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            top_cpu.sort(key=lambda x: x[1], reverse=True)
            for name, cpu, mem in top_cpu[:10]:
                ptags = {**tags, "process": name}
                metrics.append(_m("system.process.cpu_percent", cpu, ptags))
                metrics.append(_m("system.process.memory_percent", mem, ptags))
        except Exception:
            pass
        return metrics

    def _collect_tcp(self, tags: dict) -> list[dict]:
        metrics: list[dict] = []
        try:
            conns = psutil.net_connections(kind="tcp")
            states: dict[str, int] = {}
            for c in conns:
                st = c.status if c.status else "NONE"
                states[st] = states.get(st, 0) + 1
            for state, count in states.items():
                stags = {**tags, "state": state}
                metrics.append(_m("system.tcp.connections", float(count), stags))
        except (psutil.AccessDenied, OSError):
            pass
        return metrics

    async def _ship(self, client: httpx.AsyncClient, metrics: list[dict]) -> None:
        resp = await client.post(
            f"{self.api_url}/api/v1/metrics/ingest",
            json={"metrics": metrics, "tenant_id": self.tenant_id},
        )
        resp.raise_for_status()


async def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="NeoGuard Collector Agent")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--interval", type=float, default=10.0)
    parser.add_argument("--tenant-id", default="default")
    args = parser.parse_args()

    agent = CollectorAgent(
        api_url=args.api_url,
        interval_sec=args.interval,
        tenant_id=args.tenant_id,
    )
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
