package collector

import (
	"context"
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
)

func TestCPUCollectorName(t *testing.T) {
	c := NewCPUCollector(config.CPUConfig{})
	if c.Name() != "cpu" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestCPUCollectorDefaultMode(t *testing.T) {
	c := NewCPUCollector(config.CPUConfig{})
	tags := map[string]string{"hostname": "test"}
	points, err := c.Collect(context.Background(), tags)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) == 0 {
		t.Fatal("expected some CPU metrics")
	}

	hasTotal := false
	hasCoreCount := false
	hasUserPct := false
	hasSystemPct := false
	hasIdlePct := false
	hasFreqAvg := false
	hasPerCore := false

	for _, p := range points {
		switch p.Name {
		case "system.cpu.usage_total_pct":
			hasTotal = true
			if p.Value < 0 || p.Value > 100 {
				t.Errorf("total cpu pct = %f, out of range", p.Value)
			}
		case "system.cpu.core_count":
			hasCoreCount = true
			if p.Value < 1 {
				t.Errorf("core_count = %f, expected >= 1", p.Value)
			}
		case "system.cpu.user_pct":
			hasUserPct = true
		case "system.cpu.system_pct":
			hasSystemPct = true
		case "system.cpu.idle_pct":
			hasIdlePct = true
		case "system.cpu.frequency_mhz.avg":
			hasFreqAvg = true
		case "system.cpu.usage_pct":
			hasPerCore = true
		}
	}

	if !hasTotal {
		t.Error("missing system.cpu.usage_total_pct")
	}
	if !hasCoreCount {
		t.Error("missing system.cpu.core_count")
	}
	if !hasUserPct {
		t.Error("missing system.cpu.user_pct")
	}
	if !hasSystemPct {
		t.Error("missing system.cpu.system_pct")
	}
	if !hasIdlePct {
		t.Error("missing system.cpu.idle_pct")
	}
	if !hasFreqAvg {
		t.Error("missing system.cpu.frequency_mhz.avg")
	}
	if hasPerCore {
		t.Error("per-core metrics should not be emitted in default mode")
	}
}

func TestCPUCollectorPerCoreMode(t *testing.T) {
	c := NewCPUCollector(config.CPUConfig{PerCore: true})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	hasPerCore := false
	for _, p := range points {
		if p.Name == "system.cpu.usage_pct" {
			hasPerCore = true
			if p.Tags["core"] == "" {
				t.Error("per-core metric missing core tag")
			}
			if p.Tags["mode"] == "" {
				t.Error("per-core metric missing mode tag")
			}
		}
	}
	if !hasPerCore {
		t.Error("per-core metrics should be present when per_core=true")
	}
}

func TestCPUCollectorPerCoreFrequency(t *testing.T) {
	c := NewCPUCollector(config.CPUConfig{PerCoreFrequency: true})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	perCoreFreqCount := 0
	for _, p := range points {
		if p.Name == "system.cpu.frequency_mhz" && p.Tags["core"] != "" {
			perCoreFreqCount++
		}
	}
	if perCoreFreqCount == 0 {
		t.Skip("no per-core frequency data available on this system")
	}
}

func TestCPUCollectorFrequencySummary(t *testing.T) {
	c := NewCPUCollector(config.CPUConfig{})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	hasMin := false
	hasMax := false
	hasAvg := false
	for _, p := range points {
		switch p.Name {
		case "system.cpu.frequency_mhz.min":
			hasMin = true
		case "system.cpu.frequency_mhz.max":
			hasMax = true
		case "system.cpu.frequency_mhz.avg":
			hasAvg = true
		}
	}

	if !hasAvg && !hasMin && !hasMax {
		t.Skip("no CPU frequency data available on this system")
	}
	if hasAvg && (!hasMin || !hasMax) {
		t.Error("frequency summary incomplete: need min, max, and avg together")
	}
}

func TestCPUCollectorBaseTagsPreserved(t *testing.T) {
	c := NewCPUCollector(config.CPUConfig{})
	tags := map[string]string{"hostname": "myhost", "region": "us-east-1"}
	points, err := c.Collect(context.Background(), tags)
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Tags["hostname"] != "myhost" {
			t.Errorf("base tag hostname lost in %s", p.Name)
			break
		}
	}
}

func TestCPUCollectorNoPerCoreFreqDefault(t *testing.T) {
	c := NewCPUCollector(config.CPUConfig{})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "system.cpu.frequency_mhz" && p.Tags["core"] != "" {
			t.Error("per-core frequency should not appear in default mode")
			break
		}
	}
}
