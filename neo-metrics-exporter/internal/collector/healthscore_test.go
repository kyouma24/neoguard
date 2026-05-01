package collector

import (
	"context"
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestHealthScoreCollectorName(t *testing.T) {
	c := NewHealthScoreCollector()
	if c.Name() != "healthscore" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestHealthScoreAllHealthy(t *testing.T) {
	c := NewHealthScoreCollector()
	input := []model.MetricPoint{
		model.NewGauge("system.cpu.usage_total_pct", 10, nil),
		model.NewGauge("system.memory.used_pct", 20, nil),
		model.NewGauge("system.disk.used_pct", 15, map[string]string{"mount": "/"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	overall := findPointValue(t, points, "system.health.score")
	if overall < 80 {
		t.Errorf("expected healthy (>=80), got %f", overall)
	}

	status := findPointTag(t, points, "system.health.score", "health_status")
	if status != "healthy" {
		t.Errorf("expected status=healthy, got %q", status)
	}
}

func TestHealthScoreDegraded(t *testing.T) {
	c := NewHealthScoreCollector()
	input := []model.MetricPoint{
		model.NewGauge("system.cpu.usage_total_pct", 50, nil),
		model.NewGauge("system.memory.used_pct", 40, nil),
		model.NewGauge("system.disk.used_pct", 30, map[string]string{"mount": "/"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	overall := findPointValue(t, points, "system.health.score")
	if overall >= 80 || overall < 50 {
		t.Errorf("expected degraded (50-79), got %f", overall)
	}

	status := findPointTag(t, points, "system.health.score", "health_status")
	if status != "degraded" {
		t.Errorf("expected status=degraded, got %q", status)
	}
}

func TestHealthScoreCritical(t *testing.T) {
	c := NewHealthScoreCollector()
	input := []model.MetricPoint{
		model.NewGauge("system.cpu.usage_total_pct", 98, nil),
		model.NewGauge("system.memory.used_pct", 95, nil),
		model.NewGauge("system.disk.used_pct", 97, map[string]string{"mount": "/"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	overall := findPointValue(t, points, "system.health.score")
	if overall >= 50 {
		t.Errorf("expected critical (<50), got %f", overall)
	}

	status := findPointTag(t, points, "system.health.score", "health_status")
	if status != "critical" {
		t.Errorf("expected status=critical, got %q", status)
	}
}

func TestHealthScoreMultipleDisks(t *testing.T) {
	c := NewHealthScoreCollector()
	input := []model.MetricPoint{
		model.NewGauge("system.cpu.usage_total_pct", 10, nil),
		model.NewGauge("system.memory.used_pct", 20, nil),
		model.NewGauge("system.disk.used_pct", 30, map[string]string{"mount": "/"}),
		model.NewGauge("system.disk.used_pct", 90, map[string]string{"mount": "/data"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	diskScore := findPointValue(t, points, "system.health.disk_score")
	if diskScore > 15 {
		t.Errorf("disk score should be driven by worst mount (90%% used = score 10), got %f", diskScore)
	}
}

func TestHealthScoreMissingMetrics(t *testing.T) {
	c := NewHealthScoreCollector()
	points, err := c.CollectComposite(context.Background(), map[string]string{}, nil)
	if err != nil {
		t.Fatal(err)
	}

	overall := findPointValue(t, points, "system.health.score")
	if overall != 100 {
		t.Errorf("expected 100 with no input, got %f", overall)
	}
}

func TestHealthScoreNetworkErrors(t *testing.T) {
	c := NewHealthScoreCollector()
	input := []model.MetricPoint{
		model.NewGauge("system.cpu.usage_total_pct", 10, nil),
		model.NewGauge("system.memory.used_pct", 10, nil),
		model.NewGauge("system.disk.used_pct", 10, map[string]string{"mount": "/"}),
		model.NewGauge("system.network.rx_errors_per_sec", 5, map[string]string{"interface": "eth0"}),
		model.NewGauge("system.network.tx_dropped_per_sec", 3, map[string]string{"interface": "eth0"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	netScore := findPointValue(t, points, "system.health.network_score")
	if netScore >= 100 {
		t.Errorf("network score should degrade with errors, got %f", netScore)
	}
}

func TestHealthScoreOutputCount(t *testing.T) {
	c := NewHealthScoreCollector()
	points, err := c.CollectComposite(context.Background(), map[string]string{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 5 {
		t.Errorf("expected 5 health metrics, got %d", len(points))
	}
}

func findPointValue(t *testing.T, points []model.MetricPoint, name string) float64 {
	t.Helper()
	for _, p := range points {
		if p.Name == name {
			return p.Value
		}
	}
	t.Fatalf("metric %q not found", name)
	return 0
}

func findPointTag(t *testing.T, points []model.MetricPoint, name, tagKey string) string {
	t.Helper()
	for _, p := range points {
		if p.Name == name {
			return p.Tags[tagKey]
		}
	}
	t.Fatalf("metric %q not found", name)
	return ""
}
