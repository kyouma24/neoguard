package collector

import (
	"context"
	"math"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type HealthScoreCollector struct{}

func NewHealthScoreCollector() *HealthScoreCollector {
	return &HealthScoreCollector{}
}

func (c *HealthScoreCollector) Name() string { return "healthscore" }

func (c *HealthScoreCollector) CollectComposite(ctx context.Context, baseTags map[string]string, currentPoints []model.MetricPoint) ([]model.MetricPoint, error) {
	cpuScore := 100.0
	if v, ok := findMetricValue(currentPoints, "system.cpu.usage_total_pct"); ok {
		cpuScore = clampScore(100 - v)
	}

	memoryScore := 100.0
	if v, ok := findMetricValue(currentPoints, "system.memory.used_pct"); ok {
		memoryScore = clampScore(100 - v)
	}

	diskScore := 100.0
	diskValues := findAllMetricValues(currentPoints, "system.disk.used_pct")
	if len(diskValues) > 0 {
		worst := 0.0
		for _, v := range diskValues {
			if v > worst {
				worst = v
			}
		}
		diskScore = clampScore(100 - worst)
	}

	networkScore := 100.0
	errorSum := 0.0
	for _, name := range []string{
		"system.network.rx_errors_per_sec",
		"system.network.tx_errors_per_sec",
		"system.network.rx_dropped_per_sec",
		"system.network.tx_dropped_per_sec",
	} {
		for _, v := range findAllMetricValues(currentPoints, name) {
			errorSum += v
		}
	}
	if errorSum > 0 {
		networkScore = clampScore(100 - errorSum*10)
	}

	overall := cpuScore*0.30 + memoryScore*0.30 + diskScore*0.25 + networkScore*0.15

	status := "healthy"
	if overall < 50 {
		status = "critical"
	} else if overall < 80 {
		status = "degraded"
	}

	tags := model.MergeTags(baseTags, map[string]string{
		"health_status": status,
	})

	return []model.MetricPoint{
		model.NewGauge("system.health.score", math.Round(overall*100)/100, tags),
		model.NewGauge("system.health.cpu_score", math.Round(cpuScore*100)/100, tags),
		model.NewGauge("system.health.memory_score", math.Round(memoryScore*100)/100, tags),
		model.NewGauge("system.health.disk_score", math.Round(diskScore*100)/100, tags),
		model.NewGauge("system.health.network_score", math.Round(networkScore*100)/100, tags),
	}, nil
}

func clampScore(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func findMetricValue(points []model.MetricPoint, name string) (float64, bool) {
	for _, p := range points {
		if p.Name == name {
			return p.Value, true
		}
	}
	return 0, false
}

func findAllMetricValues(points []model.MetricPoint, name string) []float64 {
	var values []float64
	for _, p := range points {
		if p.Name == name {
			values = append(values, p.Value)
		}
	}
	return values
}
