package agent

import (
	"context"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// captureHandler captures slog records for testing
type captureHandler struct {
	mu      sync.Mutex
	records []slog.Record
}

func (h *captureHandler) Enabled(_ context.Context, _ slog.Level) bool {
	return true
}

func (h *captureHandler) Handle(_ context.Context, r slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.records = append(h.records, r)
	return nil
}

func (h *captureHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return h
}

func (h *captureHandler) WithGroup(name string) slog.Handler {
	return h
}

func (h *captureHandler) getRecords() []slog.Record {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]slog.Record{}, h.records...)
}

func (h *captureHandler) reset() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.records = nil
}

func TestClockGuardFirstBatchNoFloor(t *testing.T) {
	g := NewClockGuard()

	now := time.Now().UTC()
	points := []model.MetricPoint{
		{Name: "a", Timestamp: now.Add(-5 * time.Second)},
		{Name: "b", Timestamp: now},
		{Name: "c", Timestamp: now.Add(-10 * time.Second)},
	}

	g.FloorTimestamps(points)

	// First batch: no flooring, just initialize lastEmitted
	if g.BackwardJumps.Load() != 0 {
		t.Error("first batch should not count as backward jump")
	}

	// Timestamps should be unchanged
	for _, p := range points {
		if p.Timestamp.IsZero() {
			t.Errorf("point %q has zero timestamp", p.Name)
		}
	}
}

func TestClockGuardBackwardFloor(t *testing.T) {
	g := NewClockGuard()

	// Initialize with first batch
	base := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	first := []model.MetricPoint{
		{Name: "init", Timestamp: base},
	}
	g.FloorTimestamps(first)

	// Second batch with mixed timestamps, some before lastEmitted
	points := []model.MetricPoint{
		{Name: "future", Timestamp: base.Add(5 * time.Second)},
		{Name: "past1", Timestamp: base.Add(-3 * time.Second)},
		{Name: "past2", Timestamp: base.Add(-1 * time.Second)},
		{Name: "equal", Timestamp: base},
	}

	g.FloorTimestamps(points)

	if g.BackwardJumps.Load() != 1 {
		t.Errorf("backward_jumps = %d, want 1", g.BackwardJumps.Load())
	}

	// Verify all timestamps are >= lastEmitted (base) + 1ms
	floorTarget := base.Add(time.Millisecond)
	for _, p := range points {
		if p.Timestamp.Before(floorTarget) && p.Name != "future" {
			t.Errorf("point %q timestamp %v is before floor %v", p.Name, p.Timestamp, floorTarget)
		}
	}

	// "future" should be unchanged
	for _, p := range points {
		if p.Name == "future" && p.Timestamp != base.Add(5*time.Second) {
			t.Errorf("future point was modified: %v", p.Timestamp)
		}
	}
}

func TestClockGuardNormalTimestampsUnchanged(t *testing.T) {
	g := NewClockGuard()

	base := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	first := []model.MetricPoint{{Name: "init", Timestamp: base}}
	g.FloorTimestamps(first)

	// All points in the future — no flooring needed
	points := []model.MetricPoint{
		{Name: "a", Timestamp: base.Add(1 * time.Second)},
		{Name: "b", Timestamp: base.Add(2 * time.Second)},
		{Name: "c", Timestamp: base.Add(3 * time.Second)},
	}

	originalTimes := make([]time.Time, len(points))
	for i, p := range points {
		originalTimes[i] = p.Timestamp
	}

	g.FloorTimestamps(points)

	if g.BackwardJumps.Load() != 0 {
		t.Error("no backward jump should be detected")
	}

	// After sort, verify all original timestamps are present
	for _, p := range points {
		found := false
		for _, ot := range originalTimes {
			if p.Timestamp.Equal(ot) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("point %q timestamp %v not in original set", p.Name, p.Timestamp)
		}
	}
}

func TestClockGuardLastEmittedAdvances(t *testing.T) {
	g := NewClockGuard()

	base := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	first := []model.MetricPoint{{Name: "init", Timestamp: base}}
	g.FloorTimestamps(first)

	second := []model.MetricPoint{
		{Name: "a", Timestamp: base.Add(10 * time.Second)},
	}
	g.FloorTimestamps(second)

	// Now a point at base+5s should be floored (because lastEmitted is base+10s)
	third := []model.MetricPoint{
		{Name: "late", Timestamp: base.Add(5 * time.Second)},
	}
	g.FloorTimestamps(third)

	expected := base.Add(10*time.Second + time.Millisecond)
	if !third[0].Timestamp.Equal(expected) {
		t.Errorf("late point timestamp = %v, want %v", third[0].Timestamp, expected)
	}
}

func TestClockGuardMonotonicallyNonDecreasing(t *testing.T) {
	g := NewClockGuard()

	base := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	first := []model.MetricPoint{{Name: "init", Timestamp: base}}
	g.FloorTimestamps(first)

	// Mixed order batch with past timestamps
	points := []model.MetricPoint{
		{Name: "1", Timestamp: base.Add(3 * time.Second)},
		{Name: "2", Timestamp: base.Add(-2 * time.Second)},
		{Name: "3", Timestamp: base.Add(1 * time.Second)},
		{Name: "4", Timestamp: base.Add(-5 * time.Second)},
		{Name: "5", Timestamp: base.Add(7 * time.Second)},
	}

	g.FloorTimestamps(points)

	// After FloorTimestamps, verify no point is before lastEmitted+1ms
	floorTarget := base.Add(time.Millisecond)
	for _, p := range points {
		if p.Timestamp.Before(floorTarget) {
			t.Errorf("point %q at %v is before floor %v", p.Name, p.Timestamp, floorTarget)
		}
	}
}

func TestClockGuardEmptyBatch(t *testing.T) {
	g := NewClockGuard()
	g.FloorTimestamps(nil)
	g.FloorTimestamps([]model.MetricPoint{})
	// No panic
}

func TestClockGuardSetAndGetSkew(t *testing.T) {
	g := NewClockGuard()

	if g.ClockSkew() != 0.0 {
		t.Errorf("initial skew = %f, want 0", g.ClockSkew())
	}

	g.SetClockSkew(-2.5)
	if g.ClockSkew() != -2.5 {
		t.Errorf("skew = %f, want -2.5", g.ClockSkew())
	}

	g.SetClockSkew(300.7)
	if g.ClockSkew() != 300.7 {
		t.Errorf("skew = %f, want 300.7", g.ClockSkew())
	}
}

func TestCheckStrictSkewPass(t *testing.T) {
	g := NewClockGuard()

	// Skew below threshold, strict enabled — should pass
	g.SetClockSkew(250.0)
	if err := g.CheckStrictSkew(true); err != nil {
		t.Errorf("expected no error for skew=250, got %v", err)
	}

	// Skew at threshold, strict enabled — should pass
	g.SetClockSkew(300.0)
	if err := g.CheckStrictSkew(true); err != nil {
		t.Errorf("expected no error for skew=300, got %v", err)
	}

	// Small skew, strict enabled — should pass
	g.SetClockSkew(60.0)
	if err := g.CheckStrictSkew(true); err != nil {
		t.Errorf("expected no error for skew=60, got %v", err)
	}
}

func TestCheckStrictSkewFailPositive(t *testing.T) {
	g := NewClockGuard()

	// Skew above threshold, strict enabled — should fail
	g.SetClockSkew(350.0)
	err := g.CheckStrictSkew(true)
	if err == nil {
		t.Error("expected error for skew=350, got nil")
	}
	if err != nil && err.Error() != "clock skew too large: 350.0s (threshold: 300s)" {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestCheckStrictSkewFailNegative(t *testing.T) {
	g := NewClockGuard()

	// Negative skew above threshold, strict enabled — should fail
	g.SetClockSkew(-350.0)
	err := g.CheckStrictSkew(true)
	if err == nil {
		t.Error("expected error for skew=-350, got nil")
	}
	if err != nil && err.Error() != "clock skew too large: -350.0s (threshold: 300s)" {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestCheckStrictSkewDisabled(t *testing.T) {
	g := NewClockGuard()

	// Large skew, strict disabled — should pass
	g.SetClockSkew(500.0)
	if err := g.CheckStrictSkew(false); err != nil {
		t.Errorf("expected no error when strict=false, got %v", err)
	}

	// Negative large skew, strict disabled — should pass
	g.SetClockSkew(-500.0)
	if err := g.CheckStrictSkew(false); err != nil {
		t.Errorf("expected no error when strict=false, got %v", err)
	}
}

func TestSetClockSkewLogsWarning(t *testing.T) {
	// Install capture handler
	handler := &captureHandler{}
	oldLogger := slog.Default()
	defer slog.SetDefault(oldLogger)
	slog.SetDefault(slog.New(handler))

	g := NewClockGuard()

	// Test 1: Skew > 60s (positive) should log warning
	handler.reset()
	g.SetClockSkew(61.0)
	records := handler.getRecords()
	if len(records) != 1 {
		t.Fatalf("expected 1 warning for skew=61, got %d", len(records))
	}
	r := records[0]
	if r.Level != slog.LevelWarn {
		t.Errorf("expected WARN level, got %s", r.Level)
	}
	if r.Message != "clock_skew_detected" {
		t.Errorf("expected message 'clock_skew_detected', got %q", r.Message)
	}
	// Verify structured fields
	var skewSeconds float64
	var threshold int64
	var recommendation string
	r.Attrs(func(a slog.Attr) bool {
		switch a.Key {
		case "skew_seconds":
			skewSeconds = a.Value.Any().(float64)
		case "threshold":
			threshold = a.Value.Int64()
		case "recommendation":
			recommendation = a.Value.String()
		}
		return true
	})
	if skewSeconds != 61.0 {
		t.Errorf("expected skew_seconds=61.0, got %f", skewSeconds)
	}
	if threshold != 60 {
		t.Errorf("expected threshold=60, got %d", threshold)
	}
	if recommendation != "synchronize system clock with NTP" {
		t.Errorf("expected NTP recommendation, got %q", recommendation)
	}

	// Test 2: Skew > 60s (negative) should log warning
	handler.reset()
	g.SetClockSkew(-65.0)
	records = handler.getRecords()
	if len(records) != 1 {
		t.Fatalf("expected 1 warning for skew=-65, got %d", len(records))
	}
	r = records[0]
	if r.Level != slog.LevelWarn {
		t.Errorf("expected WARN level for negative skew, got %s", r.Level)
	}
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == "skew_seconds" {
			skewSeconds = a.Value.Any().(float64)
		}
		return true
	})
	if skewSeconds != -65.0 {
		t.Errorf("expected skew_seconds=-65.0, got %f", skewSeconds)
	}
}

func TestSetClockSkewNoWarning(t *testing.T) {
	// Install capture handler
	handler := &captureHandler{}
	oldLogger := slog.Default()
	defer slog.SetDefault(oldLogger)
	slog.SetDefault(slog.New(handler))

	g := NewClockGuard()

	// Test 1: Skew exactly at 60s should NOT log warning
	handler.reset()
	g.SetClockSkew(60.0)
	records := handler.getRecords()
	if len(records) != 0 {
		t.Errorf("expected 0 warnings for skew=60, got %d", len(records))
	}

	// Test 2: Skew below 60s should NOT log warning
	handler.reset()
	g.SetClockSkew(59.9)
	records = handler.getRecords()
	if len(records) != 0 {
		t.Errorf("expected 0 warnings for skew=59.9, got %d", len(records))
	}

	// Test 3: Negative skew at threshold should NOT log warning
	handler.reset()
	g.SetClockSkew(-60.0)
	records = handler.getRecords()
	if len(records) != 0 {
		t.Errorf("expected 0 warnings for skew=-60, got %d", len(records))
	}

	// Test 4: Small positive skew should NOT log warning
	handler.reset()
	g.SetClockSkew(30.0)
	records = handler.getRecords()
	if len(records) != 0 {
		t.Errorf("expected 0 warnings for skew=30, got %d", len(records))
	}

	// Test 5: Zero skew should NOT log warning
	handler.reset()
	g.SetClockSkew(0.0)
	records = handler.getRecords()
	if len(records) != 0 {
		t.Errorf("expected 0 warnings for skew=0, got %d", len(records))
	}
}
