package buffer

import (
	"sync"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type taggedBatch struct {
	points     []model.MetricPoint
	retryCount int
}

type Ring struct {
	mu          sync.Mutex
	batches     []taggedBatch
	maxItems    int
	count       int
	dropped     int64
	replayCount int
}

func NewRing(maxItems int) *Ring {
	return &Ring{
		maxItems: maxItems,
		batches:  make([]taggedBatch, 0, 64),
	}
}

func (r *Ring) Push(points []model.MetricPoint) {
	if len(points) == 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for r.count+len(points) > r.maxItems && len(r.batches) > 0 {
		dropped := len(r.batches[0].points)
		r.count -= dropped
		r.dropped += int64(dropped)
		r.batches = r.batches[1:]
	}

	r.batches = append(r.batches, taggedBatch{points: points, retryCount: 0})
	r.count += len(points)
}

func (r *Ring) PushFront(points []model.MetricPoint, retryCount int) {
	if len(points) == 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for r.count+len(points) > r.maxItems && len(r.batches) > 0 {
		last := len(r.batches) - 1
		dropped := len(r.batches[last].points)
		r.count -= dropped
		r.dropped += int64(dropped)
		r.batches = r.batches[:last]
	}

	r.batches = append([]taggedBatch{{points: points, retryCount: retryCount}}, r.batches...)
	r.count += len(points)
	r.replayCount++
}

type DrainResult struct {
	Points     []model.MetricPoint
	RetryCount int
}

func (r *Ring) DrainWithMeta(max int) DrainResult {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.batches) == 0 {
		return DrainResult{}
	}

	// If front batch is a retry batch, drain only that batch (preserve retry metadata)
	if r.batches[0].retryCount > 0 {
		batch := r.batches[0]
		if len(batch.points) <= max {
			r.count -= len(batch.points)
			r.batches = r.batches[1:]
			return DrainResult{Points: batch.points, RetryCount: batch.retryCount}
		}
		result := batch.points[:max]
		r.batches[0] = taggedBatch{points: batch.points[max:], retryCount: batch.retryCount}
		r.count -= max
		return DrainResult{Points: result, RetryCount: batch.retryCount}
	}

	// Normal drain: collect from consecutive non-retry batches
	var result []model.MetricPoint
	collected := 0

	for len(r.batches) > 0 && collected < max {
		batch := r.batches[0]
		if batch.retryCount > 0 {
			break // Stop before a retry batch
		}
		remaining := max - collected
		if len(batch.points) <= remaining {
			result = append(result, batch.points...)
			collected += len(batch.points)
			r.count -= len(batch.points)
			r.batches = r.batches[1:]
		} else {
			result = append(result, batch.points[:remaining]...)
			r.batches[0] = taggedBatch{points: batch.points[remaining:], retryCount: 0}
			r.count -= remaining
			collected += remaining
		}
	}

	return DrainResult{Points: result, RetryCount: 0}
}

func (r *Ring) Drain(max int) []model.MetricPoint {
	result := r.DrainWithMeta(max)
	return result.Points
}

func (r *Ring) SetReplayCount(n int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.replayCount = n
}

func (r *Ring) ReplayCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.replayCount
}

func (r *Ring) DrainLive(max int) DrainResult {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.batches) == 0 {
		return DrainResult{}
	}

	// Retry batches at front get highest priority
	if r.batches[0].retryCount > 0 {
		batch := r.batches[0]
		if len(batch.points) <= max {
			r.count -= len(batch.points)
			r.batches = r.batches[1:]
			r.replayCount--
			if r.replayCount < 0 {
				r.replayCount = 0
			}
			return DrainResult{Points: batch.points, RetryCount: batch.retryCount}
		}
		result := batch.points[:max]
		r.batches[0] = taggedBatch{points: batch.points[max:], retryCount: batch.retryCount}
		r.count -= max
		return DrainResult{Points: result, RetryCount: batch.retryCount}
	}

	// Skip replay region (first replayCount batches), drain from live region
	startIdx := r.replayCount
	if startIdx >= len(r.batches) {
		return DrainResult{}
	}

	var result []model.MetricPoint
	collected := 0
	i := startIdx

	for i < len(r.batches) && collected < max {
		batch := r.batches[i]
		remaining := max - collected
		if len(batch.points) <= remaining {
			result = append(result, batch.points...)
			collected += len(batch.points)
			r.count -= len(batch.points)
			r.batches = append(r.batches[:i], r.batches[i+1:]...)
		} else {
			result = append(result, batch.points[:remaining]...)
			r.batches[i] = taggedBatch{points: batch.points[remaining:], retryCount: 0}
			r.count -= remaining
			collected += remaining
		}
	}

	return DrainResult{Points: result, RetryCount: 0}
}

func (r *Ring) DrainReplay(max int) DrainResult {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.replayCount <= 0 || len(r.batches) == 0 {
		return DrainResult{}
	}

	// Drain from the replay region (oldest batches, indices 0..replayCount-1)
	var result []model.MetricPoint
	collected := 0

	for r.replayCount > 0 && len(r.batches) > 0 && collected < max {
		batch := r.batches[0]
		remaining := max - collected
		if len(batch.points) <= remaining {
			result = append(result, batch.points...)
			collected += len(batch.points)
			r.count -= len(batch.points)
			r.batches = r.batches[1:]
			r.replayCount--
		} else {
			result = append(result, batch.points[:remaining]...)
			r.batches[0] = taggedBatch{points: batch.points[remaining:], retryCount: batch.retryCount}
			r.count -= remaining
			collected += remaining
		}
	}

	return DrainResult{Points: result, RetryCount: 0}
}

func (r *Ring) Len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.count
}

func (r *Ring) Dropped() int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.dropped
}

type Stats struct {
	Items       int
	Batches     int
	Dropped     int64
	ReplayCount int
}

func (r *Ring) Stats() Stats {
	r.mu.Lock()
	defer r.mu.Unlock()
	return Stats{
		Items:       r.count,
		Batches:     len(r.batches),
		Dropped:     r.dropped,
		ReplayCount: r.replayCount,
	}
}

func (r *Ring) PeekBatches() [][]model.MetricPoint {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([][]model.MetricPoint, len(r.batches))
	for i, b := range r.batches {
		out[i] = b.points
	}
	return out
}

func (r *Ring) DropOldest() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.batches) == 0 {
		return 0
	}
	dropped := len(r.batches[0].points)
	r.count -= dropped
	r.dropped += int64(dropped)
	r.batches = r.batches[1:]
	return dropped
}

func (r *Ring) DropHalf() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.batches) == 0 {
		return 0
	}
	toDrop := len(r.batches) / 2
	if toDrop == 0 {
		toDrop = 1
	}
	var dropped int
	for i := 0; i < toDrop; i++ {
		dropped += len(r.batches[0].points)
		r.count -= len(r.batches[0].points)
		r.dropped += int64(len(r.batches[0].points))
		r.batches = r.batches[1:]
	}
	r.replayCount -= toDrop
	if r.replayCount < 0 {
		r.replayCount = 0
	}
	return dropped
}
