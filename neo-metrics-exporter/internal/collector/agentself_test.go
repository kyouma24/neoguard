package collector

import (
	"context"
	"testing"
)

func TestAgentSelfCollectorName(t *testing.T) {
	c := NewAgentSelfCollector(&AgentStats{}, nil, nil)
	if c.Name() != "agentself" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestAgentSelfCollectorMetrics(t *testing.T) {
	stats := &AgentStats{}
	stats.CollectionDurationMs.Store(42)
	stats.PointsCollected.Store(150)
	stats.BufferSize.Store(300)
	stats.BufferDropped.Store(5)
	stats.SendDurationMs.Store(88)
	stats.PointsSent.Store(1000)
	stats.SendErrors.Store(2)

	c := NewAgentSelfCollector(stats, nil, nil)
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	expected := map[string]float64{
		"agent.collection_duration_ms": 42,
		"agent.points_collected":       150,
		"agent.buffer_size":            300,
		"agent.buffer_dropped":         5,
		"agent.send_duration_ms":       88,
		"agent.points_sent":            1000,
		"agent.send_errors":            2,
	}

	found := make(map[string]bool)
	for _, p := range points {
		if ev, ok := expected[p.Name]; ok {
			found[p.Name] = true
			if p.Value != ev {
				t.Errorf("%s = %f, want %f", p.Name, p.Value, ev)
			}
		}
	}

	for name := range expected {
		if !found[name] {
			t.Errorf("missing metric %s", name)
		}
	}

	hasUptime := false
	hasGoroutines := false
	hasHeap := false
	for _, p := range points {
		switch p.Name {
		case "agent.uptime_seconds":
			hasUptime = true
			if p.Value < 0 {
				t.Error("uptime should be >= 0")
			}
		case "agent.go.goroutines":
			hasGoroutines = true
			if p.Value < 1 {
				t.Error("goroutines should be >= 1")
			}
		case "agent.go.heap_alloc_bytes":
			hasHeap = true
			if p.Value <= 0 {
				t.Error("heap should be > 0")
			}
		}
	}
	if !hasUptime {
		t.Error("missing agent.uptime_seconds")
	}
	if !hasGoroutines {
		t.Error("missing agent.go.goroutines")
	}
	if !hasHeap {
		t.Error("missing agent.go.heap_alloc_bytes")
	}
}

func TestAgentSelfBaseTagsPreserved(t *testing.T) {
	c := NewAgentSelfCollector(&AgentStats{}, nil, nil)
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "myhost"})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range points {
		if p.Tags["hostname"] != "myhost" {
			t.Errorf("base tag hostname lost in %s", p.Name)
			break
		}
	}
}
