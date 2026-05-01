package collector

import (
	"context"
	"sort"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type ProcessCorrelationCollector struct{}

func NewProcessCorrelationCollector() *ProcessCorrelationCollector {
	return &ProcessCorrelationCollector{}
}

func (c *ProcessCorrelationCollector) Name() string { return "correlation" }

type processMetric struct {
	name  string
	pid   string
	value float64
}

func (c *ProcessCorrelationCollector) CollectComposite(ctx context.Context, baseTags map[string]string, currentPoints []model.MetricPoint) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	cpuMetrics := extractProcessMetrics(currentPoints, "process.cpu_pct")
	if len(cpuMetrics) > 0 {
		sort.Slice(cpuMetrics, func(i, j int) bool { return cpuMetrics[i].value > cpuMetrics[j].value })
		top := cpuMetrics[0]
		points = append(points, model.NewGauge("system.cpu.top_process", top.value, model.MergeTags(baseTags, map[string]string{
			"process_name": top.name,
			"process_pid":  top.pid,
		})))
		sum := 0.0
		for i := 0; i < len(cpuMetrics) && i < 3; i++ {
			sum += cpuMetrics[i].value
		}
		points = append(points, model.NewGauge("system.cpu.top3_pct", sum, baseTags))
	}

	memBytesMetrics := extractProcessMetrics(currentPoints, "process.memory_bytes")
	if len(memBytesMetrics) > 0 {
		sort.Slice(memBytesMetrics, func(i, j int) bool { return memBytesMetrics[i].value > memBytesMetrics[j].value })
		top := memBytesMetrics[0]
		points = append(points, model.NewGauge("system.memory.top_process", top.value, model.MergeTags(baseTags, map[string]string{
			"process_name": top.name,
			"process_pid":  top.pid,
		})))
	}

	memPctMetrics := extractProcessMetrics(currentPoints, "process.memory_pct")
	if len(memPctMetrics) > 0 {
		sort.Slice(memPctMetrics, func(i, j int) bool { return memPctMetrics[i].value > memPctMetrics[j].value })
		sum := 0.0
		for i := 0; i < len(memPctMetrics) && i < 3; i++ {
			sum += memPctMetrics[i].value
		}
		points = append(points, model.NewGauge("system.memory.top3_pct", sum, baseTags))
	}

	ioMap := make(map[string]*processMetric)
	for _, p := range currentPoints {
		if p.Name != "process.io_read_bytes" && p.Name != "process.io_write_bytes" {
			continue
		}
		pid := p.Tags["process_pid"]
		if pid == "" {
			continue
		}
		if _, ok := ioMap[pid]; !ok {
			ioMap[pid] = &processMetric{
				name: p.Tags["process_name"],
				pid:  pid,
			}
		}
		ioMap[pid].value += p.Value
	}
	if len(ioMap) > 0 {
		ioMetrics := make([]processMetric, 0, len(ioMap))
		for _, m := range ioMap {
			ioMetrics = append(ioMetrics, *m)
		}
		sort.Slice(ioMetrics, func(i, j int) bool { return ioMetrics[i].value > ioMetrics[j].value })
		top := ioMetrics[0]
		points = append(points, model.NewGauge("system.io.top_process", top.value, model.MergeTags(baseTags, map[string]string{
			"process_name": top.name,
			"process_pid":  top.pid,
		})))
	}

	return points, nil
}

func extractProcessMetrics(points []model.MetricPoint, metricName string) []processMetric {
	var result []processMetric
	for _, p := range points {
		if p.Name != metricName {
			continue
		}
		name := p.Tags["process_name"]
		pid := p.Tags["process_pid"]
		if pid == "" {
			continue
		}
		result = append(result, processMetric{
			name:  name,
			pid:   pid,
			value: p.Value,
		})
	}
	return result
}
