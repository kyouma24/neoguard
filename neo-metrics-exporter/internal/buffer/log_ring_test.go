package buffer

import (
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestLogRingWriteAndRead(t *testing.T) {
	ring := NewLogRing(10, 1000, 1024*1024)

	entry1 := model.LogEntry{Message: "test1", Service: "app", Timestamp: time.Now()}
	entry2 := model.LogEntry{Message: "test2", Service: "app", Timestamp: time.Now()}

	if !ring.Write(entry1) {
		t.Fatal("write failed")
	}
	if !ring.Write(entry2) {
		t.Fatal("write failed")
	}

	if ring.Size() != 2 {
		t.Errorf("size = %d, want 2", ring.Size())
	}

	entries := ring.Read(2, 0)
	if len(entries) != 2 {
		t.Errorf("read returned %d entries, want 2", len(entries))
	}
	if entries[0].Message != "test1" {
		t.Errorf("entry[0].Message = %q, want %q", entries[0].Message, "test1")
	}
	if entries[1].Message != "test2" {
		t.Errorf("entry[1].Message = %q, want %q", entries[1].Message, "test2")
	}

	if ring.Size() != 0 {
		t.Errorf("size after read = %d, want 0", ring.Size())
	}
}

func TestLogRingCapacityLimit(t *testing.T) {
	ring := NewLogRing(3, 1000, 1024*1024)

	entry := model.LogEntry{Message: "test", Service: "app", Timestamp: time.Now()}

	for i := 0; i < 3; i++ {
		if !ring.Write(entry) {
			t.Fatalf("write %d failed", i)
		}
	}

	if ring.Write(entry) {
		t.Error("write beyond capacity should fail")
	}

	if ring.Size() != 3 {
		t.Errorf("size = %d, want 3", ring.Size())
	}
}

func TestLogRingDropOldest(t *testing.T) {
	ring := NewLogRing(10, 1000, 1024*1024)

	for i := 0; i < 5; i++ {
		ring.Write(model.LogEntry{Message: "test", Service: "app", Timestamp: time.Now()})
	}

	dropped := ring.DropOldest(2)
	if dropped != 2 {
		t.Errorf("dropped = %d, want 2", dropped)
	}

	if ring.Size() != 3 {
		t.Errorf("size after drop = %d, want 3", ring.Size())
	}
}

func TestLogRingDropOldestEmpty(t *testing.T) {
	ring := NewLogRing(10, 1000, 1024*1024)

	dropped := ring.DropOldest(5)
	if dropped != 0 {
		t.Errorf("dropped from empty ring = %d, want 0", dropped)
	}
}

func TestLogRingReadRespectsMaxBytes(t *testing.T) {
	ring := NewLogRing(100, 1000, 1024*1024)

	for i := 0; i < 10; i++ {
		ring.Write(model.LogEntry{Message: "x", Service: "app", Timestamp: time.Now()})
	}

	// Read with very small maxBytes — should get at least 1 entry
	entries := ring.Read(10, 1)
	if len(entries) != 1 {
		t.Errorf("read with maxBytes=1 returned %d entries, want 1", len(entries))
	}
}

func TestLogRingNotifyOnThresholdCount(t *testing.T) {
	ring := NewLogRing(100, 3, 1024*1024)

	// Write 2 entries — below threshold, no signal
	ring.Write(model.LogEntry{Message: "1", Service: "app", Timestamp: time.Now()})
	ring.Write(model.LogEntry{Message: "2", Service: "app", Timestamp: time.Now()})

	select {
	case <-ring.Notify():
		t.Fatal("notify fired before threshold reached")
	default:
	}

	// Write 3rd entry — hits threshold
	ring.Write(model.LogEntry{Message: "3", Service: "app", Timestamp: time.Now()})

	select {
	case <-ring.Notify():
		// expected
	default:
		t.Error("notify did not fire when count threshold reached")
	}
}

func TestLogRingNotifyOnThresholdBytes(t *testing.T) {
	ring := NewLogRing(100, 1000, 500)

	// Write entries until byte threshold crossed
	entry := model.LogEntry{Message: "large message payload for testing bytes", Service: "app", Timestamp: time.Now()}
	for i := 0; i < 3; i++ {
		ring.Write(entry)
	}

	select {
	case <-ring.Notify():
		// expected — byte threshold should be crossed
	default:
		t.Error("notify did not fire when byte threshold reached")
	}
}
