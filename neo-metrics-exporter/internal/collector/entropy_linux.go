//go:build linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type EntropyCollector struct{}

func NewEntropyCollector() *EntropyCollector {
	return &EntropyCollector{}
}

func (c *EntropyCollector) Name() string { return "entropy" }

func (c *EntropyCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	avail, err := procfs.ReadFileUint64("/proc/sys/kernel/random/entropy_avail")
	if err == nil {
		points = append(points, model.NewGauge("system.entropy.available_bits", float64(avail), baseTags))
	}

	poolSize, err := procfs.ReadFileUint64("/proc/sys/kernel/random/poolsize")
	if err == nil {
		points = append(points, model.NewGauge("system.entropy.pool_size_bits", float64(poolSize), baseTags))
	}

	return points, nil
}
