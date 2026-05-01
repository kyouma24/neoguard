//go:build linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type VMStatCollector struct {
	rate *RateComputer
}

func NewVMStatCollector() *VMStatCollector {
	return &VMStatCollector{rate: NewRateComputer()}
}

func (c *VMStatCollector) Name() string { return "vmstat" }

func (c *VMStatCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	v, err := procfs.ReadVMStat()
	if err != nil {
		return nil, err
	}

	var points []model.MetricPoint

	if rate, ok := c.rate.Compute("pgfault", float64(v.PgFault)); ok {
		points = append(points, model.NewGauge("system.vmstat.pgfault_per_sec", rate, baseTags))
	}
	if rate, ok := c.rate.Compute("pgmajfault", float64(v.PgMajFault)); ok {
		points = append(points, model.NewGauge("system.vmstat.pgmajfault_per_sec", rate, baseTags))
	}
	if rate, ok := c.rate.Compute("pswpin", float64(v.PswpIn)); ok {
		points = append(points, model.NewGauge("system.vmstat.pswpin_per_sec", rate, baseTags))
	}
	if rate, ok := c.rate.Compute("pswpout", float64(v.PswpOut)); ok {
		points = append(points, model.NewGauge("system.vmstat.pswpout_per_sec", rate, baseTags))
	}

	points = append(points, model.NewGauge("system.vmstat.oom_kill_total", float64(v.OomKill), baseTags))

	return points, nil
}
