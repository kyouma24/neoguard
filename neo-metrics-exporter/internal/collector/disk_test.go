package collector

import (
	"context"
	"testing"
)

func TestDiskCollectorName(t *testing.T) {
	c := NewDiskCollector(nil, nil)
	if c.Name() != "disk" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestDiskCollectorCollect(t *testing.T) {
	c := NewDiskCollector(
		[]string{"/proc", "/sys", "/dev", "/run"},
		[]string{"tmpfs", "devtmpfs", "squashfs"},
	)
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	if len(points) == 0 {
		t.Fatal("expected at least one disk mount")
	}

	hasTotalBytes := false
	for _, p := range points {
		if p.Name == "system.disk.total_bytes" {
			hasTotalBytes = true
			if p.Tags["mount"] == "" {
				t.Error("missing mount tag")
			}
			if p.Value <= 0 {
				t.Errorf("total_bytes = %f, should be > 0", p.Value)
			}
		}
	}
	if !hasTotalBytes {
		t.Error("missing system.disk.total_bytes")
	}
}

func TestDiskCollectorExcludes(t *testing.T) {
	c := NewDiskCollector(
		[]string{"/proc", "/sys", "/dev", "/run"},
		[]string{"tmpfs", "devtmpfs"},
	)
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Tags["mount"] == "/proc" || p.Tags["mount"] == "/sys" || p.Tags["mount"] == "/dev" {
			t.Errorf("excluded mount %q should not appear", p.Tags["mount"])
		}
		if p.Tags["fstype"] == "tmpfs" || p.Tags["fstype"] == "devtmpfs" {
			t.Errorf("excluded fstype %q should not appear", p.Tags["fstype"])
		}
	}
}
