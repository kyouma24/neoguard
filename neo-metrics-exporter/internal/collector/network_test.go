package collector

import (
	"context"
	"testing"
)

func TestNetworkCollectorName(t *testing.T) {
	c := NewNetworkCollector(nil)
	if c.Name() != "network" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestNetworkCollectorFirstSampleEmpty(t *testing.T) {
	c := NewNetworkCollector([]string{"lo"})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range points {
		if p.Name == "system.network.rx_bytes_per_sec" {
			t.Error("first sample should not produce rate metrics")
		}
	}
}

func TestNetworkCollectorExclude(t *testing.T) {
	c := NewNetworkCollector([]string{"lo", "docker*", "veth*"})
	_, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
}

func TestNetworkExcludeMatch(t *testing.T) {
	c := NewNetworkCollector([]string{"lo", "docker*", "veth*", "br-*"})

	tests := []struct {
		name     string
		excluded bool
	}{
		{"lo", true},
		{"docker0", true},
		{"veth123abc", true},
		{"br-abc123", true},
		{"eth0", false},
		{"ens5", false},
		{"wlan0", false},
	}

	for _, tt := range tests {
		if got := c.isExcluded(tt.name); got != tt.excluded {
			t.Errorf("isExcluded(%q) = %v, want %v", tt.name, got, tt.excluded)
		}
	}
}
