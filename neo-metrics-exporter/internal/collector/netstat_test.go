package collector

import (
	"context"
	"testing"
)

func TestNetstatCollectorName(t *testing.T) {
	c := NewNetstatCollector()
	if c.Name() != "netstat" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestNetstatCollectorCollect(t *testing.T) {
	c := NewNetstatCollector()
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	tcpStates := map[string]bool{
		"system.tcp.established": false,
		"system.tcp.time_wait":   false,
		"system.tcp.close_wait":  false,
		"system.tcp.listen":      false,
	}

	for _, p := range points {
		if _, ok := tcpStates[p.Name]; ok {
			tcpStates[p.Name] = true
			if p.Value < 0 {
				t.Errorf("%s = %f, should be >= 0", p.Name, p.Value)
			}
		}
	}

	for name, found := range tcpStates {
		if !found {
			t.Errorf("missing TCP state metric: %s", name)
		}
	}
}

func TestNetstatCollectorProtoCountersFirstSample(t *testing.T) {
	c := NewNetstatCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "system.tcp.retransmits_per_sec" {
			t.Error("first sample should not produce rate metrics")
		}
	}
}
