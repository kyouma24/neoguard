package agent

import (
	"log/slog"
	"sync"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type BackpressureSignal struct {
	Timestamp time.Time
	Success   bool
	Points    int
}

type TokenBucket struct {
	tokens   float64
	capacity float64
	rate     float64
	lastFill time.Time
	clock    func() time.Time
}

func NewTokenBucket(rate float64, clock func() time.Time) *TokenBucket {
	cap := rate * 2
	return &TokenBucket{
		tokens:   cap,
		capacity: cap,
		rate:     rate,
		lastFill: clock(),
		clock:    clock,
	}
}

func (tb *TokenBucket) SetRate(rate float64) {
	tb.refill()
	tb.rate = rate
	tb.capacity = rate * 2
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}
}

func (tb *TokenBucket) TryConsume(n int) bool {
	tb.refill()
	needed := float64(n)
	if tb.tokens >= needed {
		tb.tokens -= needed
		return true
	}
	return false
}

func (tb *TokenBucket) refill() {
	now := tb.clock()
	elapsed := now.Sub(tb.lastFill).Seconds()
	if elapsed <= 0 {
		return
	}
	tb.lastFill = now
	tb.tokens += elapsed * tb.rate
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}
}

type BackpressureController struct {
	mu           sync.Mutex
	enabled      bool
	window       time.Duration
	minRate      int
	maxRate      int
	signals      []BackpressureSignal
	currentRate  int
	bucket       *TokenBucket
	clock        func() time.Time
	successTotal int64
	failTotal    int64
}

type BackpressureConfig struct {
	Enabled       bool
	WindowSeconds int
	MinSendRate   int
	MaxReplayBPS  int
}

func NewBackpressureController(cfg BackpressureConfig, clock func() time.Time) *BackpressureController {
	rate := cfg.MaxReplayBPS
	if rate <= 0 {
		rate = 5000
	}
	bc := &BackpressureController{
		enabled:     cfg.Enabled,
		window:      time.Duration(cfg.WindowSeconds) * time.Second,
		minRate:     cfg.MinSendRate,
		maxRate:     cfg.MaxReplayBPS,
		currentRate: rate,
		clock:       clock,
		bucket:      NewTokenBucket(float64(rate), clock),
	}
	return bc
}

func (bc *BackpressureController) RecordSignal(success bool, points int) {
	if !bc.enabled {
		return
	}

	bc.mu.Lock()
	defer bc.mu.Unlock()

	now := bc.clock()
	bc.signals = append(bc.signals, BackpressureSignal{
		Timestamp: now,
		Success:   success,
		Points:    points,
	})

	if success {
		bc.successTotal++
	} else {
		bc.failTotal++
	}

	bc.pruneSignals(now)
	bc.recalculateRate()
}

func (bc *BackpressureController) pruneSignals(now time.Time) {
	cutoff := now.Add(-bc.window)
	idx := 0
	for idx < len(bc.signals) && bc.signals[idx].Timestamp.Before(cutoff) {
		idx++
	}
	if idx > 0 {
		bc.signals = bc.signals[idx:]
	}
}

func (bc *BackpressureController) recalculateRate() {
	if len(bc.signals) == 0 {
		bc.currentRate = bc.maxRate
		bc.bucket.SetRate(float64(bc.currentRate))
		return
	}

	var successes, failures int
	for _, s := range bc.signals {
		if s.Success {
			successes++
		} else {
			failures++
		}
	}

	total := successes + failures
	if total == 0 {
		return
	}

	successRatio := float64(successes) / float64(total)

	var newRate int
	switch {
	case successRatio >= 0.95:
		newRate = bc.maxRate
	case successRatio >= 0.8:
		newRate = int(float64(bc.maxRate) * successRatio)
	case successRatio >= 0.5:
		newRate = int(float64(bc.maxRate) * successRatio * 0.5)
	default:
		newRate = bc.minRate
	}

	if newRate < bc.minRate {
		newRate = bc.minRate
	}
	if newRate > bc.maxRate {
		newRate = bc.maxRate
	}

	if newRate != bc.currentRate {
		slog.Debug("backpressure rate adjusted",
			"old_rate", bc.currentRate,
			"new_rate", newRate,
			"success_ratio", successRatio,
		)
	}

	bc.currentRate = newRate
	bc.bucket.SetRate(float64(newRate))
}

func (bc *BackpressureController) TryAcquire(points int) bool {
	if !bc.enabled {
		return true
	}

	bc.mu.Lock()
	defer bc.mu.Unlock()

	return bc.bucket.TryConsume(points)
}

func (bc *BackpressureController) CurrentRate() int {
	bc.mu.Lock()
	defer bc.mu.Unlock()
	return bc.currentRate
}

func (bc *BackpressureController) Metrics(baseTags map[string]string) []model.MetricPoint {
	bc.mu.Lock()
	rate := bc.currentRate
	success := bc.successTotal
	fail := bc.failTotal
	bc.mu.Unlock()

	return []model.MetricPoint{
		model.NewGauge("agent.backpressure.current_rate_bps", float64(rate), baseTags),
		model.NewCounter("agent.backpressure.signals_success_total", float64(success), baseTags),
		model.NewCounter("agent.backpressure.signals_fail_total", float64(fail), baseTags),
	}
}
