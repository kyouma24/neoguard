//go:build linux

package collector

import (
	"context"
	"testing"
)

func TestEntropyCollectorName(t *testing.T) {
	c := NewEntropyCollector()
	if c.Name() != "entropy" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestEntropyCollectorCollect(t *testing.T) {
	c := NewEntropyCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	if len(points) == 0 {
		t.Error("expected at least one entropy metric")
	}

	for _, p := range points {
		if p.Value < 0 {
			t.Errorf("%s = %f, should be >= 0", p.Name, p.Value)
		}
	}
}
