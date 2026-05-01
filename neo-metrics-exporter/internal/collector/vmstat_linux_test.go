//go:build linux

package collector

import (
	"context"
	"testing"
)

func TestVMStatCollectorName(t *testing.T) {
	c := NewVMStatCollector()
	if c.Name() != "vmstat" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestVMStatCollectorCollect(t *testing.T) {
	c := NewVMStatCollector()

	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	hasOomKill := false
	for _, p := range points {
		if p.Name == "system.vmstat.oom_kill_total" {
			hasOomKill = true
		}
	}
	if !hasOomKill {
		t.Error("missing oom_kill_total")
	}

	points2, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	_ = points2
}
