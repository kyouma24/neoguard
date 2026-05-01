package collector

import (
	"context"
	"runtime"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type AgentStats struct {
	CollectionDurationMs atomic.Int64
	PointsCollected      atomic.Int64
	BufferSize           atomic.Int64
	BufferDropped        atomic.Int64
	SendDurationMs       atomic.Int64
	PointsSent           atomic.Int64
	SendErrors           atomic.Int64
}

func (s *AgentStats) GetCollectionMs() int64   { return s.CollectionDurationMs.Load() }
func (s *AgentStats) GetPointsCollected() int64 { return s.PointsCollected.Load() }
func (s *AgentStats) GetBufferSize() int64      { return s.BufferSize.Load() }
func (s *AgentStats) GetBufferDropped() int64   { return s.BufferDropped.Load() }
func (s *AgentStats) GetPointsSent() int64      { return s.PointsSent.Load() }
func (s *AgentStats) GetSendErrors() int64      { return s.SendErrors.Load() }

type AgentSelfCollector struct {
	stats     *AgentStats
	startTime time.Time
}

func NewAgentSelfCollector(stats *AgentStats) *AgentSelfCollector {
	return &AgentSelfCollector{
		stats:     stats,
		startTime: time.Now(),
	}
}

func (c *AgentSelfCollector) Name() string { return "agentself" }

func (c *AgentSelfCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	points := []model.MetricPoint{
		model.NewGauge("agent.uptime_seconds", time.Since(c.startTime).Seconds(), baseTags),
		model.NewGauge("agent.collection_duration_ms", float64(c.stats.CollectionDurationMs.Load()), baseTags),
		model.NewGauge("agent.points_collected", float64(c.stats.PointsCollected.Load()), baseTags),
		model.NewGauge("agent.buffer_size", float64(c.stats.BufferSize.Load()), baseTags),
		model.NewGauge("agent.buffer_dropped", float64(c.stats.BufferDropped.Load()), baseTags),
		model.NewGauge("agent.send_duration_ms", float64(c.stats.SendDurationMs.Load()), baseTags),
		model.NewGauge("agent.points_sent", float64(c.stats.PointsSent.Load()), baseTags),
		model.NewGauge("agent.send_errors", float64(c.stats.SendErrors.Load()), baseTags),
		model.NewGauge("agent.go.goroutines", float64(runtime.NumGoroutine()), baseTags),
		model.NewGauge("agent.go.heap_alloc_bytes", float64(memStats.HeapAlloc), baseTags),
		model.NewGauge("agent.go.heap_sys_bytes", float64(memStats.HeapSys), baseTags),
		model.NewGauge("agent.go.gc_pause_ns", float64(memStats.PauseNs[(memStats.NumGC+255)%256]), baseTags),
		model.NewGauge("agent.go.num_gc", float64(memStats.NumGC), baseTags),
	}

	return points, nil
}
