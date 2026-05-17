package agent

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeMemReader struct {
	mu    sync.Mutex
	value uint64
}

func (f *fakeMemReader) Read() uint64 {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.value
}

func (f *fakeMemReader) Set(v uint64) {
	f.mu.Lock()
	f.value = v
	f.mu.Unlock()
}

type trackingHandler struct {
	mu            sync.Mutex
	degradedCalls int
	emergencyCalls int
	recoveryCalls  int
}

func (h *trackingHandler) OnDegraded() {
	h.mu.Lock()
	h.degradedCalls++
	h.mu.Unlock()
}

func (h *trackingHandler) OnEmergency() {
	h.mu.Lock()
	h.emergencyCalls++
	h.mu.Unlock()
}

func (h *trackingHandler) OnRecovery() {
	h.mu.Lock()
	h.recoveryCalls++
	h.mu.Unlock()
}

type orderTracker struct {
	mu     sync.Mutex
	events []string
}

func (o *orderTracker) record(event string) {
	o.mu.Lock()
	o.events = append(o.events, event)
	o.mu.Unlock()
}

func (o *orderTracker) get() []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	out := make([]string, len(o.events))
	copy(out, o.events)
	return out
}

func newTestGuard(softMB, hardMB int) (*MemoryGuard, *fakeMemReader, *fakeClock) {
	fc := newFakeClock(time.Date(2026, 5, 13, 0, 0, 0, 0, time.UTC))
	mem := &fakeMemReader{value: 0}
	cfg := MemoryGuardConfig{
		SoftLimitBytes: uint64(softMB) * 1024 * 1024,
		HardLimitBytes: uint64(hardMB) * 1024 * 1024,
		CheckInterval:  5 * time.Second,
	}
	g := NewMemoryGuard(cfg, fc.Now)
	g.SetMemReader(mem.Read)
	g.SetGCForcer(func() {})
	g.SetWALFlusher(func() {})
	g.SetBufferDropper(func() int { return 0 })
	return g, mem, fc
}

func TestMemGuardNormalStaysNormal(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	mem.Set(100 * 1024 * 1024) // 100 MB, well below soft

	g.check()

	if g.State() != MemStateNormal {
		t.Fatalf("state = %v, want normal", g.State())
	}
}

func TestMemGuardNormalToDegraded(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	handler := &trackingHandler{}
	g.SetHandler(handler)

	mem.Set(260 * 1024 * 1024) // above soft (256MB)
	g.check()

	if g.State() != MemStateDegraded {
		t.Fatalf("state = %v, want degraded", g.State())
	}
	if handler.degradedCalls != 1 {
		t.Fatalf("OnDegraded called %d times, want 1", handler.degradedCalls)
	}
}

func TestMemGuardDegradedToEmergency(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	handler := &trackingHandler{}
	g.SetHandler(handler)

	// Enter degraded first
	mem.Set(260 * 1024 * 1024)
	g.check()

	// Cross hard limit
	mem.Set(400 * 1024 * 1024)
	g.check()

	if g.State() != MemStateEmergency {
		t.Fatalf("state = %v, want emergency", g.State())
	}
	if handler.emergencyCalls != 1 {
		t.Fatalf("OnEmergency called %d times, want 1", handler.emergencyCalls)
	}
}

func TestMemGuardEmergencyBackToDegraded(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)

	// Enter degraded then emergency
	mem.Set(260 * 1024 * 1024)
	g.check()
	mem.Set(400 * 1024 * 1024)
	g.check()

	if g.State() != MemStateEmergency {
		t.Fatalf("state = %v, want emergency", g.State())
	}

	// Drop below hard limit
	mem.Set(300 * 1024 * 1024) // below 384 but above 256
	g.check()

	if g.State() != MemStateDegraded {
		t.Fatalf("state = %v, want degraded", g.State())
	}
}

func TestMemGuardRecoveryRequires60Seconds(t *testing.T) {
	g, mem, fc := newTestGuard(256, 384)
	handler := &trackingHandler{}
	g.SetHandler(handler)

	// Enter degraded
	mem.Set(260 * 1024 * 1024)
	g.check()

	// Drop below recovery threshold (256 * 0.8 = 204.8 MB)
	mem.Set(200 * 1024 * 1024)
	g.check() // starts recovery timer

	// Advance 59s — not enough
	fc.Advance(59 * time.Second)
	g.check()

	if g.State() != MemStateDegraded {
		t.Fatalf("state = %v after 59s, want still degraded", g.State())
	}
	if handler.recoveryCalls != 0 {
		t.Fatalf("OnRecovery called %d times, want 0", handler.recoveryCalls)
	}

	// Advance 1 more second = 60s total
	fc.Advance(1 * time.Second)
	g.check()

	if g.State() != MemStateNormal {
		t.Fatalf("state = %v after 60s, want normal", g.State())
	}
	if handler.recoveryCalls != 1 {
		t.Fatalf("OnRecovery called %d times, want 1", handler.recoveryCalls)
	}
}

func TestMemGuardRecoveryInterruptedBySpike(t *testing.T) {
	g, mem, fc := newTestGuard(256, 384)

	// Enter degraded
	mem.Set(260 * 1024 * 1024)
	g.check()

	// Start recovery
	mem.Set(200 * 1024 * 1024)
	g.check()
	fc.Advance(30 * time.Second)
	g.check() // still recovering

	// Spike above recovery threshold (but still below soft)
	// 256 * 0.8 = 204.8 MB. Set to 210 MB — above recovery threshold.
	mem.Set(210 * 1024 * 1024)
	g.check() // recovery timer resets

	// Back below threshold
	mem.Set(200 * 1024 * 1024)
	g.check()

	// Only 30s more — not enough (timer was reset)
	fc.Advance(30 * time.Second)
	g.check()
	if g.State() != MemStateDegraded {
		t.Fatalf("state = %v, want degraded (timer was reset)", g.State())
	}

	// Need full 60s from last below-threshold check
	fc.Advance(30 * time.Second)
	g.check()
	if g.State() != MemStateNormal {
		t.Fatalf("state = %v after full 60s, want normal", g.State())
	}
}

func TestMemGuardRecoveryThresholdNotSoftLimit(t *testing.T) {
	g, mem, fc := newTestGuard(256, 384)

	// Enter degraded
	mem.Set(260 * 1024 * 1024)
	g.check()

	// Set to 85% of soft limit (256 * 0.85 = 217.6 MB)
	// This is above recovery threshold (204.8 MB) — should NOT start recovery
	mem.Set(218 * 1024 * 1024)
	g.check()
	fc.Advance(60 * time.Second)
	g.check()

	if g.State() != MemStateDegraded {
		t.Fatalf("state = %v at soft×0.85 after 60s, want still degraded", g.State())
	}
}

func TestMemGuardDirectJumpToEmergency(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	handler := &trackingHandler{}
	g.SetHandler(handler)

	// Jump directly from normal past both thresholds
	mem.Set(400 * 1024 * 1024)
	g.check()

	if g.State() != MemStateEmergency {
		t.Fatalf("state = %v, want emergency", g.State())
	}
	if handler.degradedCalls != 1 {
		t.Fatalf("OnDegraded called %d times, want 1 (transitional)", handler.degradedCalls)
	}
	if handler.emergencyCalls != 1 {
		t.Fatalf("OnEmergency called %d times, want 1", handler.emergencyCalls)
	}
}

func TestMemGuardWALFlushBeforeDrop(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	tracker := &orderTracker{}

	g.SetWALFlusher(func() { tracker.record("wal_flush") })
	g.SetBufferDropper(func() int { tracker.record("buffer_drop"); return 5 })

	// Enter degraded then emergency
	mem.Set(260 * 1024 * 1024)
	g.check()
	mem.Set(400 * 1024 * 1024)
	g.check()

	events := tracker.get()
	if len(events) < 2 {
		t.Fatalf("expected at least 2 events, got %d: %v", len(events), events)
	}

	flushIdx := -1
	dropIdx := -1
	for i, e := range events {
		if e == "wal_flush" && flushIdx == -1 {
			flushIdx = i
		}
		if e == "buffer_drop" && dropIdx == -1 {
			dropIdx = i
		}
	}

	if flushIdx == -1 {
		t.Fatal("wal_flush not called")
	}
	if dropIdx == -1 {
		t.Fatal("buffer_drop not called")
	}
	if flushIdx >= dropIdx {
		t.Fatalf("wal_flush (idx=%d) must happen before buffer_drop (idx=%d)", flushIdx, dropIdx)
	}
}

func TestMemGuardGCForcedOnDegraded(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	var gcCount atomic.Int64
	g.SetGCForcer(func() { gcCount.Add(1) })

	mem.Set(260 * 1024 * 1024)
	g.check()

	if gcCount.Load() != 1 {
		t.Fatalf("gc forced %d times, want 1", gcCount.Load())
	}
}

func TestMemGuardGCForcedOnEmergency(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	var gcCount atomic.Int64
	g.SetGCForcer(func() { gcCount.Add(1) })

	mem.Set(260 * 1024 * 1024)
	g.check() // degraded: 1 GC
	mem.Set(400 * 1024 * 1024)
	g.check() // emergency: 1 more GC

	if gcCount.Load() != 2 {
		t.Fatalf("gc forced %d times, want 2", gcCount.Load())
	}
}

func TestMemGuardMetricsCount(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	mem.Set(100 * 1024 * 1024)

	metrics := g.Metrics(map[string]string{"host": "test"})
	if len(metrics) != 5 {
		t.Fatalf("got %d metrics, want 5", len(metrics))
	}
}

func TestMemGuardGCForcedTotalIsCounter(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	g.SetGCForcer(func() {})

	mem.Set(260 * 1024 * 1024)
	g.check()

	metrics := g.Metrics(nil)
	for _, m := range metrics {
		if m.Name == "agent.memory.gc_forced_total" {
			if m.MetricType != "counter" {
				t.Fatalf("gc_forced_total type = %v, want counter", m.MetricType)
			}
			return
		}
	}
	t.Fatal("agent.memory.gc_forced_total not found in metrics")
}

func TestMemGuardDegradedDoesNotReFireOnSubsequentChecks(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	handler := &trackingHandler{}
	g.SetHandler(handler)

	mem.Set(260 * 1024 * 1024)
	g.check() // enter degraded
	g.check() // still degraded, should not re-fire
	g.check() // still degraded

	if handler.degradedCalls != 1 {
		t.Fatalf("OnDegraded called %d times, want 1 (fires only on entry)", handler.degradedCalls)
	}
}

func TestMemGuardStartsAboveSoftLimit(t *testing.T) {
	g, mem, _ := newTestGuard(256, 384)
	handler := &trackingHandler{}
	g.SetHandler(handler)

	// Agent starts with high heap (e.g., large WAL replay)
	mem.Set(300 * 1024 * 1024)
	g.check()

	if g.State() != MemStateDegraded {
		t.Fatalf("state = %v, want degraded on first check", g.State())
	}
}

func TestMemGuardConcurrentAccess(t *testing.T) {
	g, mem, fc := newTestGuard(256, 384)
	g.SetGCForcer(func() {})

	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())

	// Writer goroutine: simulate checks
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 100; i++ {
			mem.Set(uint64((100 + i*3) * 1024 * 1024))
			fc.Advance(5 * time.Second)
			g.check()
		}
	}()

	// Reader goroutines: read state concurrently
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				_ = g.State()
				_ = g.Metrics(nil)
			}
		}()
	}

	wg.Wait()
	cancel()
	_ = ctx
}
