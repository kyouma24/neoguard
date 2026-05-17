package collector

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/identity"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/transport"
)

type fakeSender struct {
	mu        sync.Mutex
	calls     []model.LogEnvelope
	err       error
	callCount int
}

func (f *fakeSender) SendWithRetry(_ context.Context, envelope model.LogEnvelope, _ int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, envelope)
	f.callCount++
	return f.err
}

func (f *fakeSender) getCalls() []model.LogEnvelope {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make([]model.LogEnvelope, len(f.calls))
	copy(cp, f.calls)
	return cp
}

func newTestShipper(t *testing.T, sender LogSender) (*LogShipper, *buffer.LogRing, *buffer.LogSpool, string) {
	t.Helper()
	spoolDir := filepath.Join(t.TempDir(), "spool")
	dlDir := filepath.Join(t.TempDir(), "dead-letter")

	ring := buffer.NewLogRing(10000, 1000, maxBatchBytes)
	spool, err := buffer.NewLogSpool(spoolDir, config.SpoolConfig{
		MaxSizeMB:            100,
		HighWatermarkPct:     80,
		CriticalWatermarkPct: 95,
	})
	if err != nil {
		t.Fatal(err)
	}
	dl, err := buffer.NewLogDeadLetterWriter(dlDir)
	if err != nil {
		t.Fatal(err)
	}

	id := &identity.Identity{
		AgentID:  "test-agent-id-123",
		Hostname: "test-host",
	}

	shipper := NewLogShipper(id, "1.2.3", ring, spool, dl, sender, NewLogStats())
	return shipper, ring, spool, dlDir
}

func TestLogShipperLowVolumeFlush(t *testing.T) {
	sender := &fakeSender{}
	shipper, ring, _, _ := newTestShipper(t, sender)

	// Write a few entries (below threshold)
	for i := 0; i < 3; i++ {
		ring.Write(model.LogEntry{Message: fmt.Sprintf("msg%d", i), Service: "app", Timestamp: time.Now()})
	}

	// Run shipper briefly — ticker fires at 5s, but we can manually trigger flush+send
	ctx, cancel := context.WithCancel(context.Background())

	// flushRing moves ring → spool
	shipper.flushRing()

	// sendFromSpool sends spool → client
	shipper.sendFromSpool(ctx)
	cancel()

	calls := sender.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 send call, got %d", len(calls))
	}
	if len(calls[0].Logs) != 3 {
		t.Errorf("expected 3 logs in envelope, got %d", len(calls[0].Logs))
	}
}

func TestLogShipperThresholdCountFlush(t *testing.T) {
	sender := &fakeSender{}
	// Ring with threshCount=5
	spoolDir := filepath.Join(t.TempDir(), "spool")
	dlDir := filepath.Join(t.TempDir(), "dead-letter")

	ring := buffer.NewLogRing(10000, 5, maxBatchBytes)
	spool, _ := buffer.NewLogSpool(spoolDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	dl, _ := buffer.NewLogDeadLetterWriter(dlDir)
	id := &identity.Identity{AgentID: "test-agent", Hostname: "h"}
	shipper := NewLogShipper(id, "1.0.0", ring, spool, dl, sender, NewLogStats())

	// Write 5 entries to cross count threshold
	for i := 0; i < 5; i++ {
		ring.Write(model.LogEntry{Message: "x", Service: "app", Timestamp: time.Now()})
	}

	// Notify channel should be signaled
	select {
	case <-ring.Notify():
		// expected
	default:
		t.Fatal("ring.Notify() not signaled after threshold count reached")
	}

	// Shipper flush + send
	shipper.flushRing()
	shipper.sendFromSpool(context.Background())

	calls := sender.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 send, got %d", len(calls))
	}
	if len(calls[0].Logs) != 5 {
		t.Errorf("expected 5 logs, got %d", len(calls[0].Logs))
	}
}

func TestLogShipperThresholdBytesFlush(t *testing.T) {
	sender := &fakeSender{}
	// Ring with threshBytes very low (500 bytes)
	spoolDir := filepath.Join(t.TempDir(), "spool")
	dlDir := filepath.Join(t.TempDir(), "dead-letter")

	ring := buffer.NewLogRing(10000, 100000, 500)
	spool, _ := buffer.NewLogSpool(spoolDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	dl, _ := buffer.NewLogDeadLetterWriter(dlDir)
	id := &identity.Identity{AgentID: "test-agent", Hostname: "h"}
	shipper := NewLogShipper(id, "1.0.0", ring, spool, dl, sender, NewLogStats())

	// Write entries that exceed 500 bytes total
	for i := 0; i < 3; i++ {
		ring.Write(model.LogEntry{Message: "a]long message that takes space in the ring buffer estimate", Service: "app", Timestamp: time.Now()})
	}

	// Notify should fire
	select {
	case <-ring.Notify():
		// expected
	default:
		t.Fatal("ring.Notify() not signaled after byte threshold")
	}

	shipper.flushRing()
	shipper.sendFromSpool(context.Background())

	if len(sender.getCalls()) != 1 {
		t.Fatalf("expected 1 send, got %d", len(sender.getCalls()))
	}
}

func TestLogShipperRetryLifecycleDeadLetters(t *testing.T) {
	// Sender always returns retryable error
	sender := &fakeSender{err: &transport.RetryableError{StatusCode: 500, Message: "server error"}}
	shipper, ring, spool, dlDir := newTestShipper(t, sender)

	ring.Write(model.LogEntry{Message: "will-fail", Service: "app", Timestamp: time.Now()})
	shipper.flushRing()

	ctx := context.Background()

	// Cycle 1: retry count goes 0 → 1
	shipper.sendFromSpool(ctx)
	_, _, r1, _ := spool.LoadOldest()
	if r1 != 1 {
		t.Fatalf("after cycle 1: retry = %d, want 1", r1)
	}

	// Cycle 2: retry count goes 1 → 2
	shipper.sendFromSpool(ctx)
	_, _, r2, _ := spool.LoadOldest()
	if r2 != 2 {
		t.Fatalf("after cycle 2: retry = %d, want 2", r2)
	}

	// Cycle 3: retry count goes 2 → 3, hits maxRetryCount, dead-letters, removes spool file
	shipper.sendFromSpool(ctx)

	// Spool should be empty (no r3 file remaining)
	entries, _, _, _ := spool.LoadOldest()
	if len(entries) != 0 {
		t.Errorf("spool not empty after 3 failed cycles — stale file remains")
	}

	// Dead-letter directory should have exactly 1 file
	dlFiles, _ := filepath.Glob(filepath.Join(dlDir, "*.jsonl.gz"))
	if len(dlFiles) != 1 {
		t.Errorf("expected 1 dead-letter file, got %d", len(dlFiles))
	}
}

func TestLogShipperPermanentErrorDeadLettersOnce(t *testing.T) {
	sender := &fakeSender{err: &transport.PermanentError{StatusCode: 422, Message: "rejected"}}
	shipper, ring, spool, dlDir := newTestShipper(t, sender)

	ring.Write(model.LogEntry{Message: "rejected", Service: "app", Timestamp: time.Now()})
	shipper.flushRing()

	shipper.sendFromSpool(context.Background())

	// Spool must be empty after permanent error
	entries, _, _, _ := spool.LoadOldest()
	if len(entries) != 0 {
		t.Error("spool not empty after permanent error — file not deleted")
	}

	// Dead-letter should have exactly 1 file
	dlFiles, _ := filepath.Glob(filepath.Join(dlDir, "*.jsonl.gz"))
	if len(dlFiles) != 1 {
		t.Errorf("expected 1 dead-letter file, got %d", len(dlFiles))
	}

	// Calling sendFromSpool again should not produce another dead-letter (spool is empty)
	shipper.sendFromSpool(context.Background())
	dlFiles2, _ := filepath.Glob(filepath.Join(dlDir, "*.jsonl.gz"))
	if len(dlFiles2) != 1 {
		t.Errorf("repeated send produced extra dead-letter: got %d files", len(dlFiles2))
	}
}

func TestLogShipperNoStaleR3File(t *testing.T) {
	sender := &fakeSender{err: &transport.RetryableError{StatusCode: 503, Message: "unavailable"}}
	shipper, ring, spool, _ := newTestShipper(t, sender)

	ring.Write(model.LogEntry{Message: "test", Service: "app", Timestamp: time.Now()})
	shipper.flushRing()

	ctx := context.Background()
	// Run 3 retry cycles
	shipper.sendFromSpool(ctx)
	shipper.sendFromSpool(ctx)
	shipper.sendFromSpool(ctx)

	// Spool must be empty — no r3 file remains
	entries, _, _, _ := spool.LoadOldest()
	if len(entries) != 0 {
		t.Error("stale spool file remains after retry exhaustion")
	}

	if spool.SizeBytes() != 0 {
		t.Errorf("spool size = %d, want 0 (no stale files)", spool.SizeBytes())
	}
}

func TestLogShipperEnvelopeContents(t *testing.T) {
	sender := &fakeSender{}
	shipper, ring, _, _ := newTestShipper(t, sender)

	entry := model.LogEntry{
		Message:   "check envelope",
		Service:   "myservice",
		Timestamp: time.Now(),
		Tags:      map[string]string{"env": "prod"},
	}
	ring.Write(entry)
	shipper.flushRing()
	shipper.sendFromSpool(context.Background())

	calls := sender.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}

	env := calls[0]

	// Must have agent_id
	if env.AgentID != "test-agent-id-123" {
		t.Errorf("AgentID = %q, want %q", env.AgentID, "test-agent-id-123")
	}

	// Must have agent_version
	if env.AgentVersion != "1.2.3" {
		t.Errorf("AgentVersion = %q, want %q", env.AgentVersion, "1.2.3")
	}

	// Must have schema_version
	if env.SchemaVersion != 1 {
		t.Errorf("SchemaVersion = %d, want 1", env.SchemaVersion)
	}

	// Must NOT have tenant_id anywhere in envelope or log tags
	for _, log := range env.Logs {
		if _, ok := log.Tags["tenant_id"]; ok {
			t.Error("envelope log entry contains tenant_id — contract violation")
		}
	}
}

func TestLogShipperNoSpoolFilesAfterSuccess(t *testing.T) {
	sender := &fakeSender{}
	shipper, ring, spool, _ := newTestShipper(t, sender)

	ring.Write(model.LogEntry{Message: "ok", Service: "app", Timestamp: time.Now()})
	shipper.flushRing()
	shipper.sendFromSpool(context.Background())

	entries, _, _, _ := spool.LoadOldest()
	if len(entries) != 0 {
		t.Error("spool file not deleted after successful send")
	}
}

func TestLogShipperMultiBatchThresholdDrain(t *testing.T) {
	sender := &fakeSender{}
	// Ring capacity large enough to hold >2000 entries, threshold at 1000
	spoolDir := filepath.Join(t.TempDir(), "spool")
	dlDir := filepath.Join(t.TempDir(), "dead-letter")

	ring := buffer.NewLogRing(5000, 1000, maxBatchBytes)
	spool, _ := buffer.NewLogSpool(spoolDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	dl, _ := buffer.NewLogDeadLetterWriter(dlDir)
	id := &identity.Identity{AgentID: "test-agent", Hostname: "h"}
	shipper := NewLogShipper(id, "1.0.0", ring, spool, dl, sender, NewLogStats())

	// Write 2500 entries
	for i := 0; i < 2500; i++ {
		ring.Write(model.LogEntry{Message: fmt.Sprintf("m%d", i), Service: "app", Timestamp: time.Now()})
	}

	// Single flushRing call must drain all 2500 into spool (multiple batches)
	shipper.flushRing()

	// Ring must be empty after one flushRing call
	if ring.Size() != 0 {
		t.Errorf("ring.Size() = %d after flushRing, want 0 (all drained)", ring.Size())
	}

	// Send all spool files
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		shipper.sendFromSpool(ctx)
	}

	// All entries must have been sent
	calls := sender.getCalls()
	totalSent := 0
	for _, c := range calls {
		totalSent += len(c.Logs)
	}
	if totalSent != 2500 {
		t.Errorf("total entries sent = %d, want 2500", totalSent)
	}
}

func TestLogShipperPreservesSpoolOnDeadLetterFailure(t *testing.T) {
	sender := &fakeSender{err: &transport.PermanentError{StatusCode: 422, Message: "rejected"}}

	spoolDir := filepath.Join(t.TempDir(), "spool")

	ring := buffer.NewLogRing(1000, 1000, maxBatchBytes)
	spool, _ := buffer.NewLogSpool(spoolDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	id := &identity.Identity{AgentID: "test-agent", Hostname: "h"}

	// Point dead-letter writer at a path that cannot be written
	// (nested under a file, not a directory — guaranteed cross-platform failure)
	blockerFile := filepath.Join(t.TempDir(), "blocker")
	os.WriteFile(blockerFile, []byte("x"), 0640)
	impossibleDir := filepath.Join(blockerFile, "subdir")
	// NewLogDeadLetterWriter will fail on MkdirAll, so create the writer with a valid dir first
	// then swap the dir field to the impossible path
	dlDir := filepath.Join(t.TempDir(), "dl-valid")
	failDL, _ := buffer.NewLogDeadLetterWriter(dlDir)
	// Remove the directory so writes fail
	os.RemoveAll(dlDir)

	shipper := &LogShipper{
		identity:     id,
		agentVersion: "1.0.0",
		ring:         ring,
		spool:        spool,
		deadLetter:   failDL,
		client:       sender,
		stats:        NewLogStats(),
	}

	_ = impossibleDir // used for documentation

	ring.Write(model.LogEntry{Message: "must-survive", Service: "app", Timestamp: time.Now()})
	shipper.flushRing()

	// Send triggers permanent error → tries dead-letter → fails (dir removed) → must NOT delete spool
	shipper.sendFromSpool(context.Background())

	// Spool file must still exist (data preserved)
	entries, _, _, err := spool.LoadOldest()
	if err != nil {
		t.Fatalf("LoadOldest error: %v", err)
	}
	if len(entries) == 0 {
		t.Error("spool file deleted despite dead-letter write failure — data loss")
	}
	if len(entries) > 0 && entries[0].Message != "must-survive" {
		t.Errorf("preserved entry message = %q, want %q", entries[0].Message, "must-survive")
	}
}

func TestLogShipperBufferDroppedBatchesIncrementsOnce(t *testing.T) {
	sender := &fakeSender{}
	// Use a spool with very small max to trigger critical watermark
	spoolDir := filepath.Join(t.TempDir(), "spool")
	dlDir := filepath.Join(t.TempDir(), "dead-letter")

	ring := buffer.NewLogRing(10000, 10000, maxBatchBytes)
	// 1 KB max spool — will immediately be at critical watermark after any write
	spool, _ := buffer.NewLogSpool(spoolDir, config.SpoolConfig{MaxSizeMB: 0, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	dl, _ := buffer.NewLogDeadLetterWriter(dlDir)
	id := &identity.Identity{AgentID: "test-agent", Hostname: "h"}
	stats := NewLogStats()
	shipper := NewLogShipper(id, "1.0.0", ring, spool, dl, sender, stats)

	// Put entries in ring to be dropped
	for i := 0; i < 200; i++ {
		ring.Write(model.LogEntry{Message: "x", Service: "app", Timestamp: time.Now()})
	}

	// Force spool above critical watermark by writing a file directly
	spool.WriteBatch([]model.LogEntry{{Message: "fill", Service: "app", Timestamp: time.Now()}})

	// checkPressure drops up to 100 entries from ring per call
	shipper.checkPressure()
	shipper.checkPressure()

	// buffer_dropped_batches should be 2 (one per drop action), NOT 200 (entry count)
	points := stats.Collect(nil)
	var dropMetric float64
	for _, p := range points {
		if p.Name == "agent.logs.buffer_dropped_batches" {
			dropMetric = p.Value
		}
	}
	if dropMetric != 2 {
		t.Errorf("agent.logs.buffer_dropped_batches = %f, want 2 (one per drop action)", dropMetric)
	}
}

func TestLogShipperShutdownSendsSpooledData(t *testing.T) {
	sender := &fakeSender{}
	shipper, ring, _, _ := newTestShipper(t, sender)

	// Write entries into ring
	for i := 0; i < 5; i++ {
		ring.Write(model.LogEntry{Message: fmt.Sprintf("shutdown-msg-%d", i), Service: "app", Timestamp: time.Now()})
	}

	// Simulate the shutdown path: flushRing moves ring→spool, shutdownSend sends spool→client
	shipper.flushRing()
	shipper.shutdownSend()

	calls := sender.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 send call from shutdown, got %d", len(calls))
	}
	if len(calls[0].Logs) != 5 {
		t.Errorf("expected 5 logs in shutdown envelope, got %d", len(calls[0].Logs))
	}
}

func TestLogShipperShutdownStopsOnSendFailure(t *testing.T) {
	sender := &fakeSender{err: &transport.RetryableError{StatusCode: 503, Message: "unavailable"}}
	shipper, ring, spool, _ := newTestShipper(t, sender)

	ring.Write(model.LogEntry{Message: "will-fail-at-shutdown", Service: "app", Timestamp: time.Now()})
	shipper.flushRing()

	// shutdownSend fails but does NOT dead-letter or delete — data stays in spool for next startup
	shipper.shutdownSend()

	// Spool must still have the file (not deleted, not dead-lettered)
	entries, _, _, err := spool.LoadOldest()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Error("spool empty after shutdown send failure — data lost")
	}
}
