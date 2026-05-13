//go:build linux

package collector

import (
	"context"
	"testing"
)

func TestPressureCollectorName(t *testing.T) {
	c := NewPressureCollector()
	if c.Name() != "pressure" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestPressureCollectorCollect(t *testing.T) {
	c := NewPressureCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Value < 0 {
			t.Errorf("%s = %f, should be >= 0", p.Name, p.Value)
		}
	}
}
