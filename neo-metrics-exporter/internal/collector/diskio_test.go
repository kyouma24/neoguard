package collector

import (
	"context"
	"testing"
)

func TestDiskIOCollectorName(t *testing.T) {
	c := NewDiskIOCollector()
	if c.Name() != "diskio" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestDiskIOCollectorFirstSampleEmpty(t *testing.T) {
	c := NewDiskIOCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range points {
		if p.Name == "system.disk.io.read_bytes_per_sec" {
			t.Error("first sample should not produce rate metrics")
		}
	}
}

func TestDiskIOCollectorSecondSample(t *testing.T) {
	c := NewDiskIOCollector()
	_, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	_ = points
}
