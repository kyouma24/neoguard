package collector

import (
	"context"
	"testing"
)

func TestPortMapCollectorName(t *testing.T) {
	c := NewPortMapCollector()
	if c.Name() != "portmap" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestPortMapCollectorCollect(t *testing.T) {
	c := NewPortMapCollector()
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	if len(points) == 0 {
		t.Skip("no listening ports found on this system")
	}

	for _, p := range points {
		if p.Name != "system.service.port" {
			t.Errorf("unexpected metric: %s", p.Name)
		}
		if p.Value != 1 {
			t.Errorf("expected value=1, got %f", p.Value)
		}
		if p.Tags["port"] == "" {
			t.Error("missing port tag")
		}
		if p.Tags["protocol"] == "" {
			t.Error("missing protocol tag")
		}
		if p.Tags["protocol"] != "tcp" && p.Tags["protocol"] != "udp" && p.Tags["protocol"] != "unknown" {
			t.Errorf("unexpected protocol: %s", p.Tags["protocol"])
		}
	}
}

func TestPortMapCollectorNoDuplicates(t *testing.T) {
	c := NewPortMapCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	seen := make(map[string]bool)
	for _, p := range points {
		key := p.Tags["protocol"] + ":" + p.Tags["bind_address"] + ":" + p.Tags["port"] + ":" + p.Tags["process_pid"]
		if seen[key] {
			t.Errorf("duplicate: %s", key)
		}
		seen[key] = true
	}
}
