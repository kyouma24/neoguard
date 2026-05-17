package agent

import (
	"context"
	"log/slog"
	"math/rand/v2"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/collector"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/transport"
)

type TransmitterConfig struct {
	BatchMaxSize            int
	BatchMaxIntervalSeconds int
	ReplayRateBPS           int
	StartupJitterSeconds    int
	MaxReenqueueCycles      int
	Backpressure            BackpressureConfig
}

type Transmitter struct {
	cfg          TransmitterConfig
	buf          *buffer.DiskBuffer
	client       *transport.Client
	deadLetter   *transport.DeadLetterWriter
	bp           *BackpressureController
	stats        *collector.AgentStats
	replayMode   atomic.Bool
	clock        func() time.Time
	replayBucket *TokenBucket

	pointsSent atomic.Int64
	sendErrors atomic.Int64
}

func NewTransmitter(cfg TransmitterConfig, buf *buffer.DiskBuffer, client *transport.Client, deadLetter *transport.DeadLetterWriter, stats *collector.AgentStats, clock func() time.Time) *Transmitter {
	bpCfg := cfg.Backpressure
	t := &Transmitter{
		cfg:        cfg,
		buf:        buf,
		client:     client,
		deadLetter: deadLetter,
		stats:      stats,
		bp:         NewBackpressureController(bpCfg, clock),
		clock:      clock,
	}

	replayRate := float64(cfg.ReplayRateBPS)
	if replayRate <= 0 {
		replayRate = 1000
	}
	t.replayBucket = NewTokenBucket(replayRate, clock)

	return t
}

func (t *Transmitter) Run(ctx context.Context) {
	jitter := time.Duration(rand.Int64N(int64(t.cfg.StartupJitterSeconds)*int64(time.Second) + 1))
	slog.Debug("transmitter startup jitter", "delay", jitter)
	select {
	case <-ctx.Done():
		return
	case <-time.After(jitter):
	}

	if t.buf.ReplayCount() > 0 {
		t.replayMode.Store(true)
		slog.Info("transmitter entering replay mode", "replay_batches", t.buf.ReplayCount())
	}

	interval := time.Duration(t.cfg.BatchMaxIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			t.tick(ctx)
		}
	}
}

func (t *Transmitter) tick(ctx context.Context) {
	drainSize := t.cfg.BatchMaxSize
	if drainSize > maxServerBatchSize {
		drainSize = maxServerBatchSize
	}

	// Priority 1: retry batches + live data
	liveResult := t.buf.DrainLive(drainSize)
	if len(liveResult.Points) > 0 {
		t.sendBatch(ctx, liveResult)
	}

	// Priority 2: replay data (rate-limited)
	if t.buf.ReplayCount() > 0 {
		t.drainReplay(ctx, drainSize)
	} else if t.replayMode.Load() {
		stats := t.buf.Stats()
		halfCap := t.buf.Stats().Items
		_ = halfCap
		if stats.ReplayCount == 0 {
			t.replayMode.Store(false)
			slog.Info("transmitter exiting replay mode")
		}
	}
}

func (t *Transmitter) drainReplay(ctx context.Context, maxBatch int) {
	replayMax := t.cfg.ReplayRateBPS
	if replayMax > maxBatch {
		replayMax = maxBatch
	}

	if !t.replayBucket.TryConsume(replayMax) {
		return
	}

	result := t.buf.DrainReplay(replayMax)
	if len(result.Points) == 0 {
		return
	}

	t.sendBatch(ctx, result)
}

func (t *Transmitter) sendBatch(ctx context.Context, result buffer.DrainResult) {
	slog.Info("sending batch", "points", len(result.Points), "retry_count", result.RetryCount)

	start := time.Now()
	err := t.client.SendWithRetry(ctx, result.Points, 3)
	if t.stats != nil {
		t.stats.SendDurationMs.Store(time.Since(start).Milliseconds())
	}

	if err == nil {
		t.pointsSent.Add(int64(len(result.Points)))
		if t.stats != nil {
			t.stats.PointsSent.Add(int64(len(result.Points)))
		}
		t.bp.RecordSignal(true, len(result.Points))
		slog.Info("batch sent", "points", len(result.Points))
		return
	}

	t.sendErrors.Add(1)
	if t.stats != nil {
		t.stats.SendErrors.Add(1)
	}
	t.bp.RecordSignal(false, len(result.Points))

	if _, ok := err.(*transport.PermanentError); ok {
		slog.Error("permanent send failure, batch dropped",
			"error", err,
			"points_dropped", len(result.Points),
		)
		return
	}

	newRetryCount := result.RetryCount + 1
	maxCycles := t.cfg.MaxReenqueueCycles
	if maxCycles <= 0 {
		maxCycles = 3
	}

	if newRetryCount >= maxCycles {
		slog.Error("batch exhausted retry cycles, dead-lettering",
			"retry_count", newRetryCount,
			"points", len(result.Points),
			"error", err,
		)
		if dlErr := t.deadLetter.Write(result.Points, newRetryCount, transport.ReasonRetriesExhausted, err.Error()); dlErr != nil {
			slog.Error("dead-letter write failed, data lost", "error", dlErr, "points_lost", len(result.Points))
		}
		return
	}

	slog.Warn("send failed, re-enqueueing at front",
		"retry_count", newRetryCount,
		"points", len(result.Points),
		"error", err,
	)
	t.buf.PushFront(result.Points, newRetryCount)
}

func (t *Transmitter) PointsSent() int64 {
	return t.pointsSent.Load()
}

func (t *Transmitter) SendErrors() int64 {
	return t.sendErrors.Load()
}

func (t *Transmitter) IsReplayMode() bool {
	return t.replayMode.Load()
}

func (t *Transmitter) Metrics(baseTags map[string]string) []model.MetricPoint {
	replayMode := 0.0
	if t.replayMode.Load() {
		replayMode = 1.0
	}

	pts := []model.MetricPoint{
		model.NewGauge("agent.transmitter.replay_mode", replayMode, baseTags),
		model.NewGauge("agent.transmitter.replay_count", float64(t.buf.ReplayCount()), baseTags),
	}
	pts = append(pts, t.bp.Metrics(baseTags)...)
	return pts
}
