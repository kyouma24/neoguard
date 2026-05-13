package collector

import (
	"context"
	"testing"
)

func TestSystemCollectorName(t *testing.T) {
	c := NewSystemCollector()
	if c.Name() != "system" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestSystemCollectorCollect(t *testing.T) {
	c := NewSystemCollector()
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	required := map[string]bool{
		"system.uptime_seconds": false,
		"system.boot_time":      false,
		"system.os.info":        false,
	}

	for _, p := range points {
		if _, ok := required[p.Name]; ok {
			required[p.Name] = true
		}
	}

	for name, found := range required {
		if !found {
			t.Errorf("missing metric: %s", name)
		}
	}
}

func TestSystemCollectorUptimePositive(t *testing.T) {
	c := NewSystemCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "system.uptime_seconds" && p.Value <= 0 {
			t.Errorf("uptime = %f, should be > 0", p.Value)
		}
	}
}

func TestSystemCollectorOSInfoTags(t *testing.T) {
	c := NewSystemCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "system.os.info" {
			if p.Value != 1 {
				t.Errorf("os.info value = %f, want 1", p.Value)
			}
			if p.Tags["arch"] == "" {
				t.Error("os.info missing arch tag")
			}
		}
	}
}
