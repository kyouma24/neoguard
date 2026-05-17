package agent

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/collector"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type CollectorState int

const (
	StateHealthy  CollectorState = iota
	StateDegraded
	StateDisabled
)

func (s CollectorState) String() string {
	switch s {
	case StateHealthy:
		return "healthy"
	case StateDegraded:
		return "degraded"
	case StateDisabled:
		return "disabled"
	default:
		return "unknown"
	}
}

const (
	degradedWindow     = 5 * time.Minute
	panicsToDegrade    = 3
	panicsToDisable    = 3
)

type SupervisedCollector struct {
	inner     collector.Collector
	mu        sync.RWMutex
	state     CollectorState
	panicCount int
	lastPanic  time.Time
	degradedAt time.Time
	clock      func() time.Time
	warmUp    bool
}

func NewSupervisedCollector(c collector.Collector, clock func() time.Time) *SupervisedCollector {
	return &SupervisedCollector{
		inner: c,
		state: StateHealthy,
		clock: clock,
	}
}

func (sc *SupervisedCollector) Name() string {
	return sc.inner.Name()
}

func (sc *SupervisedCollector) SetWarmUp(v bool) {
	sc.mu.Lock()
	sc.warmUp = v
	sc.mu.Unlock()
}

func (sc *SupervisedCollector) State() CollectorState {
	sc.mu.RLock()
	defer sc.mu.RUnlock()
	return sc.state
}

func (sc *SupervisedCollector) Collect(ctx context.Context, baseTags map[string]string) (points []model.MetricPoint, err error) {
	sc.mu.RLock()
	state := sc.state
	degradedAt := sc.degradedAt
	sc.mu.RUnlock()

	now := sc.clock()

	switch state {
	case StateDisabled:
		return nil, nil
	case StateDegraded:
		if now.Sub(degradedAt) < degradedWindow {
			return nil, nil
		}
		// Window expired — attempt retry
	}

	defer func() {
		if r := recover(); r != nil {
			slog.Error("collector panic recovered",
				"collector", sc.inner.Name(),
				"panic", fmt.Sprintf("%v", r),
			)
			sc.recordPanic()
			points = nil
			err = fmt.Errorf("panic: %v", r)
		}
	}()

	points, err = sc.inner.Collect(ctx, baseTags)

	if state == StateDegraded && err == nil {
		sc.mu.Lock()
		sc.state = StateHealthy
		sc.panicCount = 0
		sc.mu.Unlock()
		slog.Info("collector recovered", "collector", sc.inner.Name())
	}

	return points, err
}

func (sc *SupervisedCollector) recordPanic() {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	if sc.warmUp {
		return
	}

	now := sc.clock()
	sc.panicCount++
	sc.lastPanic = now

	switch sc.state {
	case StateHealthy:
		if sc.panicCount >= panicsToDegrade {
			sc.state = StateDegraded
			sc.degradedAt = now
			sc.panicCount = 0
			slog.Warn("collector degraded", "collector", sc.inner.Name())
		}
	case StateDegraded:
		if sc.panicCount >= panicsToDisable {
			sc.state = StateDisabled
			slog.Error("collector disabled permanently", "collector", sc.inner.Name())
		}
	}
}

type SupervisedComposite struct {
	inner     collector.CompositeCollector
	mu        sync.RWMutex
	state     CollectorState
	panicCount int
	lastPanic  time.Time
	degradedAt time.Time
	clock      func() time.Time
}

func NewSupervisedComposite(c collector.CompositeCollector, clock func() time.Time) *SupervisedComposite {
	return &SupervisedComposite{
		inner: c,
		state: StateHealthy,
		clock: clock,
	}
}

func (sc *SupervisedComposite) Name() string {
	return sc.inner.Name()
}

func (sc *SupervisedComposite) State() CollectorState {
	sc.mu.RLock()
	defer sc.mu.RUnlock()
	return sc.state
}

func (sc *SupervisedComposite) CollectComposite(ctx context.Context, baseTags map[string]string, currentPoints []model.MetricPoint) (points []model.MetricPoint, err error) {
	sc.mu.RLock()
	state := sc.state
	degradedAt := sc.degradedAt
	sc.mu.RUnlock()

	now := sc.clock()

	switch state {
	case StateDisabled:
		return nil, nil
	case StateDegraded:
		if now.Sub(degradedAt) < degradedWindow {
			return nil, nil
		}
	}

	defer func() {
		if r := recover(); r != nil {
			slog.Error("composite collector panic recovered",
				"collector", sc.inner.Name(),
				"panic", fmt.Sprintf("%v", r),
			)
			sc.recordPanic()
			points = nil
			err = fmt.Errorf("panic: %v", r)
		}
	}()

	points, err = sc.inner.CollectComposite(ctx, baseTags, currentPoints)

	if state == StateDegraded && err == nil {
		sc.mu.Lock()
		sc.state = StateHealthy
		sc.panicCount = 0
		sc.mu.Unlock()
		slog.Info("composite collector recovered", "collector", sc.inner.Name())
	}

	return points, err
}

func (sc *SupervisedComposite) recordPanic() {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	now := sc.clock()
	sc.panicCount++
	sc.lastPanic = now

	switch sc.state {
	case StateHealthy:
		if sc.panicCount >= panicsToDegrade {
			sc.state = StateDegraded
			sc.degradedAt = now
			sc.panicCount = 0
			slog.Warn("composite collector degraded", "collector", sc.inner.Name())
		}
	case StateDegraded:
		if sc.panicCount >= panicsToDisable {
			sc.state = StateDisabled
			slog.Error("composite collector disabled permanently", "collector", sc.inner.Name())
		}
	}
}

type SupervisorRegistry struct {
	mu         sync.RWMutex
	collectors []*SupervisedCollector
	composites []*SupervisedComposite
	clock      func() time.Time
}

func NewSupervisorRegistry(clock func() time.Time) *SupervisorRegistry {
	return &SupervisorRegistry{clock: clock}
}

func (r *SupervisorRegistry) SetWarmUp(v bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, sc := range r.collectors {
		sc.SetWarmUp(v)
	}
}

func (r *SupervisorRegistry) WrapCollector(c collector.Collector) *SupervisedCollector {
	sc := NewSupervisedCollector(c, r.clock)
	r.mu.Lock()
	r.collectors = append(r.collectors, sc)
	r.mu.Unlock()
	return sc
}

func (r *SupervisorRegistry) WrapComposite(c collector.CompositeCollector) *SupervisedComposite {
	sc := NewSupervisedComposite(c, r.clock)
	r.mu.Lock()
	r.composites = append(r.composites, sc)
	r.mu.Unlock()
	return sc
}

type StateSnapshot struct {
	Healthy  int
	Degraded int
	Disabled int
	Total    int
}

func (s StateSnapshot) HealthyPercent() float64 {
	if s.Total == 0 {
		return 100.0
	}
	return float64(s.Healthy) / float64(s.Total) * 100.0
}

func (r *SupervisorRegistry) Snapshot() StateSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var snap StateSnapshot
	for _, sc := range r.collectors {
		snap.Total++
		switch sc.State() {
		case StateHealthy:
			snap.Healthy++
		case StateDegraded:
			snap.Degraded++
		case StateDisabled:
			snap.Disabled++
		}
	}
	for _, sc := range r.composites {
		snap.Total++
		switch sc.State() {
		case StateHealthy:
			snap.Healthy++
		case StateDegraded:
			snap.Degraded++
		case StateDisabled:
			snap.Disabled++
		}
	}
	return snap
}

func (r *SupervisorRegistry) HealthyPercent() float64 {
	return r.Snapshot().HealthyPercent()
}

func (r *SupervisorRegistry) TotalCollectors() int {
	return r.Snapshot().Total
}

func (r *SupervisorRegistry) HealthyCollectors() int {
	return r.Snapshot().Healthy
}

func (r *SupervisorRegistry) DegradedCollectors() int {
	return r.Snapshot().Degraded
}

func (r *SupervisorRegistry) DisabledCollectors() int {
	return r.Snapshot().Disabled
}

func (r *SupervisorRegistry) Metrics(baseTags map[string]string) []model.MetricPoint {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var points []model.MetricPoint

	for _, sc := range r.collectors {
		tags := model.MergeTags(baseTags, map[string]string{"collector": sc.Name()})
		points = append(points, model.NewGauge(
			"agent.collector.state",
			float64(sc.State()),
			tags,
		))
	}
	for _, sc := range r.composites {
		tags := model.MergeTags(baseTags, map[string]string{"collector": sc.Name()})
		points = append(points, model.NewGauge(
			"agent.collector.state",
			float64(sc.State()),
			tags,
		))
	}

	snap := r.Snapshot()
	points = append(points, model.NewGauge("agent.collectors.healthy", float64(snap.Healthy), baseTags))
	points = append(points, model.NewGauge("agent.collectors.degraded", float64(snap.Degraded), baseTags))
	points = append(points, model.NewGauge("agent.collectors.disabled", float64(snap.Disabled), baseTags))
	points = append(points, model.NewGauge("agent.collectors.healthy_pct", snap.HealthyPercent(), baseTags))

	return points
}
