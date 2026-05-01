package collector

import (
	"context"
	"testing"
)

func TestSensorsCollectorName(t *testing.T) {
	c := NewSensorsCollector()
	if c.Name() != "sensors" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestSensorsCollectorCollect(t *testing.T) {
	c := NewSensorsCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name != "system.sensors.temperature_celsius" {
			t.Errorf("unexpected metric: %s", p.Name)
		}
		if p.Tags["sensor"] == "" {
			t.Error("missing sensor tag")
		}
		if p.Value <= 0 {
			t.Errorf("temperature = %f, should be > 0", p.Value)
		}
	}
}
