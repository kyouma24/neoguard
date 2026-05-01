//go:build linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type ConntrackCollector struct{}

func NewConntrackCollector() *ConntrackCollector {
	return &ConntrackCollector{}
}

func (c *ConntrackCollector) Name() string { return "conntrack" }

func (c *ConntrackCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	entries, err := procfs.ReadFileUint64("/proc/sys/net/netfilter/nf_conntrack_count")
	if err != nil {
		return points, nil
	}

	max, err := procfs.ReadFileUint64("/proc/sys/net/netfilter/nf_conntrack_max")
	if err != nil {
		return points, nil
	}

	points = append(points,
		model.NewGauge("system.conntrack.entries", float64(entries), baseTags),
		model.NewGauge("system.conntrack.max", float64(max), baseTags),
	)

	if max > 0 {
		pct := float64(entries) / float64(max) * 100
		points = append(points, model.NewGauge("system.conntrack.used_pct", pct, baseTags))
	}

	return points, nil
}
