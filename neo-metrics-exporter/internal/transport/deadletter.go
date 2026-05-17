package transport

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type DeadLetterReason string

const (
	ReasonRetriesExhausted    DeadLetterReason = "retries_exhausted"
	ReasonShutdownUndelivered DeadLetterReason = "shutdown_undelivered"
)

type DeadLetterMeta struct {
	AgentID        string           `json:"agent_id"`
	AgentVersion   string           `json:"agent_version"`
	BatchedAt      time.Time        `json:"batched_at"`
	DeadLetteredAt time.Time        `json:"dead_lettered_at"`
	RetryCount     int              `json:"retry_count"`
	Reason         DeadLetterReason `json:"reason"`
	LastError      string           `json:"last_error"`
	PointCount     int              `json:"point_count"`
}

type DeadLetterWriter struct {
	mu  sync.Mutex
	cfg config.DeadLetterConfig

	agentID      string
	agentVersion string

	filesWritten atomic.Int64
	filesDropped atomic.Int64
	seqCounter   atomic.Uint64
}

func NewDeadLetterWriter(cfg config.DeadLetterConfig, agentID, agentVersion string) *DeadLetterWriter {
	return &DeadLetterWriter{
		cfg:          cfg,
		agentID:      agentID,
		agentVersion: agentVersion,
	}
}

func (w *DeadLetterWriter) Write(points []model.MetricPoint, retryCount int, reason DeadLetterReason, lastErr string) error {
	if !w.cfg.Enabled || w.cfg.Dir == "" {
		return nil
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	if err := os.MkdirAll(w.cfg.Dir, 0750); err != nil {
		return fmt.Errorf("dead-letter mkdir: %w", err)
	}

	w.enforceCapacity()

	seq := w.seqCounter.Add(1)
	filename := fmt.Sprintf("%d-%d-%d.jsonl.gz", time.Now().UnixMilli(), retryCount, seq)
	path := filepath.Join(w.cfg.Dir, filename)

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0640)
	if err != nil {
		return fmt.Errorf("dead-letter create: %w", err)
	}
	defer f.Close()

	gz := gzip.NewWriter(f)

	meta := struct {
		Meta DeadLetterMeta `json:"_dead_letter_meta"`
	}{
		Meta: DeadLetterMeta{
			AgentID:        w.agentID,
			AgentVersion:   w.agentVersion,
			BatchedAt:      batchTime(points),
			DeadLetteredAt: time.Now().UTC(),
			RetryCount:     retryCount,
			Reason:         reason,
			LastError:      lastErr,
			PointCount:     len(points),
		},
	}

	metaLine, _ := json.Marshal(meta)
	gz.Write(metaLine)
	gz.Write([]byte("\n"))

	for _, p := range points {
		line, err := json.Marshal(p)
		if err != nil {
			continue
		}
		gz.Write(line)
		gz.Write([]byte("\n"))
	}

	if err := gz.Close(); err != nil {
		os.Remove(path)
		return fmt.Errorf("dead-letter gzip close: %w", err)
	}

	w.filesWritten.Add(1)
	slog.Warn("batch dead-lettered",
		"path", path,
		"points", len(points),
		"retry_count", retryCount,
		"reason", string(reason),
	)

	return nil
}

func (w *DeadLetterWriter) enforceCapacity() {
	entries, err := os.ReadDir(w.cfg.Dir)
	if err != nil {
		return
	}

	var files []os.DirEntry
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".jsonl.gz") {
			files = append(files, e)
		}
	}

	// Enforce max_files (evict oldest first)
	if len(files) >= w.cfg.MaxFiles {
		sort.Slice(files, func(i, j int) bool {
			return files[i].Name() < files[j].Name()
		})
		toRemove := len(files) - w.cfg.MaxFiles + 1
		for i := 0; i < toRemove; i++ {
			path := filepath.Join(w.cfg.Dir, files[i].Name())
			os.Remove(path)
			w.filesDropped.Add(1)
			slog.Warn("dead-letter file evicted (max_files)", "path", path)
		}
	}

	// Enforce max_total_mb
	if w.cfg.MaxTotalMB > 0 {
		entries, _ = os.ReadDir(w.cfg.Dir)
		var totalSize int64
		type fileEntry struct {
			name string
			size int64
		}
		var sized []fileEntry
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".jsonl.gz") {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			sized = append(sized, fileEntry{name: e.Name(), size: info.Size()})
			totalSize += info.Size()
		}

		maxBytes := int64(w.cfg.MaxTotalMB) * 1024 * 1024
		if totalSize > maxBytes {
			sort.Slice(sized, func(i, j int) bool {
				return sized[i].name < sized[j].name
			})
			for _, fe := range sized {
				if totalSize <= maxBytes {
					break
				}
				path := filepath.Join(w.cfg.Dir, fe.name)
				os.Remove(path)
				totalSize -= fe.size
				w.filesDropped.Add(1)
				slog.Warn("dead-letter file evicted (max_total_mb)", "path", path)
			}
		}
	}
}

func (w *DeadLetterWriter) ScanExisting() int {
	if w.cfg.Dir == "" {
		return 0
	}
	entries, err := os.ReadDir(w.cfg.Dir)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".jsonl.gz") {
			count++
		}
	}
	return count
}

// Stats returns dead-letter writer statistics.
func (w *DeadLetterWriter) Stats() (filesWritten, filesEvicted int64) {
	return w.filesWritten.Load(), w.filesDropped.Load()
}

// Metrics returns dead-letter metrics as model.MetricPoint slice.
// Accepts baseTags from the emitter to preserve identity tags.
func (w *DeadLetterWriter) Metrics(baseTags map[string]string) []model.MetricPoint {
	written, evicted := w.Stats()

	return []model.MetricPoint{
		model.NewCounter("agent.dead_letter.files_written_total", float64(written), baseTags),
		model.NewCounter("agent.dead_letter.files_evicted_total", float64(evicted), baseTags),
	}
}

func (w *DeadLetterWriter) FilesWritten() int64 {
	return w.filesWritten.Load()
}

func (w *DeadLetterWriter) FilesDropped() int64 {
	return w.filesDropped.Load()
}

func batchTime(points []model.MetricPoint) time.Time {
	if len(points) > 0 && !points[0].Timestamp.IsZero() {
		return points[0].Timestamp
	}
	return time.Now().UTC()
}
