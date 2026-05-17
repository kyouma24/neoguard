package buffer

import (
	"compress/gzip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestLogDeadLetterWrite(t *testing.T) {
	tmpDir := t.TempDir()
	writer, err := NewLogDeadLetterWriter(tmpDir)
	if err != nil {
		t.Fatalf("NewLogDeadLetterWriter: %v", err)
	}

	entries := []model.LogEntry{
		{Message: "failed1", Service: "app", Timestamp: time.Now()},
		{Message: "failed2", Service: "app", Timestamp: time.Now()},
	}

	if err := writer.Write(entries, 3); err != nil {
		t.Fatalf("Write: %v", err)
	}

	files, err := filepath.Glob(filepath.Join(tmpDir, "*.jsonl.gz"))
	if err != nil {
		t.Fatalf("Glob: %v", err)
	}

	if len(files) != 1 {
		t.Fatalf("expected 1 dead-letter file, got %d", len(files))
	}

	f, err := os.Open(files[0])
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip.NewReader: %v", err)
	}
	defer gz.Close()

	data, err := io.ReadAll(gz)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 {
		t.Errorf("dead-letter file has %d lines, want 2", len(lines))
	}

	var entry model.LogEntry
	if err := json.Unmarshal([]byte(lines[0]), &entry); err != nil {
		t.Errorf("first line is not valid JSON: %v", err)
	}
	if entry.Message != "failed1" {
		t.Errorf("entry.Message = %q, want %q", entry.Message, "failed1")
	}
}

func TestLogDeadLetterWriteMultipleNoCollision(t *testing.T) {
	tmpDir := t.TempDir()
	writer, err := NewLogDeadLetterWriter(tmpDir)
	if err != nil {
		t.Fatalf("NewLogDeadLetterWriter: %v", err)
	}

	batch1 := []model.LogEntry{{Message: "batch1", Service: "app", Timestamp: time.Now()}}
	batch2 := []model.LogEntry{{Message: "batch2", Service: "app", Timestamp: time.Now()}}

	// Write two batches in rapid succession — ULID ensures no collision
	if err := writer.Write(batch1, 1); err != nil {
		t.Fatalf("Write batch1: %v", err)
	}
	if err := writer.Write(batch2, 2); err != nil {
		t.Fatalf("Write batch2: %v", err)
	}

	files, err := filepath.Glob(filepath.Join(tmpDir, "*.jsonl.gz"))
	if err != nil {
		t.Fatalf("Glob: %v", err)
	}

	if len(files) != 2 {
		t.Errorf("expected 2 dead-letter files, got %d", len(files))
	}
}

func TestLogDeadLetterFilenameFormat(t *testing.T) {
	tmpDir := t.TempDir()
	writer, err := NewLogDeadLetterWriter(tmpDir)
	if err != nil {
		t.Fatalf("NewLogDeadLetterWriter: %v", err)
	}

	entries := []model.LogEntry{{Message: "test", Service: "app", Timestamp: time.Now()}}

	if err := writer.Write(entries, 3); err != nil {
		t.Fatalf("Write: %v", err)
	}

	files, err := filepath.Glob(filepath.Join(tmpDir, "*.jsonl.gz"))
	if err != nil {
		t.Fatalf("Glob: %v", err)
	}

	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(files))
	}

	// Format: <timestamp_millis>-<ULID>-<retryCount>.jsonl.gz
	basename := filepath.Base(files[0])
	pattern := regexp.MustCompile(`^\d+-[A-Z0-9]+-3\.jsonl\.gz$`)
	if !pattern.MatchString(basename) {
		t.Errorf("filename %q does not match expected pattern <millis>-<ULID>-3.jsonl.gz", basename)
	}
}
