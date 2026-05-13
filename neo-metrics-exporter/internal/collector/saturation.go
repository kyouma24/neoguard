package collector

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type slidingWindowSample struct {
	value float64
	ts    time.Time
}

type slidingWindowEntry struct {
	samples  []slidingWindowSample
	lastSeen time.Time
}

type SlidingWindow struct {
	mu       sync.Mutex
	windows  map[string]*slidingWindowEntry
	maxSize  int
	staleTTL time.Duration
	addCount int
}

func NewSlidingWindow(maxSize int) *SlidingWindow {
	if maxSize <= 0 {
		maxSize = 30
	}
	return &SlidingWindow{
		windows:  make(map[string]*slidingWindowEntry),
		maxSize:  maxSize,
		staleTTL: defaultStaleTTL,
	}
}

func (sw *SlidingWindow) Add(key string, value float64, ts time.Time) {
	now := time.Now()
	sw.mu.Lock()
	defer sw.mu.Unlock()

	sw.addCount++
	if sw.addCount%evictCheckInterval == 0 {
		sw.evictLocked(now)
	}

	entry, exists := sw.windows[key]
	if !exists {
		entry = &slidingWindowEntry{}
		sw.windows[key] = entry
	}
	entry.lastSeen = now
	entry.samples = append(entry.samples, slidingWindowSample{value: value, ts: ts})
	if len(entry.samples) > sw.maxSize {
		entry.samples = entry.samples[len(entry.samples)-sw.maxSize:]
	}
}

func (sw *SlidingWindow) LinearRegression(key string) (slope float64, ok bool) {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	entry, exists := sw.windows[key]
	if !exists {
		return 0, false
	}
	samples := entry.samples
	n := len(samples)
	if n < 2 {
		return 0, false
	}

	t0 := samples[0].ts
	var sumX, sumY, sumXY, sumX2 float64
	for _, s := range samples {
		x := s.ts.Sub(t0).Seconds()
		y := s.value
		sumX += x
		sumY += y
		sumXY += x * y
		sumX2 += x * x
	}

	nf := float64(n)
	denom := nf*sumX2 - sumX*sumX
	if denom == 0 {
		return 0, false
	}

	slope = (nf*sumXY - sumX*sumY) / denom
	return slope, true
}

func (sw *SlidingWindow) LatestValue(key string) (float64, bool) {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	entry, exists := sw.windows[key]
	if !exists || len(entry.samples) == 0 {
		return 0, false
	}
	return entry.samples[len(entry.samples)-1].value, true
}

func (sw *SlidingWindow) Len() int {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	return len(sw.windows)
}

func (sw *SlidingWindow) evictLocked(now time.Time) {
	for key, entry := range sw.windows {
		if now.Sub(entry.lastSeen) > sw.staleTTL {
			delete(sw.windows, key)
		}
	}
}

const maxProjectionHours = 720

type SaturationCollector struct {
	window *SlidingWindow
}

func NewSaturationCollector(windowSize int) *SaturationCollector {
	return &SaturationCollector{
		window: NewSlidingWindow(windowSize),
	}
}

func (c *SaturationCollector) Name() string { return "saturation" }

func (c *SaturationCollector) CollectComposite(ctx context.Context, baseTags map[string]string, currentPoints []model.MetricPoint) ([]model.MetricPoint, error) {
	now := time.Now()
	var points []model.MetricPoint

	if v, ok := findMetricValue(currentPoints, "system.memory.used_pct"); ok {
		c.window.Add("memory_pct", v, now)
		hours := c.projectHours("memory_pct", 100-v)
		points = append(points, model.NewGauge("system.memory.full_in_hours", hours, baseTags))
	}

	if v, ok := findMetricValue(currentPoints, "system.cpu.usage_total_pct"); ok {
		c.window.Add("cpu_pct", v, now)
		hours := c.projectHours("cpu_pct", 95-v)
		points = append(points, model.NewGauge("system.cpu.saturated_in_hours", hours, baseTags))
	}

	for _, p := range currentPoints {
		if p.Name != "system.disk.used_pct" {
			continue
		}
		mount := p.Tags["mount"]
		device := p.Tags["device"]
		key := "disk_pct:" + mount
		c.window.Add(key, p.Value, now)
		hours := c.projectHours(key, 100-p.Value)
		tags := model.MergeTags(baseTags, map[string]string{
			"mount":  mount,
			"device": device,
		})
		points = append(points, model.NewGauge("system.disk.full_in_hours", hours, tags))
	}

	return points, nil
}

func (c *SaturationCollector) projectHours(key string, remaining float64) float64 {
	slope, ok := c.window.LinearRegression(key)
	if !ok || slope <= 0 || remaining <= 0 {
		return -1
	}
	hours := remaining / slope / 3600
	return math.Min(hours, maxProjectionHours)
}
