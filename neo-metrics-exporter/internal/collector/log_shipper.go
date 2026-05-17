package collector

import (
	"context"
	"log/slog"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/identity"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/transport"
)

const (
	maxRetryCount  = 3
	maxBatchEvents = 1000
	maxBatchBytes  = 1024 * 1024 // 1 MB per contract §7.2
	flushInterval  = 5 * time.Second
	spoolPollRate  = 1 * time.Second
)

// LogSender is the interface used by LogShipper to send log envelopes.
// *transport.LogClient satisfies this interface.
type LogSender interface {
	SendWithRetry(ctx context.Context, envelope model.LogEnvelope, maxRetries int) error
}

// compile-time check
var _ LogSender = (*transport.LogClient)(nil)

// LogShipper drains LogRing into LogSpool (sealed files), then sends from spool via LogClient.
// One sealed spool file = one send batch (no splitting).
// Retry lifecycle: one cycle = 3 HTTP attempts (1s/2s/4s), failed cycle increments spool retry count,
// retry count reaching 3 → dead-letter + delete spool file. No r3 file remains on disk.
type LogShipper struct {
	identity     *identity.Identity
	agentVersion string
	ring         *buffer.LogRing
	spool        *buffer.LogSpool
	deadLetter   *buffer.LogDeadLetterWriter
	client       LogSender
	stats        *LogStats
}

func NewLogShipper(
	identity *identity.Identity,
	agentVersion string,
	ring *buffer.LogRing,
	spool *buffer.LogSpool,
	deadLetter *buffer.LogDeadLetterWriter,
	client LogSender,
	stats *LogStats,
) *LogShipper {
	return &LogShipper{
		identity:     identity,
		agentVersion: agentVersion,
		ring:         ring,
		spool:        spool,
		deadLetter:   deadLetter,
		client:       client,
		stats:        stats,
	}
}

func (s *LogShipper) Run(ctx context.Context, drainDone <-chan struct{}) {
	go s.spoolSender(ctx)

	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-drainDone:
			s.flushRing()
			s.shutdownSend()
			return
		case <-s.ring.Notify():
			s.flushRing()
		case <-ticker.C:
			s.flushRing()
			s.checkPressure()
		}
	}
}

func (s *LogShipper) shutdownSend() {
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for {
		entries, path, _, err := s.spool.LoadOldest()
		if err != nil || len(entries) == 0 {
			return
		}

		envelope := model.LogEnvelope{
			AgentID:       s.identity.AgentID,
			AgentVersion:  s.agentVersion,
			SchemaVersion: 1,
			Logs:          entries,
		}

		if err := s.client.SendWithRetry(shutCtx, envelope, 2); err != nil {
			slog.Warn("shutdown log send failed, data persisted in spool", "error", err, "path", path)
			return
		}
		s.spool.DeleteFile(path)
	}
}

func (s *LogShipper) flushRing() {
	remaining := s.ring.Size()
	for remaining > 0 {
		entries := s.ring.Read(maxBatchEvents, maxBatchBytes)
		if len(entries) == 0 {
			return
		}

		if err := s.spool.WriteBatch(entries); err != nil {
			slog.Error("failed to write logs to spool", "error", err, "count", len(entries))
			return
		}
		remaining -= len(entries)
	}
}

func (s *LogShipper) checkPressure() {
	if s.spool.IsCriticalWatermark() && s.ring.Size() > 0 {
		dropped := s.ring.DropOldest(100)
		if dropped > 0 {
			s.stats.Increment("agent.logs.buffer_dropped_batches", map[string]string{
				"reason": "critical_watermark",
			})
			slog.Warn("dropped logs due to critical watermark", "count", dropped)
		}
	}

	if s.spool.IsHighWatermark() {
		s.stats.Increment("agent.logs.buffer_high_watermark", nil)
	}
}

func (s *LogShipper) spoolSender(ctx context.Context) {
	ticker := time.NewTicker(spoolPollRate)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.sendFromSpool(ctx)
		}
	}
}

// sendFromSpool loads the oldest spool file and sends it as one batch.
// On success: deletes the spool file.
// On permanent error: dead-letters and deletes the spool file (once).
// On retryable error: increments retry count. At retry count >= 3: dead-letters and deletes.
func (s *LogShipper) sendFromSpool(ctx context.Context) {
	entries, path, retryCount, err := s.spool.LoadOldest()
	if err != nil {
		slog.Error("failed to load from spool", "error", err)
		return
	}

	if len(entries) == 0 {
		return
	}

	envelope := model.LogEnvelope{
		AgentID:       s.identity.AgentID,
		AgentVersion:  s.agentVersion,
		SchemaVersion: 1,
		Logs:          entries,
	}

	err = s.client.SendWithRetry(ctx, envelope, 2)
	if err == nil {
		s.spool.DeleteFile(path)
		return
	}

	if _, ok := err.(*transport.PermanentError); ok {
		slog.Error("permanent send failure, dead-lettering", "error", err, "count", len(entries))
		s.deadLetterAndRemove(entries, retryCount, path)
		return
	}

	// Retryable failure: increment retry count on spool file
	newPath, newRetry, incErr := s.spool.IncrementRetry(path)
	if incErr != nil {
		slog.Error("failed to increment retry", "error", incErr)
		return
	}

	if newRetry >= maxRetryCount {
		slog.Warn("retry exhausted, dead-lettering", "path", newPath, "retries", newRetry)
		s.deadLetterAndRemove(entries, newRetry, newPath)
	}
}

func (s *LogShipper) deadLetterAndRemove(entries []model.LogEntry, retryCount int, spoolPath string) {
	if err := s.deadLetter.Write(entries, retryCount); err != nil {
		slog.Error("failed to write to dead-letter, preserving spool file", "error", err, "path", spoolPath)
		return
	}
	s.stats.Add("agent.logs.dead_lettered", float64(len(entries)), map[string]string{
		"reason": "retry_exhausted",
	})
	s.spool.DeleteFile(spoolPath)
}
