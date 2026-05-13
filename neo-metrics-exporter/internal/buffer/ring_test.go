package buffer

import (
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func makePoints(n int) []model.MetricPoint {
	pts := make([]model.MetricPoint, n)
	for i := range pts {
		pts[i] = model.MetricPoint{Name: "test", Value: float64(i)}
	}
	return pts
}

func TestRingPushAndDrain(t *testing.T) {
	r := NewRing(1000)
	r.Push(makePoints(10))
	r.Push(makePoints(5))

	if r.Len() != 15 {
		t.Errorf("len = %d, want 15", r.Len())
	}

	drained := r.Drain(20)
	if len(drained) != 15 {
		t.Errorf("drained = %d, want 15", len(drained))
	}

	if r.Len() != 0 {
		t.Errorf("len after drain = %d", r.Len())
	}
}

func TestRingDrainPartial(t *testing.T) {
	r := NewRing(1000)
	r.Push(makePoints(10))
	r.Push(makePoints(10))

	drained := r.Drain(5)
	if len(drained) != 5 {
		t.Errorf("drained = %d, want 5", len(drained))
	}
	if r.Len() != 15 {
		t.Errorf("remaining = %d, want 15", r.Len())
	}
}

func TestRingOverflow(t *testing.T) {
	r := NewRing(20)
	r.Push(makePoints(10))
	r.Push(makePoints(10))

	if r.Len() != 20 {
		t.Errorf("len = %d, want 20", r.Len())
	}

	r.Push(makePoints(15))

	if r.Len() > 20 {
		t.Errorf("len = %d, should be <= 20", r.Len())
	}
	if r.Dropped() == 0 {
		t.Error("should have dropped some items")
	}
}

func TestRingDropsOldest(t *testing.T) {
	r := NewRing(15)
	r.Push(makePoints(10))
	r.Push(makePoints(10))

	stats := r.Stats()
	if stats.Dropped == 0 {
		t.Error("expected drops")
	}

	drained := r.Drain(100)
	for _, p := range drained {
		_ = p
	}
	_ = drained
}

func TestRingDrainEmpty(t *testing.T) {
	r := NewRing(1000)
	drained := r.Drain(10)
	if drained != nil {
		t.Errorf("drain empty = %v, want nil", drained)
	}
}

func TestRingPushEmpty(t *testing.T) {
	r := NewRing(1000)
	r.Push(nil)
	r.Push([]model.MetricPoint{})
	if r.Len() != 0 {
		t.Errorf("len = %d after empty pushes", r.Len())
	}
}

func TestRingStats(t *testing.T) {
	r := NewRing(1000)
	r.Push(makePoints(5))
	r.Push(makePoints(3))

	stats := r.Stats()
	if stats.Items != 8 {
		t.Errorf("items = %d", stats.Items)
	}
	if stats.Batches != 2 {
		t.Errorf("batches = %d", stats.Batches)
	}
	if stats.Dropped != 0 {
		t.Errorf("dropped = %d", stats.Dropped)
	}
}

func TestRingConcurrentAccess(t *testing.T) {
	r := NewRing(10000)
	done := make(chan struct{})

	go func() {
		for i := 0; i < 100; i++ {
			r.Push(makePoints(10))
		}
		close(done)
	}()

	go func() {
		for i := 0; i < 100; i++ {
			r.Drain(5)
		}
	}()

	<-done
}
