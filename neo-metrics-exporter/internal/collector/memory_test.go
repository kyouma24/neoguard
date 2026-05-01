package collector

import (
	"context"
	"testing"
)

func TestMemoryCollectorName(t *testing.T) {
	c := NewMemoryCollector()
	if c.Name() != "memory" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestMemoryCollectorCollect(t *testing.T) {
	c := NewMemoryCollector()
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	required := []string{
		"system.memory.total_bytes",
		"system.memory.used_bytes",
		"system.memory.available_bytes",
		"system.memory.used_pct",
		"system.memory.free_bytes",
	}

	found := make(map[string]bool)
	for _, p := range points {
		found[p.Name] = true
	}

	for _, name := range required {
		if !found[name] {
			t.Errorf("missing metric: %s", name)
		}
	}
}

func TestMemoryCollectorSwap(t *testing.T) {
	c := NewMemoryCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	hasSwap := false
	for _, p := range points {
		if p.Name == "system.memory.swap.total_bytes" {
			hasSwap = true
			break
		}
	}
	if !hasSwap {
		t.Error("missing swap metrics")
	}
}

func TestMemoryCollectorValues(t *testing.T) {
	c := NewMemoryCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "system.memory.total_bytes" && p.Value <= 0 {
			t.Errorf("total_bytes = %f, should be > 0", p.Value)
		}
		if p.Name == "system.memory.used_pct" && (p.Value < 0 || p.Value > 100) {
			t.Errorf("used_pct = %f, out of range", p.Value)
		}
	}
}
