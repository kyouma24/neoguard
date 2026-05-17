package agent

import (
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type ClockGuard struct {
	mu            sync.Mutex
	lastEmitted   time.Time
	BackwardJumps atomic.Int64

	// clockSkewSeconds is populated by Phase 1 registration when the backend
	// Date header is captured. Until then, value is 0.0 and strict_clock_check
	// is a no-op even when enabled in config.
	clockSkewSeconds atomic.Value
}

func NewClockGuard() *ClockGuard {
	g := &ClockGuard{}
	g.clockSkewSeconds.Store(float64(0))
	return g
}

// FloorTimestamps ensures no emitted point has a timestamp earlier than the
// previous batch's latest timestamp.
//
// Processing order: points are sorted by their original timestamp, then any
// point with timestamp <= lastEmitted is floored to lastEmitted + 1ms.
// After processing, lastEmitted is updated to max(lastEmitted, max(point timestamps)).
//
// First batch (lastEmitted.IsZero()): no flooring occurs, lastEmitted is
// initialized to the max timestamp in the batch.
func (g *ClockGuard) FloorTimestamps(points []model.MetricPoint) {
	if len(points) == 0 {
		return
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	if g.lastEmitted.IsZero() {
		var maxTs time.Time
		for i := range points {
			if points[i].Timestamp.After(maxTs) {
				maxTs = points[i].Timestamp
			}
		}
		g.lastEmitted = maxTs
		return
	}

	sort.Slice(points, func(i, j int) bool {
		return points[i].Timestamp.Before(points[j].Timestamp)
	})

	floored := false
	for i := range points {
		if !points[i].Timestamp.After(g.lastEmitted) {
			points[i].Timestamp = g.lastEmitted.Add(time.Millisecond)
			floored = true
		}
	}

	if floored {
		g.BackwardJumps.Add(1)
		slog.Warn("clock_jump_backward_detected: timestamps floored")
	}

	var maxTs time.Time
	for i := range points {
		if points[i].Timestamp.After(maxTs) {
			maxTs = points[i].Timestamp
		}
	}
	if maxTs.After(g.lastEmitted) {
		g.lastEmitted = maxTs
	}
}

func (g *ClockGuard) SetClockSkew(seconds float64) {
	g.clockSkewSeconds.Store(seconds)

	absSkew := seconds
	if absSkew < 0 {
		absSkew = -absSkew
	}

	if absSkew > 60 {
		slog.Warn("clock_skew_detected",
			"skew_seconds", seconds,
			"threshold", 60,
			"recommendation", "synchronize system clock with NTP")
	}
}

func (g *ClockGuard) ClockSkew() float64 {
	return g.clockSkewSeconds.Load().(float64)
}

// CheckStrictSkew returns error if |skew| > 300s and strict check enabled.
// Returns nil if check passes or strict check disabled.
func (g *ClockGuard) CheckStrictSkew(strictEnabled bool) error {
	skew := g.ClockSkew()
	absSkew := skew
	if absSkew < 0 {
		absSkew = -absSkew
	}

	if absSkew > 300 && strictEnabled {
		return fmt.Errorf("clock skew too large: %.1fs (threshold: 300s)", skew)
	}
	return nil
}
