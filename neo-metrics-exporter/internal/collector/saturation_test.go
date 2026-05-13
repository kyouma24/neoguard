package collector

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestSlidingWindowAdd(t *testing.T) {
	sw := NewSlidingWindow(5)
	now := time.Now()
	sw.Add("test", 10, now)
	sw.Add("test", 20, now.Add(time.Minute))

	v, ok := sw.LatestValue("test")
	if !ok || v != 20 {
		t.Errorf("latest = %f, ok = %v", v, ok)
	}
}

func TestSlidingWindowMaxSize(t *testing.T) {
	sw := NewSlidingWindow(3)
	now := time.Now()
	for i := 0; i < 10; i++ {
		sw.Add("test", float64(i), now.Add(time.Duration(i)*time.Minute))
	}

	sw.mu.Lock()
	count := len(sw.windows["test"].samples)
	sw.mu.Unlock()
	if count != 3 {
		t.Errorf("expected 3 samples, got %d", count)
	}

	v, ok := sw.LatestValue("test")
	if !ok || v != 9 {
		t.Errorf("latest = %f, want 9", v)
	}
}

func TestLinearRegressionPositiveSlope(t *testing.T) {
	sw := NewSlidingWindow(10)
	t0 := time.Now()
	sw.Add("test", 10, t0)
	sw.Add("test", 20, t0.Add(60*time.Second))
	sw.Add("test", 30, t0.Add(120*time.Second))

	slope, ok := sw.LinearRegression("test")
	if !ok {
		t.Fatal("expected ok=true")
	}
	expected := 10.0 / 60.0
	if math.Abs(slope-expected) > 0.001 {
		t.Errorf("slope = %f, want ~%f", slope, expected)
	}
}

func TestLinearRegressionNegativeSlope(t *testing.T) {
	sw := NewSlidingWindow(10)
	t0 := time.Now()
	sw.Add("test", 30, t0)
	sw.Add("test", 20, t0.Add(60*time.Second))
	sw.Add("test", 10, t0.Add(120*time.Second))

	slope, ok := sw.LinearRegression("test")
	if !ok {
		t.Fatal("expected ok=true")
	}
	if slope >= 0 {
		t.Errorf("expected negative slope, got %f", slope)
	}
}

func TestLinearRegressionInsufficientData(t *testing.T) {
	sw := NewSlidingWindow(10)
	sw.Add("test", 10, time.Now())

	_, ok := sw.LinearRegression("test")
	if ok {
		t.Error("expected ok=false with single sample")
	}
}

func TestLinearRegressionNoKey(t *testing.T) {
	sw := NewSlidingWindow(10)
	_, ok := sw.LinearRegression("missing")
	if ok {
		t.Error("expected ok=false for missing key")
	}
}

func TestSaturationCollectorName(t *testing.T) {
	c := NewSaturationCollector(30)
	if c.Name() != "saturation" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestSaturationMemoryProjection(t *testing.T) {
	c := NewSaturationCollector(30)

	input1 := []model.MetricPoint{
		model.NewGauge("system.memory.used_pct", 70, nil),
	}
	points1, _ := c.CollectComposite(context.Background(), map[string]string{}, input1)

	val1 := findPointByName(points1, "system.memory.full_in_hours")
	if val1 == nil {
		t.Fatal("missing system.memory.full_in_hours")
	}
	if val1.Value != -1 {
		t.Errorf("first sample should return -1 (insufficient data), got %f", val1.Value)
	}

	time.Sleep(10 * time.Millisecond)

	input2 := []model.MetricPoint{
		model.NewGauge("system.memory.used_pct", 80, nil),
	}
	points2, _ := c.CollectComposite(context.Background(), map[string]string{}, input2)

	val2 := findPointByName(points2, "system.memory.full_in_hours")
	if val2 == nil {
		t.Fatal("missing system.memory.full_in_hours after 2nd sample")
	}
	if val2.Value <= 0 {
		t.Errorf("expected positive projection, got %f", val2.Value)
	}
}

func TestSaturationStableTrend(t *testing.T) {
	c := NewSaturationCollector(30)
	t0 := time.Now()
	c.window.Add("memory_pct", 50, t0)
	c.window.Add("memory_pct", 50, t0.Add(60*time.Second))

	input := []model.MetricPoint{
		model.NewGauge("system.memory.used_pct", 50, nil),
	}
	points, _ := c.CollectComposite(context.Background(), map[string]string{}, input)

	val := findPointByName(points, "system.memory.full_in_hours")
	if val == nil {
		t.Fatal("missing metric")
	}
	if val.Value != -1 {
		t.Errorf("stable trend should return -1, got %f", val.Value)
	}
}

func TestSaturationCappedAt720(t *testing.T) {
	c := NewSaturationCollector(30)
	t0 := time.Now()
	c.window.Add("memory_pct", 50, t0)
	c.window.Add("memory_pct", 50.0001, t0.Add(60*time.Second))

	input := []model.MetricPoint{
		model.NewGauge("system.memory.used_pct", 50.0001, nil),
	}
	points, _ := c.CollectComposite(context.Background(), map[string]string{}, input)

	val := findPointByName(points, "system.memory.full_in_hours")
	if val == nil {
		t.Fatal("missing metric")
	}
	if val.Value > 720 {
		t.Errorf("should be capped at 720, got %f", val.Value)
	}
}

func TestSaturationMultipleDisks(t *testing.T) {
	c := NewSaturationCollector(30)

	input := []model.MetricPoint{
		model.NewGauge("system.disk.used_pct", 50, map[string]string{"mount": "/", "device": "sda1"}),
		model.NewGauge("system.disk.used_pct", 80, map[string]string{"mount": "/data", "device": "sdb1"}),
	}
	c.CollectComposite(context.Background(), map[string]string{}, input)
	time.Sleep(10 * time.Millisecond)

	input2 := []model.MetricPoint{
		model.NewGauge("system.disk.used_pct", 55, map[string]string{"mount": "/", "device": "sda1"}),
		model.NewGauge("system.disk.used_pct", 85, map[string]string{"mount": "/data", "device": "sdb1"}),
	}
	points, _ := c.CollectComposite(context.Background(), map[string]string{}, input2)

	diskPoints := 0
	for _, p := range points {
		if p.Name == "system.disk.full_in_hours" {
			diskPoints++
		}
	}
	if diskPoints != 2 {
		t.Errorf("expected 2 disk projections, got %d", diskPoints)
	}
}

func TestSaturationMissingMetrics(t *testing.T) {
	c := NewSaturationCollector(30)
	points, err := c.CollectComposite(context.Background(), map[string]string{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 0 {
		t.Errorf("expected no points with empty input, got %d", len(points))
	}
}

func TestSlidingWindowEvictsStaleKeys(t *testing.T) {
	sw := NewSlidingWindow(10)
	sw.staleTTL = 50 * time.Millisecond

	now := time.Now()
	sw.Add("alive", 10, now)
	sw.Add("stale", 20, now)

	sw.mu.Lock()
	sw.windows["stale"].lastSeen = time.Now().Add(-100 * time.Millisecond)
	sw.addCount = evictCheckInterval - 1
	sw.mu.Unlock()

	sw.Add("alive", 11, now.Add(time.Minute))

	if sw.Len() != 1 {
		t.Errorf("expected 1 key after eviction, got %d", sw.Len())
	}

	_, ok := sw.LatestValue("stale")
	if ok {
		t.Error("stale key should have been evicted")
	}
	v, ok := sw.LatestValue("alive")
	if !ok || v != 11 {
		t.Errorf("alive key should still exist with value 11, got %f", v)
	}
}

func TestSlidingWindowLen(t *testing.T) {
	sw := NewSlidingWindow(10)
	if sw.Len() != 0 {
		t.Error("empty window should have len 0")
	}
	sw.Add("a", 1, time.Now())
	sw.Add("b", 2, time.Now())
	if sw.Len() != 2 {
		t.Errorf("expected 2, got %d", sw.Len())
	}
}

func findPointByName(points []model.MetricPoint, name string) *model.MetricPoint {
	for _, p := range points {
		if p.Name == name {
			return &p
		}
	}
	return nil
}
