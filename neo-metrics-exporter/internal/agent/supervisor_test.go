package agent

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func newFakeClock(t time.Time) *fakeClock {
	return &fakeClock{now: t}
}

func (fc *fakeClock) Now() time.Time {
	fc.mu.Lock()
	defer fc.mu.Unlock()
	return fc.now
}

func (fc *fakeClock) Advance(d time.Duration) {
	fc.mu.Lock()
	fc.now = fc.now.Add(d)
	fc.mu.Unlock()
}

type panicCollector struct {
	name       string
	panicCount int
	mu         sync.Mutex
	calls      int
}

func (c *panicCollector) Name() string { return c.name }

func (c *panicCollector) Collect(_ context.Context, _ map[string]string) ([]model.MetricPoint, error) {
	c.mu.Lock()
	c.calls++
	calls := c.calls
	c.mu.Unlock()

	if calls <= c.panicCount {
		panic("test panic")
	}
	return []model.MetricPoint{{Name: "ok", Value: 1}}, nil
}

type panicComposite struct {
	name       string
	panicCount int
	mu         sync.Mutex
	calls      int
}

func (c *panicComposite) Name() string { return c.name }

func (c *panicComposite) CollectComposite(_ context.Context, _ map[string]string, _ []model.MetricPoint) ([]model.MetricPoint, error) {
	c.mu.Lock()
	c.calls++
	calls := c.calls
	c.mu.Unlock()

	if calls <= c.panicCount {
		panic("composite panic")
	}
	return []model.MetricPoint{{Name: "composite_ok", Value: 1}}, nil
}

func TestSupervisedCollectorHealthyOnSuccess(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicCollector{name: "test", panicCount: 0}
	sc := NewSupervisedCollector(inner, fc.Now)

	points, err := sc.Collect(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("got %d points, want 1", len(points))
	}
	if sc.State() != StateHealthy {
		t.Fatalf("state = %v, want healthy", sc.State())
	}
}

func TestSupervisedCollectorPanicRecovery(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicCollector{name: "panicker", panicCount: 1}
	sc := NewSupervisedCollector(inner, fc.Now)

	points, err := sc.Collect(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error from panic")
	}
	if points != nil {
		t.Fatalf("expected nil points, got %v", points)
	}
	if sc.State() != StateHealthy {
		t.Fatalf("state = %v after 1 panic, want healthy (need 3 to degrade)", sc.State())
	}
}

func TestSupervisedCollectorDegradedAfter3Panics(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicCollector{name: "panicker", panicCount: 100}
	sc := NewSupervisedCollector(inner, fc.Now)

	for i := 0; i < 3; i++ {
		sc.Collect(context.Background(), nil)
	}

	if sc.State() != StateDegraded {
		t.Fatalf("state = %v after 3 panics, want degraded", sc.State())
	}
}

func TestSupervisedCollectorDegradedSkipsCollection(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicCollector{name: "panicker", panicCount: 100}
	sc := NewSupervisedCollector(inner, fc.Now)

	// Trigger degraded
	for i := 0; i < 3; i++ {
		sc.Collect(context.Background(), nil)
	}

	// Advance less than 5 minutes — should skip
	fc.Advance(4 * time.Minute)
	points, err := sc.Collect(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if points != nil {
		t.Fatal("expected nil points during degraded window")
	}
}

func TestSupervisedCollectorDegradedRetryAfterWindow(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	// 3 panics to degrade, then succeeds on retry
	inner := &panicCollector{name: "recoverer", panicCount: 3}
	sc := NewSupervisedCollector(inner, fc.Now)

	for i := 0; i < 3; i++ {
		sc.Collect(context.Background(), nil)
	}
	if sc.State() != StateDegraded {
		t.Fatalf("state = %v, want degraded", sc.State())
	}

	// Advance past window
	fc.Advance(5*time.Minute + time.Second)
	points, err := sc.Collect(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error on retry: %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("got %d points, want 1", len(points))
	}
	if sc.State() != StateHealthy {
		t.Fatalf("state = %v after successful retry, want healthy", sc.State())
	}
}

func TestSupervisedCollectorDegradedRetryFailResets(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	// All calls panic
	inner := &panicCollector{name: "broken", panicCount: 100}
	sc := NewSupervisedCollector(inner, fc.Now)

	// 3 panics → degraded, counter reset to 0
	for i := 0; i < 3; i++ {
		sc.Collect(context.Background(), nil)
	}
	if sc.State() != StateDegraded {
		t.Fatalf("state = %v, want degraded", sc.State())
	}

	// After window: retry panics, counter becomes 1
	fc.Advance(5*time.Minute + time.Second)
	sc.Collect(context.Background(), nil)
	if sc.State() != StateDegraded {
		t.Fatalf("state = %v after 1 retry panic, want still degraded", sc.State())
	}

	// 2 more panics in degraded → disabled
	fc.Advance(5*time.Minute + time.Second)
	sc.Collect(context.Background(), nil)
	fc.Advance(5*time.Minute + time.Second)
	sc.Collect(context.Background(), nil)
	if sc.State() != StateDisabled {
		t.Fatalf("state = %v after 3 degraded panics, want disabled", sc.State())
	}
}

func TestSupervisedCollectorDisabledPermanent(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicCollector{name: "dead", panicCount: 100}
	sc := NewSupervisedCollector(inner, fc.Now)

	// healthy → degraded
	for i := 0; i < 3; i++ {
		sc.Collect(context.Background(), nil)
	}
	// degraded → disabled
	for i := 0; i < 3; i++ {
		fc.Advance(5*time.Minute + time.Second)
		sc.Collect(context.Background(), nil)
	}

	if sc.State() != StateDisabled {
		t.Fatalf("state = %v, want disabled", sc.State())
	}

	// Disabled is permanent — even after long time
	fc.Advance(24 * time.Hour)
	points, err := sc.Collect(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if points != nil {
		t.Fatal("disabled collector should return nil points")
	}
	if sc.State() != StateDisabled {
		t.Fatal("disabled state should be permanent")
	}
}

func TestSupervisedCompositeFullLifecycle(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicComposite{name: "comp", panicCount: 3}
	sc := NewSupervisedComposite(inner, fc.Now)

	// 3 panics → degraded
	for i := 0; i < 3; i++ {
		sc.CollectComposite(context.Background(), nil, nil)
	}
	if sc.State() != StateDegraded {
		t.Fatalf("state = %v, want degraded", sc.State())
	}

	// Retry after window — succeeds
	fc.Advance(5*time.Minute + time.Second)
	points, err := sc.CollectComposite(context.Background(), nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("got %d points, want 1", len(points))
	}
	if sc.State() != StateHealthy {
		t.Fatalf("state = %v, want healthy after recovery", sc.State())
	}
}

func TestRegistrySnapshot(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	reg := NewSupervisorRegistry(fc.Now)

	c1 := &panicCollector{name: "ok1", panicCount: 0}
	c2 := &panicCollector{name: "panicker", panicCount: 100}
	comp := &panicComposite{name: "comp_ok", panicCount: 0}

	reg.WrapCollector(c1)
	sc2 := reg.WrapCollector(c2)
	reg.WrapComposite(comp)

	// Degrade c2
	for i := 0; i < 3; i++ {
		sc2.Collect(context.Background(), nil)
	}

	snap := reg.Snapshot()
	if snap.Total != 3 {
		t.Fatalf("total = %d, want 3", snap.Total)
	}
	if snap.Healthy != 2 {
		t.Fatalf("healthy = %d, want 2", snap.Healthy)
	}
	if snap.Degraded != 1 {
		t.Fatalf("degraded = %d, want 1", snap.Degraded)
	}
}

func TestRegistryMetricsCount(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	reg := NewSupervisorRegistry(fc.Now)

	reg.WrapCollector(&panicCollector{name: "a", panicCount: 0})
	reg.WrapCollector(&panicCollector{name: "b", panicCount: 0})
	reg.WrapComposite(&panicComposite{name: "c", panicCount: 0})

	metrics := reg.Metrics(map[string]string{"host": "test"})
	// 3 per-collector state metrics + 4 aggregate metrics = 7
	if len(metrics) != 7 {
		t.Fatalf("got %d metrics, want 7 (3 per-collector + 4 aggregate)", len(metrics))
	}
}

func TestHealthyPercentThresholds(t *testing.T) {
	tests := []struct {
		healthy, degraded, disabled int
		wantPct                     float64
		wantAbove80                 bool
		wantAbove50                 bool
	}{
		{healthy: 4, degraded: 1, disabled: 0, wantPct: 80.0, wantAbove80: true, wantAbove50: true},
		{healthy: 3, degraded: 1, disabled: 1, wantPct: 60.0, wantAbove80: false, wantAbove50: true},
		{healthy: 2, degraded: 2, disabled: 1, wantPct: 40.0, wantAbove80: false, wantAbove50: false},
		{healthy: 5, degraded: 0, disabled: 0, wantPct: 100.0, wantAbove80: true, wantAbove50: true},
		{healthy: 0, degraded: 0, disabled: 5, wantPct: 0.0, wantAbove80: false, wantAbove50: false},
	}

	for _, tt := range tests {
		snap := StateSnapshot{
			Healthy:  tt.healthy,
			Degraded: tt.degraded,
			Disabled: tt.disabled,
			Total:    tt.healthy + tt.degraded + tt.disabled,
		}
		pct := snap.HealthyPercent()
		if pct != tt.wantPct {
			t.Errorf("HealthyPercent(%d/%d/%d) = %f, want %f",
				tt.healthy, tt.degraded, tt.disabled, pct, tt.wantPct)
		}
		if (pct >= 80.0) != tt.wantAbove80 {
			t.Errorf("above80 for %f = %v, want %v", pct, pct >= 80.0, tt.wantAbove80)
		}
		if (pct >= 50.0) != tt.wantAbove50 {
			t.Errorf("above50 for %f = %v, want %v", pct, pct >= 50.0, tt.wantAbove50)
		}
	}
}

func TestHealthyPercentEmpty(t *testing.T) {
	snap := StateSnapshot{Total: 0}
	if snap.HealthyPercent() != 100.0 {
		t.Fatalf("empty registry should be 100%% healthy, got %f", snap.HealthyPercent())
	}
}

func TestWarmUpSuppressesStateTransitions(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicCollector{name: "warmup", panicCount: 100}
	sc := NewSupervisedCollector(inner, fc.Now)

	sc.SetWarmUp(true)

	// 10 panics during warm-up — should not transition
	for i := 0; i < 10; i++ {
		sc.Collect(context.Background(), nil)
	}

	if sc.State() != StateHealthy {
		t.Fatalf("state = %v during warm-up, want healthy", sc.State())
	}

	sc.SetWarmUp(false)

	// Now panics count normally
	for i := 0; i < 3; i++ {
		sc.Collect(context.Background(), nil)
	}
	if sc.State() != StateDegraded {
		t.Fatalf("state = %v after warm-up off + 3 panics, want degraded", sc.State())
	}
}

func TestConcurrentAccess(t *testing.T) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	inner := &panicCollector{name: "concurrent", panicCount: 2}
	sc := NewSupervisedCollector(inner, fc.Now)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sc.Collect(context.Background(), nil)
			_ = sc.State()
		}()
	}
	wg.Wait()
}
