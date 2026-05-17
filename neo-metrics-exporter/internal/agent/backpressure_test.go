package agent

import (
	"sync"
	"testing"
	"time"
)

func TestBackpressureDisabledAlwaysAllows(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       false,
		WindowSeconds: 60,
		MinSendRate:   100,
		MaxReplayBPS:  5000,
	}, fc.Now)

	for i := 0; i < 100; i++ {
		if !bc.TryAcquire(10000) {
			t.Fatal("disabled backpressure should always allow")
		}
	}
}

func TestBackpressureDisabledNoSignals(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       false,
		WindowSeconds: 60,
		MinSendRate:   100,
		MaxReplayBPS:  5000,
	}, fc.Now)

	bc.RecordSignal(false, 100)
	bc.RecordSignal(false, 100)

	if bc.CurrentRate() != 5000 {
		t.Errorf("rate = %d, want 5000 (disabled should not reduce)", bc.CurrentRate())
	}
}

func TestBackpressureRateDecreasesOnFailure(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       true,
		WindowSeconds: 60,
		MinSendRate:   100,
		MaxReplayBPS:  5000,
	}, fc.Now)

	for i := 0; i < 10; i++ {
		bc.RecordSignal(false, 100)
	}

	rate := bc.CurrentRate()
	if rate >= 5000 {
		t.Errorf("rate should decrease on failures, got %d", rate)
	}
	if rate < 100 {
		t.Errorf("rate should not go below min_send_rate, got %d", rate)
	}
}

func TestBackpressureRateRecovery(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       true,
		WindowSeconds: 60,
		MinSendRate:   100,
		MaxReplayBPS:  5000,
	}, fc.Now)

	for i := 0; i < 10; i++ {
		bc.RecordSignal(false, 100)
	}

	lowRate := bc.CurrentRate()

	for i := 0; i < 100; i++ {
		bc.RecordSignal(true, 100)
	}

	highRate := bc.CurrentRate()
	if highRate <= lowRate {
		t.Errorf("rate should recover after successes: low=%d, high=%d", lowRate, highRate)
	}
}

func TestBackpressureRateFloorsAtMin(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       true,
		WindowSeconds: 60,
		MinSendRate:   200,
		MaxReplayBPS:  5000,
	}, fc.Now)

	for i := 0; i < 100; i++ {
		bc.RecordSignal(false, 100)
	}

	rate := bc.CurrentRate()
	if rate < 200 {
		t.Errorf("rate = %d, should not go below min 200", rate)
	}
}

func TestBackpressureWindowPrune(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       true,
		WindowSeconds: 60,
		MinSendRate:   100,
		MaxReplayBPS:  5000,
	}, fc.Now)

	for i := 0; i < 20; i++ {
		bc.RecordSignal(false, 100)
	}

	lowRate := bc.CurrentRate()

	fc.Advance(61 * time.Second)

	for i := 0; i < 20; i++ {
		bc.RecordSignal(true, 100)
	}

	rate := bc.CurrentRate()
	if rate <= lowRate {
		t.Errorf("after window expires and success signals, rate should recover: low=%d, current=%d", lowRate, rate)
	}
}

func TestTokenBucketConsume(t *testing.T) {
	fc := newFakeClock(time.Now())
	tb := NewTokenBucket(100, fc.Now)

	if !tb.TryConsume(100) {
		t.Error("should consume up to capacity (200)")
	}
	if !tb.TryConsume(100) {
		t.Error("should consume full capacity (200 total)")
	}
	if tb.TryConsume(1) {
		t.Error("should be empty after consuming capacity")
	}
}

func TestTokenBucketRefill(t *testing.T) {
	fc := newFakeClock(time.Now())
	tb := NewTokenBucket(100, fc.Now)

	tb.TryConsume(200)

	fc.Advance(1 * time.Second)

	if !tb.TryConsume(100) {
		t.Error("should have refilled 100 tokens after 1 second")
	}
}

func TestTokenBucketCapacityTracksRate(t *testing.T) {
	fc := newFakeClock(time.Now())
	tb := NewTokenBucket(1000, fc.Now)

	if tb.capacity != 2000 {
		t.Errorf("capacity = %f, want 2000", tb.capacity)
	}

	tb.SetRate(500)
	if tb.capacity != 1000 {
		t.Errorf("after SetRate(500), capacity = %f, want 1000", tb.capacity)
	}
}

func TestBackpressureMetrics(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       true,
		WindowSeconds: 60,
		MinSendRate:   100,
		MaxReplayBPS:  5000,
	}, fc.Now)

	bc.RecordSignal(true, 50)
	bc.RecordSignal(false, 30)

	metrics := bc.Metrics(map[string]string{"host": "test"})
	if len(metrics) != 3 {
		t.Fatalf("expected 3 metrics, got %d", len(metrics))
	}

	names := map[string]bool{}
	for _, m := range metrics {
		names[m.Name] = true
	}
	expected := []string{
		"agent.backpressure.current_rate_bps",
		"agent.backpressure.signals_success_total",
		"agent.backpressure.signals_fail_total",
	}
	for _, name := range expected {
		if !names[name] {
			t.Errorf("missing metric: %s", name)
		}
	}
}

func TestBackpressureConcurrent(t *testing.T) {
	fc := newFakeClock(time.Now())
	bc := NewBackpressureController(BackpressureConfig{
		Enabled:       true,
		WindowSeconds: 60,
		MinSendRate:   100,
		MaxReplayBPS:  5000,
	}, fc.Now)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				bc.RecordSignal(j%3 != 0, 50)
				bc.TryAcquire(10)
				bc.CurrentRate()
			}
		}()
	}
	wg.Wait()
}
