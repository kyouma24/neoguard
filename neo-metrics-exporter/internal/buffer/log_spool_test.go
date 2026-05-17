package buffer

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestLogSpoolWriteAndLoad(t *testing.T) {
	tmpDir := t.TempDir()
	spool, err := NewLogSpool(tmpDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	if err != nil {
		t.Fatalf("NewLogSpool: %v", err)
	}
	defer spool.Close()

	entries := []model.LogEntry{
		{Message: "test1", Service: "app", Timestamp: time.Now()},
		{Message: "test2", Service: "app", Timestamp: time.Now()},
	}

	if err := spool.WriteBatch(entries); err != nil {
		t.Fatalf("WriteBatch: %v", err)
	}

	loaded, path, retryCount, err := spool.LoadOldest()
	if err != nil {
		t.Fatalf("LoadOldest: %v", err)
	}
	if loaded == nil {
		t.Fatal("LoadOldest returned nil")
	}
	if len(loaded) != 2 {
		t.Errorf("loaded %d entries, want 2", len(loaded))
	}
	if loaded[0].Message != "test1" {
		t.Errorf("entry[0].Message = %q, want %q", loaded[0].Message, "test1")
	}
	if path == "" {
		t.Error("LoadOldest returned empty path")
	}
	if retryCount != 0 {
		t.Errorf("retryCount = %d, want 0", retryCount)
	}

	if err := spool.DeleteFile(path); err != nil {
		t.Errorf("DeleteFile: %v", err)
	}

	loaded2, _, _, err := spool.LoadOldest()
	if err != nil {
		t.Errorf("LoadOldest after delete: %v", err)
	}
	if loaded2 != nil {
		t.Errorf("LoadOldest after delete returned %d entries, want nil", len(loaded2))
	}
}

func TestLogSpoolIncrementRetry(t *testing.T) {
	tmpDir := t.TempDir()
	spool, err := NewLogSpool(tmpDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	if err != nil {
		t.Fatalf("NewLogSpool: %v", err)
	}
	defer spool.Close()

	entries := []model.LogEntry{
		{Message: "test", Service: "app", Timestamp: time.Now()},
	}

	if err := spool.WriteBatch(entries); err != nil {
		t.Fatalf("WriteBatch: %v", err)
	}

	_, path, retryCount, err := spool.LoadOldest()
	if err != nil {
		t.Fatalf("LoadOldest: %v", err)
	}
	if retryCount != 0 {
		t.Fatalf("initial retryCount = %d, want 0", retryCount)
	}

	newPath, newRetry, err := spool.IncrementRetry(path)
	if err != nil {
		t.Fatalf("IncrementRetry: %v", err)
	}
	if newRetry != 1 {
		t.Errorf("newRetry = %d, want 1", newRetry)
	}
	if newPath == "" {
		t.Fatal("IncrementRetry returned empty path")
	}
	if newPath == path {
		t.Error("IncrementRetry returned same path")
	}

	// Load again and verify retry count
	_, _, retryCount2, err := spool.LoadOldest()
	if err != nil {
		t.Fatalf("LoadOldest after increment: %v", err)
	}
	if retryCount2 != 1 {
		t.Errorf("retryCount after increment = %d, want 1", retryCount2)
	}
}

func TestLogSpoolSealPerBatch(t *testing.T) {
	tmpDir := t.TempDir()
	spool, err := NewLogSpool(tmpDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	if err != nil {
		t.Fatalf("NewLogSpool: %v", err)
	}
	defer spool.Close()

	// Write two batches — should create two separate sealed files
	batch1 := []model.LogEntry{{Message: "batch1", Service: "app", Timestamp: time.Now()}}
	batch2 := []model.LogEntry{{Message: "batch2", Service: "app", Timestamp: time.Now()}}

	if err := spool.WriteBatch(batch1); err != nil {
		t.Fatalf("WriteBatch 1: %v", err)
	}
	time.Sleep(1 * time.Millisecond)
	if err := spool.WriteBatch(batch2); err != nil {
		t.Fatalf("WriteBatch 2: %v", err)
	}

	files, err := filepath.Glob(filepath.Join(tmpDir, "*.jsonl"))
	if err != nil {
		t.Fatalf("Glob: %v", err)
	}
	if len(files) != 2 {
		t.Errorf("expected 2 sealed files, got %d", len(files))
	}
}

func TestLogSpoolHighWatermarkFlag(t *testing.T) {
	tmpDir := t.TempDir()
	spool, err := NewLogSpool(tmpDir, config.SpoolConfig{MaxSizeMB: 1, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	if err != nil {
		t.Fatalf("NewLogSpool: %v", err)
	}
	defer spool.Close()

	if spool.IsHighWatermark() {
		t.Error("IsHighWatermark() = true initially, want false")
	}

	largeEntry := model.LogEntry{
		Message:   strings.Repeat("x", 100*1024),
		Service:   "app",
		Timestamp: time.Now(),
	}

	for i := 0; i < 9; i++ {
		if err := spool.WriteBatch([]model.LogEntry{largeEntry}); err != nil {
			t.Fatalf("WriteBatch: %v", err)
		}
	}

	if !spool.IsHighWatermark() {
		t.Errorf("IsHighWatermark() = false after 900KB write, want true (watermark 800KB)")
	}
}

func TestLogSpoolCriticalWatermarkFlag(t *testing.T) {
	tmpDir := t.TempDir()
	spool, err := NewLogSpool(tmpDir, config.SpoolConfig{MaxSizeMB: 1, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	if err != nil {
		t.Fatalf("NewLogSpool: %v", err)
	}
	defer spool.Close()

	if spool.IsCriticalWatermark() {
		t.Error("IsCriticalWatermark() = true initially, want false")
	}

	largeEntry := model.LogEntry{
		Message:   strings.Repeat("x", 100*1024),
		Service:   "app",
		Timestamp: time.Now(),
	}

	for i := 0; i < 10; i++ {
		if err := spool.WriteBatch([]model.LogEntry{largeEntry}); err != nil {
			t.Fatalf("WriteBatch: %v", err)
		}
	}

	if !spool.IsCriticalWatermark() {
		t.Errorf("IsCriticalWatermark() = false after 1000KB write, want true (watermark 972KB)")
	}
}

func TestLogSpoolSizeBytes(t *testing.T) {
	tmpDir := t.TempDir()
	spool, err := NewLogSpool(tmpDir, config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95})
	if err != nil {
		t.Fatalf("NewLogSpool: %v", err)
	}
	defer spool.Close()

	if spool.SizeBytes() != 0 {
		t.Errorf("initial size = %d, want 0", spool.SizeBytes())
	}

	entries := []model.LogEntry{
		{Message: strings.Repeat("x", 1000), Service: "app", Timestamp: time.Now()},
	}

	if err := spool.WriteBatch(entries); err != nil {
		t.Fatalf("WriteBatch: %v", err)
	}

	if spool.SizeBytes() == 0 {
		t.Error("size after write = 0, want > 0")
	}
}
