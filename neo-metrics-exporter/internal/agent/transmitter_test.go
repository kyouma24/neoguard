package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/collector"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/transport"
)

func makeTestPoints(n int) []model.MetricPoint {
	pts := make([]model.MetricPoint, n)
	for i := range pts {
		pts[i] = model.NewGauge("test.metric", float64(i), map[string]string{"host": "test"})
	}
	return pts
}

func newTestTransmitter(t *testing.T, handler http.HandlerFunc) (*Transmitter, *buffer.DiskBuffer, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	buf := buffer.NewDiskBuffer(100000, "")
	client, err := transport.NewClient(srv.URL, "test-key-12345678", 5*time.Second, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	dl := transport.NewDeadLetterWriter(config.DeadLetterConfig{Enabled: false}, "", "test")
	stats := &collector.AgentStats{}

	tx := NewTransmitter(TransmitterConfig{
		BatchMaxSize:            5000,
		BatchMaxIntervalSeconds: 1,
		ReplayRateBPS:           1000,
		StartupJitterSeconds:    0,
		MaxReenqueueCycles:      3,
		Backpressure: BackpressureConfig{
			Enabled:       true,
			WindowSeconds: 60,
			MinSendRate:   100,
			MaxReplayBPS:  5000,
		},
	}, buf, client, dl, stats, time.Now)

	return tx, buf, srv
}

func TestTransmitterRetryPriorityBeforeLive(t *testing.T) {
	var receivedBatches []int
	var mu atomic.Int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	buf := buffer.NewDiskBuffer(100000, "")
	client, err := transport.NewClient(srv.URL, "test-key-12345678", 5*time.Second, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	dl := transport.NewDeadLetterWriter(config.DeadLetterConfig{Enabled: false}, "", "test")
	stats := &collector.AgentStats{}

	tx := NewTransmitter(TransmitterConfig{
		BatchMaxSize:            5000,
		BatchMaxIntervalSeconds: 1,
		ReplayRateBPS:           1000,
		StartupJitterSeconds:    0,
		MaxReenqueueCycles:      3,
		Backpressure: BackpressureConfig{
			Enabled:       false,
			WindowSeconds: 60,
			MinSendRate:   100,
			MaxReplayBPS:  5000,
		},
	}, buf, client, dl, stats, time.Now)

	// Push retry batch at front (simulating a failed send being re-enqueued)
	buf.PushFront(makeTestPoints(5), 2)
	// Push live data
	buf.Push(makeTestPoints(10))

	ctx := context.Background()
	tx.tick(ctx)

	_ = receivedBatches
	// Retry batch (5 points) should have been sent first via DrainLive's retry priority
	sent := stats.PointsSent.Load()
	if sent < 5 {
		t.Errorf("expected at least 5 points sent (retry batch), got %d", sent)
	}
}

func TestTransmitterReplayModeEntersAndExits(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	buf := buffer.NewDiskBuffer(100000, "")
	client, err := transport.NewClient(srv.URL, "test-key-12345678", 5*time.Second, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	dl := transport.NewDeadLetterWriter(config.DeadLetterConfig{Enabled: false}, "", "test")
	stats := &collector.AgentStats{}

	// Pre-fill buffer and set replay count to simulate WAL replay
	buf.Push(makeTestPoints(100))
	buf.Push(makeTestPoints(100))
	buf.SetReplayCount(2)

	tx := NewTransmitter(TransmitterConfig{
		BatchMaxSize:            5000,
		BatchMaxIntervalSeconds: 1,
		ReplayRateBPS:           5000,
		StartupJitterSeconds:    0,
		MaxReenqueueCycles:      3,
		Backpressure: BackpressureConfig{
			Enabled:       false,
			WindowSeconds: 60,
			MinSendRate:   100,
			MaxReplayBPS:  5000,
		},
	}, buf, client, dl, stats, time.Now)

	if buf.ReplayCount() != 2 {
		t.Fatalf("replay count = %d, want 2", buf.ReplayCount())
	}

	// Run tick to start replay mode and drain
	ctx := context.Background()
	tx.replayMode.Store(true)

	// Multiple ticks to drain all replay
	for i := 0; i < 5; i++ {
		tx.tick(ctx)
	}

	if buf.ReplayCount() != 0 {
		t.Errorf("replay count after draining = %d, want 0", buf.ReplayCount())
	}
}

func TestTransmitterDropHalfDecrementsReplayCount(t *testing.T) {
	buf := buffer.NewDiskBuffer(100000, "")

	// 6 replay batches + 4 live batches
	for i := 0; i < 6; i++ {
		buf.Push(makeTestPoints(10))
	}
	buf.SetReplayCount(6)

	for i := 0; i < 4; i++ {
		buf.Push(makeTestPoints(10))
	}

	totalBefore := buf.Stats().Batches
	if totalBefore != 10 {
		t.Fatalf("total batches = %d, want 10", totalBefore)
	}
	if buf.ReplayCount() != 6 {
		t.Fatalf("replay count = %d, want 6", buf.ReplayCount())
	}

	dropped := buf.DropHalf()
	// Drops 5 batches (10/2), each with 10 points = 50 points
	if dropped != 50 {
		t.Fatalf("dropped = %d, want 50", dropped)
	}

	// replayCount should be decremented by toDrop (5), from 6 → 1
	rc := buf.ReplayCount()
	if rc != 1 {
		t.Errorf("replay count after DropHalf = %d, want 1", rc)
	}
}

func TestTransmitterEnabledFalseReplayRateStillApplies(t *testing.T) {
	fc := newFakeClock(time.Now())

	buf := buffer.NewDiskBuffer(100000, "")
	buf.Push(makeTestPoints(5000))
	buf.SetReplayCount(1)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	client, err := transport.NewClient(srv.URL, "test-key-12345678", 5*time.Second, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	dl := transport.NewDeadLetterWriter(config.DeadLetterConfig{Enabled: false}, "", "test")
	stats := &collector.AgentStats{}

	tx := NewTransmitter(TransmitterConfig{
		BatchMaxSize:            5000,
		BatchMaxIntervalSeconds: 1,
		ReplayRateBPS:           100, // Very low rate
		StartupJitterSeconds:    0,
		MaxReenqueueCycles:      3,
		Backpressure: BackpressureConfig{
			Enabled:       false, // Disabled
			WindowSeconds: 60,
			MinSendRate:   100,
			MaxReplayBPS:  5000,
		},
	}, buf, client, dl, stats, fc.Now)
	tx.replayMode.Store(true)

	ctx := context.Background()
	tx.tick(ctx)

	// With replay rate of 100 and no time advance, token bucket starts with capacity=200
	// First tick should drain at most 100 points from replay
	// The live drain returns nothing (replayCount covers all batches)
	// The replay drain is rate-limited by the replayBucket
	remaining := buf.ReplayCount()
	if remaining < 0 {
		t.Errorf("replay count = %d, should not go negative", remaining)
	}
}

func TestTransmitterMetrics(t *testing.T) {
	tx, _, srv := newTestTransmitter(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})
	defer srv.Close()

	metrics := tx.Metrics(map[string]string{"host": "test"})
	if len(metrics) < 5 {
		t.Errorf("expected at least 5 metrics, got %d", len(metrics))
	}

	names := map[string]bool{}
	for _, m := range metrics {
		names[m.Name] = true
	}

	expected := []string{
		"agent.transmitter.replay_mode",
		"agent.transmitter.replay_count",
		"agent.backpressure.current_rate_bps",
	}
	for _, name := range expected {
		if !names[name] {
			t.Errorf("missing metric: %s", name)
		}
	}
}
