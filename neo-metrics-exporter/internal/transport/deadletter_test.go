package transport

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func dlTestPoints(n int) []model.MetricPoint {
	pts := make([]model.MetricPoint, n)
	for i := range pts {
		pts[i] = model.NewGauge("test.deadletter.metric", float64(i), map[string]string{"host": "test"})
	}
	return pts
}

func dlConfig(dir string) config.DeadLetterConfig {
	return config.DeadLetterConfig{
		Enabled:    true,
		Dir:        dir,
		MaxFiles:   100,
		MaxTotalMB: 200,
		DropPolicy: "oldest_first",
	}
}

// Test 2: 503 forever → batch hits retry_count=3, dead-letter file created.
func TestDeadLetterWriteOnRetriesExhausted(t *testing.T) {
	dir := t.TempDir()
	w := NewDeadLetterWriter(dlConfig(dir), "agent-test-001", "1.0.0")

	points := dlTestPoints(100)
	err := w.Write(points, 3, ReasonRetriesExhausted, "max retries exceeded: connection refused")
	if err != nil {
		t.Fatal(err)
	}

	// Verify file exists
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected 1 dead-letter file, got %d", len(entries))
	}

	filename := entries[0].Name()
	if !strings.HasSuffix(filename, ".jsonl.gz") {
		t.Errorf("unexpected filename: %s", filename)
	}
	if !strings.Contains(filename, "-3-") {
		t.Errorf("filename should contain retry count: %s", filename)
	}

	// Verify file contents
	f, _ := os.Open(filepath.Join(dir, filename))
	defer f.Close()
	gz, _ := gzip.NewReader(f)
	data, _ := io.ReadAll(gz)
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")

	// First line is metadata
	if len(lines) != 101 { // 1 meta + 100 points
		t.Errorf("expected 101 lines, got %d", len(lines))
	}

	var metaWrapper struct {
		Meta DeadLetterMeta `json:"_dead_letter_meta"`
	}
	if err := json.Unmarshal([]byte(lines[0]), &metaWrapper); err != nil {
		t.Fatal("failed to parse meta line:", err)
	}

	meta := metaWrapper.Meta
	if meta.AgentID != "agent-test-001" {
		t.Errorf("agent_id = %q", meta.AgentID)
	}
	if meta.AgentVersion != "1.0.0" {
		t.Errorf("agent_version = %q", meta.AgentVersion)
	}
	if meta.RetryCount != 3 {
		t.Errorf("retry_count = %d", meta.RetryCount)
	}
	if meta.Reason != ReasonRetriesExhausted {
		t.Errorf("reason = %q", meta.Reason)
	}
	if meta.PointCount != 100 {
		t.Errorf("point_count = %d", meta.PointCount)
	}
	if meta.LastError != "max retries exceeded: connection refused" {
		t.Errorf("last_error = %q", meta.LastError)
	}

	if w.FilesWritten() != 1 {
		t.Errorf("files_written = %d", w.FilesWritten())
	}
}

// Test 5: Startup scan with pre-populated dead-letter files.
func TestDeadLetterScanExisting(t *testing.T) {
	dir := t.TempDir()

	// Pre-populate 5 files
	for i := 0; i < 5; i++ {
		filename := fmt.Sprintf("%d-%d.jsonl.gz", time.Now().UnixMilli()+int64(i), 1)
		f, _ := os.Create(filepath.Join(dir, filename))
		f.Close()
	}

	w := NewDeadLetterWriter(dlConfig(dir), "agent-001", "1.0.0")
	count := w.ScanExisting()
	if count != 5 {
		t.Errorf("scan existing = %d, want 5", count)
	}
}

// Test 6: Dead-letter dir at max_files cap → oldest file evicted.
func TestDeadLetterMaxFilesEviction(t *testing.T) {
	dir := t.TempDir()
	cfg := dlConfig(dir)
	cfg.MaxFiles = 3

	w := NewDeadLetterWriter(cfg, "agent-001", "1.0.0")

	// Write 4 files — should evict the oldest
	for i := 0; i < 4; i++ {
		time.Sleep(2 * time.Millisecond) // ensure different timestamps
		err := w.Write(dlTestPoints(10), 3, ReasonRetriesExhausted, "error")
		if err != nil {
			t.Fatal(err)
		}
	}

	entries, _ := os.ReadDir(dir)
	var files []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".jsonl.gz") {
			files = append(files, e.Name())
		}
	}

	if len(files) > 3 {
		t.Errorf("expected max 3 files after eviction, got %d", len(files))
	}

	if w.FilesDropped() == 0 {
		t.Error("expected at least 1 file dropped due to max_files cap")
	}
}

// Test 7 (partial): Permanent error should NOT produce dead-letter.
// The actual logic is in agent.go (permanent → drop, not dead-letter).
// This test verifies disabled writer doesn't write.
func TestDeadLetterDisabledDoesNotWrite(t *testing.T) {
	dir := t.TempDir()
	cfg := dlConfig(dir)
	cfg.Enabled = false

	w := NewDeadLetterWriter(cfg, "agent-001", "1.0.0")
	err := w.Write(dlTestPoints(10), 3, ReasonRetriesExhausted, "error")
	if err != nil {
		t.Fatal(err)
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Errorf("disabled writer should not create files, got %d", len(entries))
	}
}

// Test 8: Shutdown dead-letter has reason=shutdown_undelivered.
func TestDeadLetterShutdownReason(t *testing.T) {
	dir := t.TempDir()
	w := NewDeadLetterWriter(dlConfig(dir), "agent-001", "1.0.0")

	err := w.Write(dlTestPoints(50), 0, ReasonShutdownUndelivered, "context deadline exceeded")
	if err != nil {
		t.Fatal(err)
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected 1 file, got %d", len(entries))
	}

	f, _ := os.Open(filepath.Join(dir, entries[0].Name()))
	defer f.Close()
	gz, _ := gzip.NewReader(f)
	data, _ := io.ReadAll(gz)
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")

	var metaWrapper struct {
		Meta DeadLetterMeta `json:"_dead_letter_meta"`
	}
	json.Unmarshal([]byte(lines[0]), &metaWrapper)

	if metaWrapper.Meta.Reason != ReasonShutdownUndelivered {
		t.Errorf("reason = %q, want shutdown_undelivered", metaWrapper.Meta.Reason)
	}
	if metaWrapper.Meta.RetryCount != 0 {
		t.Errorf("retry_count = %d, want 0 for shutdown", metaWrapper.Meta.RetryCount)
	}
}

// Test: File format is replay-compatible (after stripping meta line).
func TestDeadLetterFormatReplayCompatible(t *testing.T) {
	dir := t.TempDir()
	w := NewDeadLetterWriter(dlConfig(dir), "agent-001", "1.0.0")

	original := dlTestPoints(5)
	w.Write(original, 3, ReasonRetriesExhausted, "error")

	entries, _ := os.ReadDir(dir)
	f, _ := os.Open(filepath.Join(dir, entries[0].Name()))
	defer f.Close()
	gz, _ := gzip.NewReader(f)
	data, _ := io.ReadAll(gz)
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")

	// Skip meta line (line 0), parse remaining as MetricPoints
	for i := 1; i < len(lines); i++ {
		var p model.MetricPoint
		if err := json.Unmarshal([]byte(lines[i]), &p); err != nil {
			t.Fatalf("line %d not valid MetricPoint JSON: %v", i, err)
		}
		if p.Name != "test.deadletter.metric" {
			t.Errorf("line %d: name = %q", i, p.Name)
		}
	}
}

func TestDeadLetterMetrics_AllPresent(t *testing.T) {
	dir := t.TempDir()
	cfg := config.DeadLetterConfig{
		Enabled:    true,
		Dir:        dir,
		MaxFiles:   10,
		MaxTotalMB: 100,
	}
	w := NewDeadLetterWriter(cfg, "test-agent", "1.0.0")

	metrics := w.Metrics(map[string]string{"test": "tag"})
	if len(metrics) != 2 {
		t.Fatalf("expected 2 metrics, got %d", len(metrics))
	}

	expectedNames := map[string]bool{
		"agent.dead_letter.files_written_total": false,
		"agent.dead_letter.files_evicted_total": false,
	}

	for _, m := range metrics {
		if _, ok := expectedNames[m.Name]; ok {
			expectedNames[m.Name] = true
		}
	}

	for name, found := range expectedNames {
		if !found {
			t.Errorf("missing metric: %s", name)
		}
	}
}

func TestDeadLetterMetrics_FilesWritten(t *testing.T) {
	dir := t.TempDir()
	cfg := config.DeadLetterConfig{
		Enabled:    true,
		Dir:        dir,
		MaxFiles:   10,
		MaxTotalMB: 100,
	}
	w := NewDeadLetterWriter(cfg, "test-agent", "1.0.0")

	// Write N files
	numFiles := 3
	for i := 0; i < numFiles; i++ {
		points := []model.MetricPoint{
			model.NewGauge("test.metric", float64(i), map[string]string{}),
		}
		if err := w.Write(points, 0, ReasonRetriesExhausted, "test error"); err != nil {
			t.Fatalf("Write() failed: %v", err)
		}
	}

	metrics := w.Metrics(map[string]string{})
	var writtenMetric *model.MetricPoint
	for i := range metrics {
		if metrics[i].Name == "agent.dead_letter.files_written_total" {
			writtenMetric = &metrics[i]
			break
		}
	}

	if writtenMetric == nil {
		t.Fatal("agent.dead_letter.files_written_total not found")
	}

	if int(writtenMetric.Value) != numFiles {
		t.Errorf("files_written_total = %f, want %d", writtenMetric.Value, numFiles)
	}
}

func TestDeadLetterMetrics_FilesEvicted(t *testing.T) {
	dir := t.TempDir()
	cfg := config.DeadLetterConfig{
		Enabled:    true,
		Dir:        dir,
		MaxFiles:   3,
		MaxTotalMB: 100,
	}
	w := NewDeadLetterWriter(cfg, "test-agent", "1.0.0")

	// Write more than MaxFiles to trigger eviction
	for i := 0; i < 5; i++ {
		points := []model.MetricPoint{
			model.NewGauge("test.metric", float64(i), map[string]string{}),
		}
		if err := w.Write(points, 0, ReasonRetriesExhausted, "test error"); err != nil {
			t.Fatalf("Write() failed on iteration %d: %v", i, err)
		}
	}

	metrics := w.Metrics(map[string]string{})
	var evictedMetric *model.MetricPoint
	for i := range metrics {
		if metrics[i].Name == "agent.dead_letter.files_evicted_total" {
			evictedMetric = &metrics[i]
			break
		}
	}

	if evictedMetric == nil {
		t.Fatal("agent.dead_letter.files_evicted_total not found")
	}

	// Should have evicted at least 2 files (5 written - 3 max)
	if evictedMetric.Value < 2 {
		t.Errorf("files_evicted_total = %f, expected >= 2 after exceeding MaxFiles", evictedMetric.Value)
	}

	// Test tag preservation
	testTags := map[string]string{"hostname": "test-host", "cloud_provider": "aws"}
	metricsWithTags := w.Metrics(testTags)

	for _, m := range metricsWithTags {
		if m.Tags["hostname"] != "test-host" {
			t.Errorf("metric %s missing or wrong hostname tag", m.Name)
		}
		if m.Tags["cloud_provider"] != "aws" {
			t.Errorf("metric %s missing or wrong cloud_provider tag", m.Name)
		}

		// Verify counter type
		if m.MetricType != model.MetricCounter {
			t.Errorf("%s should be counter, got %s", m.Name, m.MetricType)
		}
	}
}
