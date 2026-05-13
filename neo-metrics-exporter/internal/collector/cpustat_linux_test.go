//go:build linux

package collector

import (
	"context"
	"testing"
)

func TestCPUStatCollectorName(t *testing.T) {
	c := NewCPUStatCollector()
	if c.Name() != "cpustat" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestCPUStatCollectorCollect(t *testing.T) {
	c := NewCPUStatCollector()

	// First call seeds the rate computer
	points1, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	hasRunning := false
	hasBlocked := false
	for _, p := range points1 {
		switch p.Name {
		case "system.cpu.procs_running":
			hasRunning = true
		case "system.cpu.procs_blocked":
			hasBlocked = true
		}
	}

	if !hasRunning {
		t.Error("missing system.cpu.procs_running")
	}
	if !hasBlocked {
		t.Error("missing system.cpu.procs_blocked")
	}
}
