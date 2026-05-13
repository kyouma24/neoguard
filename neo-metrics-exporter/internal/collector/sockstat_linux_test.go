//go:build linux

package collector

import (
	"context"
	"testing"
)

func TestSockstatCollectorName(t *testing.T) {
	c := NewSockstatCollector()
	if c.Name() != "sockstat" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestSockstatCollectorCollect(t *testing.T) {
	c := NewSockstatCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	expected := map[string]bool{
		"system.sockstat.sockets_used":  false,
		"system.sockstat.tcp_inuse":     false,
		"system.sockstat.tcp_time_wait": false,
		"system.sockstat.udp_inuse":     false,
	}

	for _, p := range points {
		if _, ok := expected[p.Name]; ok {
			expected[p.Name] = true
		}
	}

	for name, found := range expected {
		if !found {
			t.Errorf("missing: %s", name)
		}
	}
}
