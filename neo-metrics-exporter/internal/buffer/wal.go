package buffer

import (
	"bufio"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type DiskBuffer struct {
	mu          sync.Mutex
	ring        *Ring
	walPath     string
	walFile     *os.File
	walWriter   *bufio.Writer
	walEntries  int64
	drained     int64
	diskEnabled bool
}

func NewDiskBuffer(maxItems int, walDir string) *DiskBuffer {
	db := &DiskBuffer{
		ring: NewRing(maxItems),
	}

	if walDir == "" {
		return db
	}

	if err := os.MkdirAll(walDir, 0750); err != nil {
		slog.Warn("WAL directory creation failed, using memory-only buffer", "error", err)
		return db
	}

	db.walPath = filepath.Join(walDir, "metrics.wal")

	db.replayWAL()

	f, err := os.OpenFile(db.walPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0640)
	if err != nil {
		slog.Warn("WAL open failed, using memory-only buffer", "error", err)
		return db
	}

	db.walFile = f
	db.walWriter = bufio.NewWriterSize(f, 64*1024)
	db.diskEnabled = true
	slog.Info("disk buffer enabled", "path", db.walPath)

	return db
}

func (db *DiskBuffer) replayWAL() {
	f, err := os.Open(db.walPath)
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		slog.Warn("WAL replay open failed", "error", err)
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 4*1024*1024)

	var total int
	for scanner.Scan() {
		var points []model.MetricPoint
		if err := json.Unmarshal(scanner.Bytes(), &points); err != nil {
			slog.Warn("WAL replay: corrupt entry, skipping", "error", err)
			continue
		}
		db.ring.Push(points)
		total += len(points)
		db.walEntries++
	}

	if err := scanner.Err(); err != nil {
		slog.Warn("WAL replay scanner error", "error", err)
	}

	if total > 0 {
		slog.Info("WAL replay complete", "entries", db.walEntries, "points", total)
	}

	os.Remove(db.walPath)
}

func (db *DiskBuffer) Push(points []model.MetricPoint) {
	if len(points) == 0 {
		return
	}

	db.ring.Push(points)

	if !db.diskEnabled {
		return
	}

	db.mu.Lock()
	defer db.mu.Unlock()

	data, err := json.Marshal(points)
	if err != nil {
		slog.Warn("WAL marshal failed", "error", err)
		return
	}

	if _, err := db.walWriter.Write(data); err != nil {
		slog.Warn("WAL write failed, continuing memory-only", "error", err)
		db.disableDisk()
		return
	}
	if err := db.walWriter.WriteByte('\n'); err != nil {
		slog.Warn("WAL write failed, continuing memory-only", "error", err)
		db.disableDisk()
		return
	}

	db.walEntries++

	if db.walEntries%10 == 0 {
		db.walWriter.Flush()
	}
}

func (db *DiskBuffer) Drain(max int) []model.MetricPoint {
	points := db.ring.Drain(max)

	if db.diskEnabled && len(points) > 0 {
		db.mu.Lock()
		db.drained += int64(len(points))
		if db.drained >= db.walEntries*50/100 {
			db.compactWAL()
		}
		db.mu.Unlock()
	}

	return points
}

func (db *DiskBuffer) compactWAL() {
	if db.walWriter != nil {
		db.walWriter.Flush()
	}
	if db.walFile != nil {
		db.walFile.Close()
	}

	remaining := db.ring.Len()
	if remaining == 0 {
		os.Remove(db.walPath)
	} else {
		tmpPath := db.walPath + ".tmp"
		f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
		if err != nil {
			slog.Warn("WAL compact failed", "error", err)
			db.reopenWAL()
			return
		}

		stats := db.ring.Stats()
		_ = stats
		f.Close()
		os.Remove(db.walPath)
		os.Rename(tmpPath, db.walPath)
	}

	db.walEntries = 0
	db.drained = 0
	db.reopenWAL()
}

func (db *DiskBuffer) reopenWAL() {
	f, err := os.OpenFile(db.walPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0640)
	if err != nil {
		slog.Warn("WAL reopen failed, continuing memory-only", "error", err)
		db.disableDisk()
		return
	}
	db.walFile = f
	db.walWriter = bufio.NewWriterSize(f, 64*1024)
}

func (db *DiskBuffer) disableDisk() {
	db.diskEnabled = false
	if db.walFile != nil {
		db.walFile.Close()
		db.walFile = nil
	}
	db.walWriter = nil
}

func (db *DiskBuffer) Stats() Stats {
	return db.ring.Stats()
}

func (db *DiskBuffer) Len() int {
	return db.ring.Len()
}

func (db *DiskBuffer) Close() error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if db.walWriter != nil {
		db.walWriter.Flush()
	}
	if db.walFile != nil {
		return db.walFile.Close()
	}
	return nil
}
