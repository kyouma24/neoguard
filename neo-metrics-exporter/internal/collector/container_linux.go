//go:build linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type ContainerCollector struct {
	rate *RateComputer
}

func NewContainerCollector() *ContainerCollector {
	return &ContainerCollector{
		rate: NewRateComputer(),
	}
}

func (c *ContainerCollector) Name() string { return "container" }

func (c *ContainerCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	info, err := procfs.ReadCgroupInfo()
	if err != nil {
		tags := model.MergeTags(baseTags, map[string]string{
			"container_runtime": "baremetal",
		})
		return []model.MetricPoint{
			model.NewGauge("system.container.detected", 0, tags),
		}, nil
	}

	tags := model.MergeTags(baseTags, map[string]string{
		"container_runtime": info.ContainerRuntime,
	})

	var points []model.MetricPoint

	if info.IsContainer {
		points = append(points, model.NewGauge("system.container.detected", 1, tags))
	} else {
		points = append(points, model.NewGauge("system.container.detected", 0, tags))
		return points, nil
	}

	if info.CPULimitCores > 0 {
		points = append(points, model.NewGauge("system.container.cpu_limit_cores", info.CPULimitCores, tags))

		if rate, ok := c.rate.Compute("cgroup_cpu_usage_us", float64(info.CPUUsageUS)); ok {
			usagePct := (rate / 1e6) / info.CPULimitCores * 100
			if usagePct < 0 {
				usagePct = 0
			}
			points = append(points, model.NewGauge("system.container.cpu_usage_pct", usagePct, tags))
		}
	}

	points = append(points, model.NewGauge("system.container.cpu_throttled_count", float64(info.NrThrottled), tags))

	if info.NrPeriods > 0 {
		throttledPct := float64(info.NrThrottled) / float64(info.NrPeriods) * 100
		points = append(points, model.NewGauge("system.container.cpu_throttled_pct", throttledPct, tags))
	}

	if info.MemoryLimitBytes > 0 {
		points = append(points,
			model.NewGauge("system.container.memory_limit_bytes", float64(info.MemoryLimitBytes), tags),
			model.NewGauge("system.container.memory_usage_bytes", float64(info.MemoryUsageBytes), tags),
		)
		if info.MemoryLimitBytes > 0 {
			usagePct := float64(info.MemoryUsageBytes) / float64(info.MemoryLimitBytes) * 100
			points = append(points, model.NewGauge("system.container.memory_usage_pct", usagePct, tags))
		}
	}

	return points, nil
}
