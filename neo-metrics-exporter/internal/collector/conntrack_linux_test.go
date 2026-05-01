//go:build linux

package collector

import (
	"context"
	"testing"
)

func TestConntrackCollectorName(t *testing.T) {
	c := NewConntrackCollector()
	if c.Name() != "conntrack" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestConntrackCollectorCollect(t *testing.T) {
	c := NewConntrackCollector()
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
