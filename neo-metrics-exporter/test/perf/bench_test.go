package perf

import (
	"context"
	"os"
	"runtime"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/collector"
	"github.com/neoguard/neo-metrics-exporter/internal/collector/logtail"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func makePoints(n int) []model.MetricPoint {
	points := make([]model.MetricPoint, n)
	now := time.Now()
	for i := range points {
		points[i] = model.MetricPoint{
			Name:      "system.cpu.usage_total_pct",
			Value:     float64(i % 100),
			Timestamp: now,
			Tags: map[string]string{
				"hostname": "bench-host",
				"os":       "linux",
			},
			MetricType: model.MetricGauge,
		}
	}
	return points
}

func BenchmarkRingPush(b *testing.B) {
	ring := buffer.NewRing(100000)
	batch := makePoints(100)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ring.Push(batch)
	}
}

func BenchmarkRingPushDrain(b *testing.B) {
	ring := buffer.NewRing(100000)
	batch := makePoints(100)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ring.Push(batch)
		ring.Drain(100)
	}
}

func BenchmarkWALPush(b *testing.B) {
	dir := b.TempDir()
	db := buffer.NewDiskBuffer(100000, dir)
	defer db.Close()

	batch := makePoints(500)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		db.Push(batch)
	}
}

func BenchmarkConfigLoad(b *testing.B) {
	content := []byte(`
api_key: obl_live_v2_benchtest1234567890
endpoint: https://bench.example.com
cloud_detection: skip
collection:
  interval_seconds: 60
buffer:
  memory_max_items: 100000
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:8282"
`)
	tmpFile := b.TempDir() + "/bench.yaml"
	if err := os.WriteFile(tmpFile, content, 0640); err != nil {
		b.Fatal(err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := config.Load(tmpFile)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkRedaction(b *testing.B) {
	redactor := logtail.NewRedactor(true)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		entry := &model.LogEntry{
			Message: `Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig and key AKIAIOSFODNN7EXAMPLE found`,
			Fields: map[string]any{
				"password": "s3cr3t",
				"api_key":  "sk-live-1234567890",
				"user":     "normal_value",
			},
		}
		redactor.Apply(entry)
	}
}

func BenchmarkJSONParse(b *testing.B) {
	parser := logtail.NewJSONParser()
	line := `{"timestamp":"2026-05-17T10:00:00Z","level":"INFO","message":"request completed","duration_ms":42,"path":"/api/v1/metrics"}`
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := parser.Parse(line)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkRegexParse(b *testing.B) {
	parser, err := logtail.NewRegexParser(`^(?P<timestamp>\S+) (?P<level>\w+) (?P<message>.*)$`, "")
	if err != nil {
		b.Fatal(err)
	}
	line := `2026-05-17T10:00:00Z INFO request completed in 42ms`
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := parser.Parse(line)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkStartup(b *testing.B) {
	content := []byte(`
api_key: obl_live_v2_benchtest1234567890
endpoint: https://bench.example.com
cloud_detection: skip
collection:
  interval_seconds: 60
buffer:
  memory_max_items: 100000
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:8282"
`)
	tmpFile := b.TempDir() + "/bench.yaml"
	if err := os.WriteFile(tmpFile, content, 0640); err != nil {
		b.Fatal(err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cfg, err := config.Load(tmpFile)
		if err != nil {
			b.Fatal(err)
		}
		ring := buffer.NewRing(cfg.Buffer.MemoryMaxItems)
		_ = ring
	}
}

func BenchmarkMemorySteadyState(b *testing.B) {
	ring := buffer.NewRing(100000)
	batch := makePoints(500)

	// Fill buffer to steady state
	for i := 0; i < 200; i++ {
		ring.Push(batch)
	}
	// Drain half
	for i := 0; i < 100; i++ {
		ring.Drain(500)
	}

	runtime.GC()
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	b.ReportMetric(float64(m.HeapAlloc), "heap_bytes")
	b.ReportMetric(float64(m.Sys), "sys_bytes")
}

func BenchmarkCollectionCycle(b *testing.B) {
	ctx := context.Background()
	cpuCollector := collector.NewCPUCollector(config.CPUConfig{})
	memCollector := collector.NewMemoryCollector()
	tags := map[string]string{"hostname": "bench-host", "os": runtime.GOOS}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cpuCollector.Collect(ctx, tags)
		memCollector.Collect(ctx, tags)
	}
}
