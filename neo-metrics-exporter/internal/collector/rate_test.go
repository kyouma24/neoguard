package collector

import (
	"math"
	"testing"
	"time"
)

func TestRateComputerFirstSample(t *testing.T) {
	rc := NewRateComputer()
	_, ok := rc.Compute("test", 100)
	if ok {
		t.Error("first sample should return false")
	}
}

func TestRateComputerSecondSample(t *testing.T) {
	rc := NewRateComputer()
	rc.Compute("test", 100)

	rc.mu.Lock()
	s := rc.samples["test"]
	s.value = 100
	s.ts = time.Now().Add(-10 * time.Second)
	rc.samples["test"] = s
	rc.mu.Unlock()

	rate, ok := rc.Compute("test", 200)
	if !ok {
		t.Fatal("second sample should return true")
	}
	if math.Abs(rate-10.0) > 1.0 {
		t.Errorf("rate = %f, want ~10.0", rate)
	}
}

func TestRateComputerCounterReset(t *testing.T) {
	rc := NewRateComputer()
	rc.Compute("test", 1000)

	rc.mu.Lock()
	s := rc.samples["test"]
	s.value = 1000
	s.ts = time.Now().Add(-10 * time.Second)
	rc.samples["test"] = s
	rc.mu.Unlock()

	_, ok := rc.Compute("test", 50)
	if ok {
		t.Error("counter reset should return false")
	}
}

func TestRateComputerMultipleKeys(t *testing.T) {
	rc := NewRateComputer()
	rc.Compute("disk.sda", 100)
	rc.Compute("disk.sdb", 500)

	rc.mu.Lock()
	sa := rc.samples["disk.sda"]
	sa.value = 100
	sa.ts = time.Now().Add(-10 * time.Second)
	rc.samples["disk.sda"] = sa
	sb := rc.samples["disk.sdb"]
	sb.value = 500
	sb.ts = time.Now().Add(-10 * time.Second)
	rc.samples["disk.sdb"] = sb
	rc.mu.Unlock()

	rateA, okA := rc.Compute("disk.sda", 200)
	rateB, okB := rc.Compute("disk.sdb", 1500)

	if !okA || !okB {
		t.Fatal("both should return true")
	}
	if math.Abs(rateA-10.0) > 1.0 {
		t.Errorf("sda rate = %f", rateA)
	}
	if math.Abs(rateB-100.0) > 10.0 {
		t.Errorf("sdb rate = %f", rateB)
	}
}

func TestRateComputerReset(t *testing.T) {
	rc := NewRateComputer()
	rc.Compute("test", 100)
	rc.Reset()

	_, ok := rc.Compute("test", 200)
	if ok {
		t.Error("after reset, first sample should return false")
	}
}

func TestRateComputerEvictsStaleKeys(t *testing.T) {
	rc := NewRateComputer()
	rc.staleTTL = 50 * time.Millisecond

	rc.Compute("alive", 1)
	rc.Compute("stale", 1)

	rc.mu.Lock()
	s := rc.samples["stale"]
	s.lastSeen = time.Now().Add(-100 * time.Millisecond)
	rc.samples["stale"] = s
	rc.callCount = evictCheckInterval - 1
	rc.mu.Unlock()

	rc.Compute("alive", 2)

	if rc.Len() != 1 {
		t.Errorf("expected 1 key after eviction, got %d", rc.Len())
	}
	rc.mu.Lock()
	_, staleExists := rc.samples["stale"]
	_, aliveExists := rc.samples["alive"]
	rc.mu.Unlock()
	if staleExists {
		t.Error("stale key should have been evicted")
	}
	if !aliveExists {
		t.Error("alive key should still exist")
	}
}

func TestRateComputerLen(t *testing.T) {
	rc := NewRateComputer()
	if rc.Len() != 0 {
		t.Error("empty rate computer should have len 0")
	}
	rc.Compute("a", 1)
	rc.Compute("b", 1)
	if rc.Len() != 2 {
		t.Errorf("expected 2, got %d", rc.Len())
	}
}
