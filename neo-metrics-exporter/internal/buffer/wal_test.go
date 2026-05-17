package buffer

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func testPoints(n int) []model.MetricPoint {
	pts := make([]model.MetricPoint, n)
	for i := range pts {
		pts[i] = model.NewGauge("test.metric", float64(i), map[string]string{"i": "v"})
	}
	return pts
}

func TestDiskBufferMemoryOnly(t *testing.T) {
	db := NewDiskBuffer(1000, "")
	db.Push(testPoints(10))
	if db.Len() != 10 {
		t.Errorf("len = %d, want 10", db.Len())
	}
	pts := db.Drain(5)
	if len(pts) != 5 {
		t.Errorf("drained = %d, want 5", len(pts))
	}
	if db.Len() != 5 {
		t.Errorf("remaining = %d, want 5", db.Len())
	}
}

func TestDiskBufferWriteAndDrain(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)

	for i := 0; i < 15; i++ {
		db.Push(testPoints(5))
	}
	if db.Len() != 75 {
		t.Errorf("len = %d, want 75", db.Len())
	}

	db.Close()

	walPath := filepath.Join(dir, "metrics.wal")
	info, err := os.Stat(walPath)
	if err != nil {
		t.Fatal("WAL file should exist:", err)
	}
	if info.Size() <= walHeaderSize {
		t.Error("WAL file should have data beyond header after flush")
	}
}

func TestDiskBufferReplayOnRestart(t *testing.T) {
	dir := t.TempDir()

	db1 := NewDiskBuffer(1000, dir)
	db1.Push(testPoints(15))
	db1.Close()

	if db1.Len() != 15 {
		t.Fatalf("first instance len = %d, want 15", db1.Len())
	}

	db2 := NewDiskBuffer(1000, dir)
	defer db2.Close()

	if db2.Len() != 15 {
		t.Errorf("replayed len = %d, want 15", db2.Len())
	}

	pts := db2.Drain(15)
	if len(pts) != 15 {
		t.Errorf("drained after replay = %d, want 15", len(pts))
	}
}

func TestDiskBufferReplayEmpty(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	defer db.Close()

	if db.Len() != 0 {
		t.Errorf("empty dir replay: len = %d", db.Len())
	}
}

func TestDiskBufferStats(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	defer db.Close()

	db.Push(testPoints(10))
	db.Push(testPoints(5))

	stats := db.Stats()
	if stats.Items != 15 {
		t.Errorf("items = %d, want 15", stats.Items)
	}
	if stats.Batches != 2 {
		t.Errorf("batches = %d, want 2", stats.Batches)
	}
}

func TestDiskBufferFallsBackOnBadDir(t *testing.T) {
	dir := t.TempDir()
	roFile := filepath.Join(dir, "blockdir")
	os.WriteFile(roFile, []byte("x"), 0600)

	db := NewDiskBuffer(1000, roFile)
	db.Push(testPoints(5))
	if db.Len() != 5 {
		t.Errorf("len = %d, want 5 (memory fallback)", db.Len())
	}
	if db.diskEnabled {
		t.Error("disk should be disabled when dir is a file")
	}
}

func TestDiskBufferClose(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	db.Push(testPoints(5))
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestDiskBufferPushEmpty(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	defer db.Close()
	db.Push(nil)
	db.Push([]model.MetricPoint{})
	if db.Len() != 0 {
		t.Errorf("len = %d after empty pushes", db.Len())
	}
}

func TestDiskBufferLargeReplay(t *testing.T) {
	dir := t.TempDir()

	db1 := NewDiskBuffer(100000, dir)
	for i := 0; i < 100; i++ {
		db1.Push(testPoints(50))
	}
	db1.Close()

	db2 := NewDiskBuffer(100000, dir)
	defer db2.Close()

	if db2.Len() != 5000 {
		t.Errorf("large replay len = %d, want 5000", db2.Len())
	}
}

func TestDiskBufferOverflow(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(100, dir)
	defer db.Close()

	db.Push(testPoints(80))
	db.Push(testPoints(80))

	if db.Len() > 100 {
		t.Errorf("len = %d, should not exceed max 100", db.Len())
	}

	stats := db.Stats()
	if stats.Dropped == 0 {
		t.Error("should have dropped some points")
	}
}

func TestDiskBufferWALStats(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(10000, dir)
	defer db.Close()

	db.Push(testPoints(10))
	db.Push(testPoints(10))

	ws := db.WALStats()
	if !ws.DiskEnabled {
		t.Error("disk should be enabled")
	}
	if ws.SizeBytes <= walHeaderSize {
		t.Errorf("WAL size should be > header after writes, got %d", ws.SizeBytes)
	}
	if ws.FramesWritten != 2 {
		t.Errorf("frames written = %d, want 2", ws.FramesWritten)
	}
}

func TestDiskBufferHighWatermark(t *testing.T) {
	dir := t.TempDir()
	cfg := WALConfig{
		Dir:                  dir,
		MaxSizeMB:            1,
		HighWatermarkPct:     80,
		CriticalWatermarkPct: 95,
	}

	db := NewDiskBufferWithConfig(100000, cfg)
	defer db.Close()

	// Initially not at high watermark
	if db.IsAtHighWatermark() {
		t.Error("should not be at high watermark initially")
	}
}

func TestDiskBufferMetrics_AllPresent(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	defer db.Close()

	db.Push(testPoints(10))

	metrics := db.Metrics(map[string]string{"test": "tag"})
	if len(metrics) != 5 {
		t.Fatalf("expected 5 metrics, got %d", len(metrics))
	}

	expectedNames := map[string]bool{
		"agent.wal.size_bytes":             false,
		"agent.wal.frames_total":           false,
		"agent.wal.corrupted_frames_total": false,
		"agent.wal.write_rejections_total": false,
		"agent.wal.dropped_points_total":   false,
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

func TestDiskBufferMetrics_SizeBytes(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	defer db.Close()

	db.Push(testPoints(50))
	db.Close()

	walStats := db.WALStats()
	metrics := db.Metrics(map[string]string{})

	var sizeMetric *model.MetricPoint
	for i := range metrics {
		if metrics[i].Name == "agent.wal.size_bytes" {
			sizeMetric = &metrics[i]
			break
		}
	}

	if sizeMetric == nil {
		t.Fatal("agent.wal.size_bytes not found")
	}

	if sizeMetric.Value != float64(walStats.SizeBytes) {
		t.Errorf("size_bytes = %f, want %f", sizeMetric.Value, float64(walStats.SizeBytes))
	}
}

func TestDiskBufferMetrics_FramesWritten(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	defer db.Close()

	numPushes := 5
	for i := 0; i < numPushes; i++ {
		db.Push(testPoints(10))
	}

	metrics := db.Metrics(map[string]string{})
	var framesMetric *model.MetricPoint
	for i := range metrics {
		if metrics[i].Name == "agent.wal.frames_total" {
			framesMetric = &metrics[i]
			break
		}
	}

	if framesMetric == nil {
		t.Fatal("agent.wal.frames_total not found")
	}

	if int(framesMetric.Value) != numPushes {
		t.Errorf("frames_total = %f, want %d", framesMetric.Value, numPushes)
	}
}

func TestDiskBufferMetrics_WriteRejections(t *testing.T) {
	dir := t.TempDir()
	cfg := WALConfig{
		Dir:                  dir,
		MaxSizeMB:            1, // 1MB limit
		HighWatermarkPct:     80,
		CriticalWatermarkPct: 95,
	}
	db := NewDiskBufferWithConfig(10000, cfg)
	defer db.Close()

	// Write enough data to definitely exceed 1MB and trigger capacity rejection
	// Each testPoints(100) creates ~100 points, each with name/value/tags
	// Keep writing until we hit capacity
	for i := 0; i < 200; i++ {
		db.Push(testPoints(100))
		// Check if we've hit capacity
		if db.WALStats().WriteRejections > 0 {
			break
		}
	}

	metrics := db.Metrics(map[string]string{})
	var rejectionsMetric *model.MetricPoint
	for i := range metrics {
		if metrics[i].Name == "agent.wal.write_rejections_total" {
			rejectionsMetric = &metrics[i]
			break
		}
	}

	if rejectionsMetric == nil {
		t.Fatal("agent.wal.write_rejections_total not found")
	}

	if rejectionsMetric.Value <= 0 {
		t.Errorf("write_rejections_total = %f, expected > 0 after exceeding 1MB capacity", rejectionsMetric.Value)
	}
}

func TestDiskBufferMetrics_Types(t *testing.T) {
	dir := t.TempDir()
	db := NewDiskBuffer(1000, dir)
	defer db.Close()

	db.Push(testPoints(10))

	// Test tag preservation
	testTags := map[string]string{"hostname": "test-host", "agent_version": "1.0.0"}
	metrics := db.Metrics(testTags)

	for _, m := range metrics {
		// Verify tag preservation
		if m.Tags["hostname"] != "test-host" {
			t.Errorf("metric %s missing or wrong hostname tag", m.Name)
		}
		if m.Tags["agent_version"] != "1.0.0" {
			t.Errorf("metric %s missing or wrong agent_version tag", m.Name)
		}

		// Verify types
		switch m.Name {
		case "agent.wal.size_bytes":
			if m.MetricType != model.MetricGauge {
				t.Errorf("%s should be gauge, got %s", m.Name, m.MetricType)
			}
		case "agent.wal.frames_total", "agent.wal.corrupted_frames_total",
			"agent.wal.write_rejections_total", "agent.wal.dropped_points_total":
			if m.MetricType != model.MetricCounter {
				t.Errorf("%s should be counter, got %s", m.Name, m.MetricType)
			}
		}
	}
}
