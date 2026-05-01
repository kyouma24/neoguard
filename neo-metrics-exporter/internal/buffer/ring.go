package buffer

import (
	"sync"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type Ring struct {
	mu       sync.Mutex
	batches  [][]model.MetricPoint
	maxItems int
	count    int
	dropped  int64
}

func NewRing(maxItems int) *Ring {
	return &Ring{
		maxItems: maxItems,
		batches:  make([][]model.MetricPoint, 0, 64),
	}
}

func (r *Ring) Push(points []model.MetricPoint) {
	if len(points) == 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for r.count+len(points) > r.maxItems && len(r.batches) > 0 {
		dropped := len(r.batches[0])
		r.count -= dropped
		r.dropped += int64(dropped)
		r.batches = r.batches[1:]
	}

	r.batches = append(r.batches, points)
	r.count += len(points)
}

func (r *Ring) Drain(max int) []model.MetricPoint {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.batches) == 0 {
		return nil
	}

	var result []model.MetricPoint
	collected := 0

	for len(r.batches) > 0 && collected < max {
		batch := r.batches[0]
		remaining := max - collected
		if len(batch) <= remaining {
			result = append(result, batch...)
			collected += len(batch)
			r.count -= len(batch)
			r.batches = r.batches[1:]
		} else {
			result = append(result, batch[:remaining]...)
			r.batches[0] = batch[remaining:]
			r.count -= remaining
			collected += remaining
		}
	}

	return result
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
	Items   int
	Batches int
	Dropped int64
}

func (r *Ring) Stats() Stats {
	r.mu.Lock()
	defer r.mu.Unlock()
	return Stats{
		Items:   r.count,
		Batches: len(r.batches),
		Dropped: r.dropped,
	}
}
