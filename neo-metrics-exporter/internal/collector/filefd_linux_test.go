//go:build linux

package collector

import (
	"context"
	"testing"
)

func TestFileFDCollectorName(t *testing.T) {
	c := NewFileFDCollector()
	if c.Name() != "filefd" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestFileFDCollectorCollect(t *testing.T) {
	c := NewFileFDCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	found := map[string]bool{}
	for _, p := range points {
		found[p.Name] = true
		if p.Name == "system.filefd.allocated" && p.Value <= 0 {
			t.Errorf("allocated = %f", p.Value)
		}
		if p.Name == "system.filefd.maximum" && p.Value <= 0 {
			t.Errorf("maximum = %f", p.Value)
		}
		if p.Name == "system.filefd.used_pct" && (p.Value < 0 || p.Value > 100) {
			t.Errorf("used_pct = %f", p.Value)
		}
	}

	if !found["system.filefd.allocated"] {
		t.Error("missing allocated")
	}
	if !found["system.filefd.maximum"] {
		t.Error("missing maximum")
	}
}
