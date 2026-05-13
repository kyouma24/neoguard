package collector

import (
	"sync"
	"time"
)

const defaultStaleTTL = 5 * time.Minute
const evictCheckInterval = 60 // run eviction every N calls to Compute

type rateSample struct {
	value    float64
	ts       time.Time
	lastSeen time.Time
}

type RateComputer struct {
	mu        sync.Mutex
	samples   map[string]rateSample
	staleTTL  time.Duration
	callCount int
}

func NewRateComputer() *RateComputer {
	return &RateComputer{
		samples:  make(map[string]rateSample),
		staleTTL: defaultStaleTTL,
	}
}

func (r *RateComputer) Compute(key string, currentValue float64) (float64, bool) {
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()

	r.callCount++
	if r.callCount%evictCheckInterval == 0 {
		r.evictLocked(now)
	}

	prev, exists := r.samples[key]
	r.samples[key] = rateSample{value: currentValue, ts: now, lastSeen: now}

	if !exists {
		return 0, false
	}

	elapsed := now.Sub(prev.ts).Seconds()
	if elapsed <= 0 {
		return 0, false
	}

	delta := currentValue - prev.value
	if delta < 0 {
		return 0, false
	}

	return delta / elapsed, true
}

func (r *RateComputer) evictLocked(now time.Time) {
	for key, sample := range r.samples {
		if now.Sub(sample.lastSeen) > r.staleTTL {
			delete(r.samples, key)
		}
	}
}

func (r *RateComputer) Len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.samples)
}

func (r *RateComputer) Reset() {
	r.mu.Lock()
	r.samples = make(map[string]rateSample)
	r.callCount = 0
	r.mu.Unlock()
}
