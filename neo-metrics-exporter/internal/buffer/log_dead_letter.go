package buffer

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/oklog/ulid/v2"
)

// LogDeadLetterWriter writes failed log batches to logs-dead-letter/ directory.
// Separate from metrics DeadLetterWriter per log pipeline contract §1.2.
// Format: gzip-compressed JSONL, filename <timestamp>-<ulid>-<retryCount>.jsonl.gz per §9.2.2.
type LogDeadLetterWriter struct {
	dir string
}

func NewLogDeadLetterWriter(dir string) (*LogDeadLetterWriter, error) {
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("create dead-letter dir: %w", err)
	}
	return &LogDeadLetterWriter{dir: dir}, nil
}

func (w *LogDeadLetterWriter) Write(entries []model.LogEntry, retryCount int) error {
	timestamp := time.Now().UnixMilli()
	id := ulid.Make()
	filename := fmt.Sprintf("%d-%s-%d.jsonl.gz", timestamp, id.String(), retryCount)
	path := filepath.Join(w.dir, filename)

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0640)
	if err != nil {
		return fmt.Errorf("create dead-letter file: %w", err)
	}

	gz := gzip.NewWriter(f)

	for _, entry := range entries {
		data, err := json.Marshal(entry)
		if err != nil {
			gz.Close()
			f.Close()
			os.Remove(path)
			return fmt.Errorf("marshal entry: %w", err)
		}
		data = append(data, '\n')
		if _, err := gz.Write(data); err != nil {
			gz.Close()
			f.Close()
			os.Remove(path)
			return fmt.Errorf("write entry: %w", err)
		}
	}

	if err := gz.Close(); err != nil {
		f.Close()
		return fmt.Errorf("close gzip: %w", err)
	}

	if err := f.Sync(); err != nil {
		f.Close()
		return fmt.Errorf("fsync dead-letter: %w", err)
	}

	return f.Close()
}
