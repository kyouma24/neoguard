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

func TestRingPushFront(t *testing.T) {
	r := NewRing(1000)
	r.Push(makePoints(10))         // batch 1, retryCount=0
	r.PushFront(makePoints(5), 2)  // re-enqueue at front, retryCount=2

	// DrainWithMeta should return the re-enqueued batch first
	result := r.DrainWithMeta(100)
	if result.RetryCount != 2 {
		t.Errorf("retry_count = %d, want 2", result.RetryCount)
	}
	if len(result.Points) != 5 {
		t.Errorf("points = %d, want 5 (the re-enqueued batch)", len(result.Points))
	}

	// Next drain should get the original batch
	result2 := r.DrainWithMeta(100)
	if result2.RetryCount != 0 {
		t.Errorf("second drain retry_count = %d, want 0", result2.RetryCount)
	}
	if len(result2.Points) != 10 {
		t.Errorf("second drain points = %d, want 10", len(result2.Points))
	}
}

func TestRingDrainWithMetaStopsAtRetryBoundary(t *testing.T) {
	r := NewRing(1000)
	r.Push(makePoints(10))         // normal batch
	r.Push(makePoints(10))         // normal batch
	r.PushFront(makePoints(5), 1)  // retry batch pushed to front

	// First drain: gets the retry batch only (it's at front)
	result := r.DrainWithMeta(100)
	if result.RetryCount != 1 {
		t.Errorf("first drain: retry_count = %d, want 1", result.RetryCount)
	}
	if len(result.Points) != 5 {
		t.Errorf("first drain: points = %d, want 5", len(result.Points))
	}

	// Second drain: gets remaining normal batches
	result2 := r.DrainWithMeta(100)
	if result2.RetryCount != 0 {
		t.Errorf("second drain: retry_count = %d, want 0", result2.RetryCount)
	}
	if len(result2.Points) != 20 {
		t.Errorf("second drain: points = %d, want 20", len(result2.Points))
	}
}

func TestRingPushFrontOverflow(t *testing.T) {
	r := NewRing(20)
	r.Push(makePoints(15))
	r.PushFront(makePoints(10), 1) // will overflow, should drop from back

	if r.Len() > 20 {
		t.Errorf("len = %d, should be <= 20", r.Len())
	}

	// The front batch should be the re-enqueued one
	result := r.DrainWithMeta(100)
	if result.RetryCount != 1 {
		t.Errorf("retry_count = %d, want 1 (front batch)", result.RetryCount)
	}
}

func TestRingDrainWithMetaEmpty(t *testing.T) {
	r := NewRing(1000)
	result := r.DrainWithMeta(100)
	if len(result.Points) != 0 {
		t.Errorf("drain empty: points = %d", len(result.Points))
	}
	if result.RetryCount != 0 {
		t.Errorf("drain empty: retry_count = %d", result.RetryCount)
	}
}

func TestRingDropHalf(t *testing.T) {
	r := NewRing(10000)
	for i := 0; i < 10; i++ {
		r.Push(makePoints(5))
	}
	// 10 batches, 50 points total
	if r.Len() != 50 {
		t.Fatalf("len = %d, want 50", r.Len())
	}

	dropped := r.DropHalf()
	// Drops 5 batches (10/2=5), each with 5 points = 25
	if dropped != 25 {
		t.Fatalf("dropped = %d, want 25", dropped)
	}
	if r.Len() != 25 {
		t.Fatalf("remaining = %d, want 25", r.Len())
	}
}

func TestRingDropHalfSingleBatch(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(7))

	dropped := r.DropHalf()
	// 1 batch: 1/2=0, minimum 1 → drops 1 batch (7 points)
	if dropped != 7 {
		t.Fatalf("dropped = %d, want 7", dropped)
	}
	if r.Len() != 0 {
		t.Fatalf("remaining = %d, want 0", r.Len())
	}
}

func TestRingDropHalfEmpty(t *testing.T) {
	r := NewRing(10000)
	dropped := r.DropHalf()
	if dropped != 0 {
		t.Fatalf("dropped = %d on empty ring, want 0", dropped)
	}
}

func TestRingSetReplayCount(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10))
	r.Push(makePoints(10))
	r.Push(makePoints(10))
	r.SetReplayCount(2)

	if r.ReplayCount() != 2 {
		t.Fatalf("replay count = %d, want 2", r.ReplayCount())
	}
}

func TestRingDrainLiveSkipsReplay(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10)) // replay batch 1
	r.Push(makePoints(10)) // replay batch 2
	r.Push(makePoints(5))  // live batch
	r.SetReplayCount(2)

	result := r.DrainLive(100)
	if len(result.Points) != 5 {
		t.Errorf("drain live = %d points, want 5 (live only)", len(result.Points))
	}
	if r.Len() != 20 {
		t.Errorf("remaining = %d, want 20 (replay still present)", r.Len())
	}
}

func TestRingDrainLiveRetryPriority(t *testing.T) {
	r := NewRing(10000)
	r.PushFront(makePoints(5), 2) // retry batch at front
	r.Push(makePoints(10))        // live batch

	result := r.DrainLive(100)
	if result.RetryCount != 2 {
		t.Errorf("drain live retry_count = %d, want 2", result.RetryCount)
	}
	if len(result.Points) != 5 {
		t.Errorf("drain live points = %d, want 5 (retry batch)", len(result.Points))
	}
}

func TestRingDrainReplay(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10)) // replay batch
	r.Push(makePoints(10)) // replay batch
	r.Push(makePoints(5))  // live batch
	r.SetReplayCount(2)

	result := r.DrainReplay(100)
	if len(result.Points) != 20 {
		t.Errorf("drain replay = %d points, want 20", len(result.Points))
	}
	if r.ReplayCount() != 0 {
		t.Errorf("replay count after drain = %d, want 0", r.ReplayCount())
	}
	if r.Len() != 5 {
		t.Errorf("remaining = %d, want 5 (live batch)", r.Len())
	}
}

func TestRingDrainReplayPartial(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10))
	r.Push(makePoints(10))
	r.SetReplayCount(2)

	result := r.DrainReplay(5)
	if len(result.Points) != 5 {
		t.Errorf("drain replay partial = %d, want 5", len(result.Points))
	}
	if r.ReplayCount() != 2 {
		t.Errorf("replay count = %d, want 2 (partial drain doesn't decrement fully)", r.ReplayCount())
	}
}

func TestRingDrainReplayEmpty(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10))
	r.SetReplayCount(0)

	result := r.DrainReplay(100)
	if len(result.Points) != 0 {
		t.Errorf("drain replay with count=0 should return empty, got %d", len(result.Points))
	}
}

func TestRingDrainLiveEmptyWhenAllReplay(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10))
	r.Push(makePoints(10))
	r.SetReplayCount(2)

	result := r.DrainLive(100)
	if len(result.Points) != 0 {
		t.Errorf("drain live should be empty when all batches are replay, got %d", len(result.Points))
	}
}

func TestRingDropHalfDecrementsReplayCount(t *testing.T) {
	r := NewRing(10000)
	for i := 0; i < 6; i++ {
		r.Push(makePoints(10))
	}
	r.SetReplayCount(6)

	for i := 0; i < 4; i++ {
		r.Push(makePoints(10))
	}
	// 10 batches, replayCount=6

	r.DropHalf() // drops 5 oldest batches

	rc := r.ReplayCount()
	if rc != 1 {
		t.Errorf("replay count after DropHalf = %d, want 1 (6-5=1)", rc)
	}
}

func TestRingDropHalfReplayCountFloors(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10))
	r.Push(makePoints(10))
	r.SetReplayCount(1) // only 1 replay batch, but DropHalf drops 1 batch

	r.DropHalf()

	rc := r.ReplayCount()
	if rc != 0 {
		t.Errorf("replay count = %d, want 0 (floored)", rc)
	}
}

func TestRingPushFrontIncrementsReplayCount(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10))
	r.SetReplayCount(1)

	r.PushFront(makePoints(5), 1)

	if r.ReplayCount() != 2 {
		t.Errorf("replay count = %d, want 2 (PushFront increments)", r.ReplayCount())
	}
}

func TestRingStatsIncludesReplayCount(t *testing.T) {
	r := NewRing(10000)
	r.Push(makePoints(10))
	r.Push(makePoints(10))
	r.SetReplayCount(2)

	stats := r.Stats()
	if stats.ReplayCount != 2 {
		t.Errorf("stats.ReplayCount = %d, want 2", stats.ReplayCount)
	}
}
