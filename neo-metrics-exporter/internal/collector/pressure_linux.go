//go:build linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type PressureCollector struct{}

func NewPressureCollector() *PressureCollector {
	return &PressureCollector{}
}

func (c *PressureCollector) Name() string { return "pressure" }

func (c *PressureCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	p, err := procfs.ReadPressure()
	if err != nil {
		return nil, err
	}

	var points []model.MetricPoint

	if p.CPU != nil && p.CPU.Some != nil {
		points = append(points,
			model.NewGauge("system.pressure.cpu.some.avg10", p.CPU.Some.Avg10, baseTags),
			model.NewGauge("system.pressure.cpu.some.avg60", p.CPU.Some.Avg60, baseTags),
			model.NewGauge("system.pressure.cpu.some.avg300", p.CPU.Some.Avg300, baseTags),
			model.NewGauge("system.pressure.cpu.some.total_us", float64(p.CPU.Some.Total), baseTags),
		)
	}

	if p.Memory != nil {
		if p.Memory.Some != nil {
			points = append(points,
				model.NewGauge("system.pressure.memory.some.avg10", p.Memory.Some.Avg10, baseTags),
				model.NewGauge("system.pressure.memory.some.avg60", p.Memory.Some.Avg60, baseTags),
				model.NewGauge("system.pressure.memory.some.avg300", p.Memory.Some.Avg300, baseTags),
			)
		}
		if p.Memory.Full != nil {
			points = append(points,
				model.NewGauge("system.pressure.memory.full.avg10", p.Memory.Full.Avg10, baseTags),
				model.NewGauge("system.pressure.memory.full.avg60", p.Memory.Full.Avg60, baseTags),
				model.NewGauge("system.pressure.memory.full.avg300", p.Memory.Full.Avg300, baseTags),
			)
		}
	}

	if p.IO != nil {
		if p.IO.Some != nil {
			points = append(points,
				model.NewGauge("system.pressure.io.some.avg10", p.IO.Some.Avg10, baseTags),
				model.NewGauge("system.pressure.io.some.avg60", p.IO.Some.Avg60, baseTags),
				model.NewGauge("system.pressure.io.some.avg300", p.IO.Some.Avg300, baseTags),
			)
		}
		if p.IO.Full != nil {
			points = append(points,
				model.NewGauge("system.pressure.io.full.avg10", p.IO.Full.Avg10, baseTags),
				model.NewGauge("system.pressure.io.full.avg60", p.IO.Full.Avg60, baseTags),
				model.NewGauge("system.pressure.io.full.avg300", p.IO.Full.Avg300, baseTags),
			)
		}
	}

	return points, nil
}
