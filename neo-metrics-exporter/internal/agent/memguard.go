package agent

import (
	"context"
	"log/slog"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type MemoryState int

const (
	MemStateNormal   MemoryState = iota
	MemStateDegraded
	MemStateEmergency
)

func (s MemoryState) String() string {
	switch s {
	case MemStateNormal:
		return "normal"
	case MemStateDegraded:
		return "degraded"
	case MemStateEmergency:
		return "emergency"
	default:
		return "unknown"
	}
}

type ActionHandler interface {
	OnDegraded()
	OnEmergency()
	OnRecovery()
}

type noopHandler struct{}

func (noopHandler) OnDegraded()  {}
func (noopHandler) OnEmergency() {}
func (noopHandler) OnRecovery()  {}

type MemoryGuardConfig struct {
	SoftLimitBytes uint64
	HardLimitBytes uint64
	CheckInterval  time.Duration
}

type MemoryGuard struct {
	cfg            MemoryGuardConfig
	mu             sync.RWMutex
	state          MemoryState
	recoveryStart  time.Time
	gcForcedTotal  atomic.Int64
	handler        ActionHandler
	clock          func() time.Time
	memReader      func() uint64
	gcForcer       func()
	walFlusher     func()
	bufferDropper  func() int
}

func NewMemoryGuard(cfg MemoryGuardConfig, clock func() time.Time) *MemoryGuard {
	if cfg.CheckInterval <= 0 {
		cfg.CheckInterval = 5 * time.Second
	}
	return &MemoryGuard{
		cfg:       cfg,
		state:     MemStateNormal,
		handler:   noopHandler{},
		clock:     clock,
		memReader: defaultMemReader,
		gcForcer:  runtime.GC,
		walFlusher: func() {},
		bufferDropper: func() int { return 0 },
	}
}

// runtime.ReadMemStats is stop-the-world. Do not call faster than once per second.
func defaultMemReader() uint64 {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return m.HeapInuse
}

func (g *MemoryGuard) SetHandler(h ActionHandler) {
	g.mu.Lock()
	g.handler = h
	g.mu.Unlock()
}

func (g *MemoryGuard) SetMemReader(f func() uint64) {
	g.memReader = f
}

func (g *MemoryGuard) SetGCForcer(f func()) {
	g.gcForcer = f
}

func (g *MemoryGuard) SetWALFlusher(f func()) {
	g.walFlusher = f
}

func (g *MemoryGuard) SetBufferDropper(f func() int) {
	g.bufferDropper = f
}

func (g *MemoryGuard) State() MemoryState {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.state
}

func (g *MemoryGuard) Run(ctx context.Context) {
	ticker := time.NewTicker(g.cfg.CheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			g.check()
		}
	}
}

const recoveryDuration = 60 * time.Second

func (g *MemoryGuard) check() {
	heapInuse := g.memReader()

	g.mu.Lock()
	defer g.mu.Unlock()

	now := g.clock()
	prev := g.state
	softLimit := g.cfg.SoftLimitBytes
	hardLimit := g.cfg.HardLimitBytes
	recoveryThreshold := uint64(float64(softLimit) * 0.8)

	switch g.state {
	case MemStateNormal:
		if heapInuse >= hardLimit {
			g.state = MemStateDegraded
			g.recoveryStart = time.Time{}
			slog.Warn("memory self-protection: entering degraded", "heap_inuse", heapInuse, "soft_limit", softLimit)
			g.handler.OnDegraded()
			g.gcForcer()
			g.gcForcedTotal.Add(1)
			// Immediately check for emergency
			g.state = MemStateEmergency
			slog.Error("memory self-protection: entering emergency", "heap_inuse", heapInuse, "hard_limit", hardLimit)
			g.walFlusher()
			g.bufferDropper()
			g.gcForcer()
			g.gcForcedTotal.Add(1)
			g.handler.OnEmergency()
		} else if heapInuse >= softLimit {
			g.state = MemStateDegraded
			g.recoveryStart = time.Time{}
			slog.Warn("memory self-protection: entering degraded", "heap_inuse", heapInuse, "soft_limit", softLimit)
			g.handler.OnDegraded()
			g.gcForcer()
			g.gcForcedTotal.Add(1)
		}

	case MemStateDegraded:
		if heapInuse >= hardLimit {
			g.state = MemStateEmergency
			g.recoveryStart = time.Time{}
			slog.Error("memory self-protection: entering emergency", "heap_inuse", heapInuse, "hard_limit", hardLimit)
			g.walFlusher()
			g.bufferDropper()
			g.gcForcer()
			g.gcForcedTotal.Add(1)
			g.handler.OnEmergency()
		} else if heapInuse < recoveryThreshold {
			if g.recoveryStart.IsZero() {
				g.recoveryStart = now
			} else if now.Sub(g.recoveryStart) >= recoveryDuration {
				g.state = MemStateNormal
				g.recoveryStart = time.Time{}
				slog.Info("memory self-protection: recovered to normal", "heap_inuse", heapInuse)
				g.handler.OnRecovery()
			}
		} else {
			g.recoveryStart = time.Time{}
		}

	case MemStateEmergency:
		if heapInuse < hardLimit {
			g.state = MemStateDegraded
			g.recoveryStart = time.Time{}
			slog.Warn("memory self-protection: emergency resolved, back to degraded", "heap_inuse", heapInuse)
		}
	}

	if g.state != prev {
		slog.Debug("memory state transition", "from", prev.String(), "to", g.state.String(), "heap_inuse", heapInuse)
	}
}

func (g *MemoryGuard) Metrics(baseTags map[string]string) []model.MetricPoint {
	heapInuse := g.memReader()
	g.mu.RLock()
	state := g.state
	g.mu.RUnlock()

	return []model.MetricPoint{
		model.NewGauge("agent.memory.heap_inuse_bytes", float64(heapInuse), baseTags),
		model.NewGauge("agent.memory.state", float64(state), baseTags),
		model.NewGauge("agent.memory.soft_limit_bytes", float64(g.cfg.SoftLimitBytes), baseTags),
		model.NewGauge("agent.memory.hard_limit_bytes", float64(g.cfg.HardLimitBytes), baseTags),
		model.NewCounter("agent.memory.gc_forced_total", float64(g.gcForcedTotal.Load()), baseTags),
	}
}
