package collector

import (
	"context"
	"runtime"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/disk"
)

type DiskIOCollector struct {
	rate *RateComputer
}

func NewDiskIOCollector() *DiskIOCollector {
	return &DiskIOCollector{rate: NewRateComputer()}
}

func (c *DiskIOCollector) Name() string { return "diskio" }

func (c *DiskIOCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	counters, err := disk.IOCountersWithContext(ctx)
	if err != nil {
		return nil, err
	}

	var points []model.MetricPoint

	for device, io := range counters {
		tags := model.MergeTags(baseTags, map[string]string{"device": device})
		prefix := "diskio." + device + "."

		if rate, ok := c.rate.Compute(prefix+"read_bytes", float64(io.ReadBytes)); ok {
			points = append(points, model.NewGauge("system.disk.io.read_bytes_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"write_bytes", float64(io.WriteBytes)); ok {
			points = append(points, model.NewGauge("system.disk.io.write_bytes_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"read_count", float64(io.ReadCount)); ok {
			points = append(points, model.NewGauge("system.disk.io.read_ops_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"write_count", float64(io.WriteCount)); ok {
			points = append(points, model.NewGauge("system.disk.io.write_ops_per_sec", rate, tags))
		}

		if runtime.GOOS == "linux" {
			if rate, ok := c.rate.Compute(prefix+"merged_read", float64(io.MergedReadCount)); ok {
				points = append(points, model.NewGauge("system.disk.io.read_merged_per_sec", rate, tags))
			}
			if rate, ok := c.rate.Compute(prefix+"merged_write", float64(io.MergedWriteCount)); ok {
				points = append(points, model.NewGauge("system.disk.io.write_merged_per_sec", rate, tags))
			}
			if rate, ok := c.rate.Compute(prefix+"io_time", float64(io.IoTime)); ok {
				points = append(points, model.NewGauge("system.disk.io.io_time_ms_per_sec", rate, tags))
			}
			if rate, ok := c.rate.Compute(prefix+"weighted_io", float64(io.WeightedIO)); ok {
				points = append(points, model.NewGauge("system.disk.io.weighted_io_time_ms_per_sec", rate, tags))
			}
			points = append(points, model.NewGauge("system.disk.io.queue_depth", float64(io.IopsInProgress), tags))
		}
	}

	return points, nil
}
