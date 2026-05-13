//go:build linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type CPUStatCollector struct {
	rate *RateComputer
}

func NewCPUStatCollector() *CPUStatCollector {
	return &CPUStatCollector{rate: NewRateComputer()}
}

func (c *CPUStatCollector) Name() string { return "cpustat" }

func (c *CPUStatCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	stat, err := procfs.ReadStat()
	if err != nil {
		return nil, err
	}

	var points []model.MetricPoint

	if rate, ok := c.rate.Compute("context_switches", float64(stat.ContextSwitches)); ok {
		points = append(points, model.NewGauge("system.cpu.context_switches_total", rate, baseTags))
	}
	if rate, ok := c.rate.Compute("interrupts", float64(stat.Interrupts)); ok {
		points = append(points, model.NewGauge("system.cpu.interrupts_total", rate, baseTags))
	}
	if rate, ok := c.rate.Compute("forks", float64(stat.Forks)); ok {
		points = append(points, model.NewGauge("system.cpu.forks_total", rate, baseTags))
	}

	points = append(points,
		model.NewGauge("system.cpu.procs_running", float64(stat.ProcsRunning), baseTags),
		model.NewGauge("system.cpu.procs_blocked", float64(stat.ProcsBlocked), baseTags),
	)

	return points, nil
}
