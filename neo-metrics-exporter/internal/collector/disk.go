package collector

import (
	"context"
	"path/filepath"
	"runtime"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/disk"
)

type DiskCollector struct {
	excludeMounts  map[string]bool
	excludeFSTypes map[string]bool
}

func NewDiskCollector(excludeMounts, excludeFSTypes []string) *DiskCollector {
	em := make(map[string]bool)
	for _, m := range excludeMounts {
		em[m] = true
	}
	ef := make(map[string]bool)
	for _, f := range excludeFSTypes {
		ef[f] = true
	}
	return &DiskCollector{excludeMounts: em, excludeFSTypes: ef}
}

func (c *DiskCollector) Name() string { return "disk" }

func (c *DiskCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	partitions, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		return nil, err
	}

	var points []model.MetricPoint

	for _, p := range partitions {
		mount := p.Mountpoint
		if c.excludeMounts[mount] {
			continue
		}
		if c.excludeFSTypes[p.Fstype] {
			continue
		}
		if c.isExcludedPrefix(mount) {
			continue
		}

		usage, err := disk.UsageWithContext(ctx, mount)
		if err != nil {
			continue
		}

		tags := model.MergeTags(baseTags, map[string]string{
			"mount":  mount,
			"device": p.Device,
			"fstype": p.Fstype,
		})

		points = append(points,
			model.NewGauge("system.disk.total_bytes", float64(usage.Total), tags),
			model.NewGauge("system.disk.used_bytes", float64(usage.Used), tags),
			model.NewGauge("system.disk.available_bytes", float64(usage.Free), tags),
			model.NewGauge("system.disk.used_pct", usage.UsedPercent, tags),
		)

		if runtime.GOOS == "linux" {
			mountTags := model.MergeTags(baseTags, map[string]string{"mount": mount})
			points = append(points,
				model.NewGauge("system.disk.inodes_total", float64(usage.InodesTotal), mountTags),
				model.NewGauge("system.disk.inodes_used", float64(usage.InodesUsed), mountTags),
			)
			if usage.InodesTotal > 0 {
				pct := float64(usage.InodesUsed) / float64(usage.InodesTotal) * 100
				points = append(points, model.NewGauge("system.disk.inodes_used_pct", pct, mountTags))
			}
		}
	}

	return points, nil
}

func (c *DiskCollector) isExcludedPrefix(mount string) bool {
	for prefix := range c.excludeMounts {
		if matched, _ := filepath.Match(prefix, mount); matched {
			return true
		}
	}
	return false
}
