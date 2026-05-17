package buffer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/oklog/ulid/v2"
)

// spoolFilePattern parses filenames like: 1716000000000-01HXYZ...-r0.jsonl
var spoolFilePattern = regexp.MustCompile(`^(\d+)-([A-Z0-9]+)-r(\d+)\.jsonl$`)

// LogSpool manages sealed JSONL files in logs-spool/ directory.
// Each WriteBatch creates one sealed file (no persistent current file).
// Retry count is encoded in the filename for lifecycle tracking.
type LogSpool struct {
	mu            sync.Mutex
	dir           string
	maxSpoolBytes int64
	highWatermark int64
	critWatermark int64

	highWatermarkFlag atomic.Bool
	critWatermarkFlag atomic.Bool
}

func NewLogSpool(dir string, cfg config.SpoolConfig) (*LogSpool, error) {
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("create spool dir: %w", err)
	}

	maxBytes := int64(cfg.MaxSizeMB) * 1024 * 1024
	highWatermark := maxBytes * int64(cfg.HighWatermarkPct) / 100
	critWatermark := maxBytes * int64(cfg.CriticalWatermarkPct) / 100

	s := &LogSpool{
		dir:           dir,
		maxSpoolBytes: maxBytes,
		highWatermark: highWatermark,
		critWatermark: critWatermark,
	}

	s.updatePressureFlags()
	return s, nil
}

// WriteBatch creates a sealed spool file containing the entries.
// The file is fsynced and closed before returning, making it immediately loadable.
func (s *LogSpool) WriteBatch(entries []model.LogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	timestamp := time.Now().UnixMilli()
	id := ulid.Make()
	filename := fmt.Sprintf("%d-%s-r0.jsonl", timestamp, id.String())
	path := filepath.Join(s.dir, filename)

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0640)
	if err != nil {
		return fmt.Errorf("create spool file: %w", err)
	}

	for _, entry := range entries {
		data, err := json.Marshal(entry)
		if err != nil {
			f.Close()
			os.Remove(path)
			return fmt.Errorf("marshal entry: %w", err)
		}
		data = append(data, '\n')
		if _, err := f.Write(data); err != nil {
			f.Close()
			os.Remove(path)
			return fmt.Errorf("write entry: %w", err)
		}
	}

	if err := f.Sync(); err != nil {
		f.Close()
		return fmt.Errorf("fsync: %w", err)
	}

	if err := f.Close(); err != nil {
		return fmt.Errorf("close spool file: %w", err)
	}

	s.updatePressureFlags()
	return nil
}

// LoadOldest returns entries from the oldest sealed spool file, its path, and its retry count.
func (s *LogSpool) LoadOldest() ([]model.LogEntry, string, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	files, err := s.listFiles()
	if err != nil {
		return nil, "", 0, err
	}

	if len(files) == 0 {
		return nil, "", 0, nil
	}

	path := files[0]
	entries, err := s.readFile(path)
	if err != nil {
		return nil, "", 0, fmt.Errorf("read %s: %w", path, err)
	}

	retryCount := s.parseRetryCount(filepath.Base(path))
	return entries, path, retryCount, nil
}

// IncrementRetry renames a spool file to increment its retry count.
// Returns the new path and new retry count.
func (s *LogSpool) IncrementRetry(path string) (string, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	basename := filepath.Base(path)
	matches := spoolFilePattern.FindStringSubmatch(basename)
	if matches == nil {
		return "", 0, fmt.Errorf("cannot parse spool filename: %s", basename)
	}

	currentRetry, _ := strconv.Atoi(matches[3])
	newRetry := currentRetry + 1

	newFilename := fmt.Sprintf("%s-%s-r%d.jsonl", matches[1], matches[2], newRetry)
	newPath := filepath.Join(s.dir, newFilename)

	if err := os.Rename(path, newPath); err != nil {
		return "", 0, fmt.Errorf("rename spool file: %w", err)
	}

	return newPath, newRetry, nil
}

func (s *LogSpool) DeleteFile(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete spool file: %w", err)
	}

	s.updatePressureFlags()
	return nil
}

func (s *LogSpool) readFile(path string) ([]model.LogEntry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var entries []model.LogEntry
	decoder := json.NewDecoder(bytes.NewReader(data))
	for {
		var entry model.LogEntry
		if err := decoder.Decode(&entry); err == io.EOF {
			break
		} else if err != nil {
			return nil, fmt.Errorf("decode entry: %w", err)
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

func (s *LogSpool) listFiles() ([]string, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("read spool dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if spoolFilePattern.MatchString(e.Name()) {
			files = append(files, filepath.Join(s.dir, e.Name()))
		}
	}

	sort.Strings(files)
	return files, nil
}

func (s *LogSpool) parseRetryCount(basename string) int {
	matches := spoolFilePattern.FindStringSubmatch(basename)
	if matches == nil {
		return 0
	}
	n, _ := strconv.Atoi(matches[3])
	return n
}

func (s *LogSpool) SizeBytes() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sizeBytes()
}

func (s *LogSpool) sizeBytes() int64 {
	files, err := s.listFiles()
	if err != nil {
		return 0
	}

	var total int64
	for _, f := range files {
		info, err := os.Stat(f)
		if err != nil {
			continue
		}
		total += info.Size()
	}
	return total
}

func (s *LogSpool) updatePressureFlags() {
	total := s.sizeBytes()
	s.highWatermarkFlag.Store(total >= s.highWatermark)
	s.critWatermarkFlag.Store(total >= s.critWatermark)
}

// IsHighWatermark returns true if spool is above 80%. Tailers slow down per §9.1.2.
func (s *LogSpool) IsHighWatermark() bool {
	return s.highWatermarkFlag.Load()
}

// IsCriticalWatermark returns true if spool is above 95%. Drop from LogRing per §9.1.3.
func (s *LogSpool) IsCriticalWatermark() bool {
	return s.critWatermarkFlag.Load()
}

func (s *LogSpool) Close() error {
	return nil
}
