package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/sensors"
)

type SensorsCollector struct{}

func NewSensorsCollector() *SensorsCollector {
	return &SensorsCollector{}
}

func (c *SensorsCollector) Name() string { return "sensors" }

func (c *SensorsCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	temps, err := sensors.TemperaturesWithContext(ctx)
	if err != nil {
		return points, nil
	}

	for _, t := range temps {
		if t.Temperature <= 0 {
			continue
		}
		tags := model.MergeTags(baseTags, map[string]string{
			"sensor": t.SensorKey,
		})
		points = append(points, model.NewGauge("system.sensors.temperature_celsius", t.Temperature, tags))
	}

	return points, nil
}
