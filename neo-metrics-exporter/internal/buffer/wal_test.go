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
	if info.Size() == 0 {
		t.Error("WAL file should not be empty after flush")
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
