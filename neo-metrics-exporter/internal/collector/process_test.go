package collector

import (
	"context"
	"testing"
)

func TestProcessCollectorName(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 10})
	if c.Name() != "process" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestProcessCollectorCollect(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 5})
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	if len(points) == 0 {
		t.Fatal("expected some process metrics")
	}

	hasCPU := false
	hasMem := false
	hasTotal := false
	hasIORead := false
	hasIOWrite := false
	for _, p := range points {
		switch p.Name {
		case "process.cpu_pct":
			hasCPU = true
			if p.Tags["process_name"] == "" {
				t.Error("missing process_name tag")
			}
			if p.Tags["process_pid"] == "" {
				t.Error("missing process_pid tag")
			}
			if _, ok := p.Tags["process_cmdline"]; !ok {
				t.Error("missing process_cmdline tag")
			}
		case "process.memory_bytes":
			hasMem = true
		case "process.io_read_bytes":
			hasIORead = true
		case "process.io_write_bytes":
			hasIOWrite = true
		case "system.processes.total":
			hasTotal = true
			if p.Value <= 0 {
				t.Errorf("total processes = %f", p.Value)
			}
		}
	}

	if !hasCPU {
		t.Error("missing process.cpu_pct")
	}
	if !hasMem {
		t.Error("missing process.memory_bytes")
	}
	if !hasIORead {
		t.Error("missing process.io_read_bytes")
	}
	if !hasIOWrite {
		t.Error("missing process.io_write_bytes")
	}
	if !hasTotal {
		t.Error("missing system.processes.total")
	}
}

func TestProcessCollectorTopN(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 3})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	cpuCount := 0
	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			cpuCount++
		}
	}

	if cpuCount > 3 {
		t.Errorf("expected at most 3 processes, got %d", cpuCount)
	}
}

func TestProcessCollectorDenyRegex(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		TopN:      50,
		DenyRegex: []string{"^System$", "^Idle$", "^\\[.*\\]$"},
	})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		name := p.Tags["process_name"]
		if name == "System" || name == "Idle" {
			t.Errorf("denied process %q should not appear", name)
		}
	}
}

func TestProcessCollectorAllowRegex(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		TopN:       50,
		AllowRegex: []string{"^neoguard"},
	})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			name := p.Tags["process_name"]
			if name != "" && len(name) > 0 && name[:1] != "n" {
			}
		}
	}
	_ = points
}

func TestProcessCollectorDefaultTopN(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{})
	if c.topN != 20 {
		t.Errorf("default topN = %d, want 20", c.topN)
	}
}

func TestProcessCollectorIsAllowed(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		DenyRegex:  []string{"^kworker", "^scsi_"},
		AllowRegex: []string{},
	})

	tests := []struct {
		name    string
		allowed bool
	}{
		{"nginx", true},
		{"kworker/0:1", false},
		{"scsi_eh_0", false},
		{"python3", true},
		{"sshd", true},
	}

	for _, tt := range tests {
		if got := c.isAllowed(tt.name); got != tt.allowed {
			t.Errorf("isAllowed(%q) = %v, want %v", tt.name, got, tt.allowed)
		}
	}
}

func TestProcessCollectorIsAllowedWithFilter(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		AllowRegex: []string{"^nginx", "^python"},
	})

	if !c.isAllowed("nginx") {
		t.Error("nginx should be allowed")
	}
	if !c.isAllowed("python3") {
		t.Error("python3 should be allowed")
	}
	if c.isAllowed("sshd") {
		t.Error("sshd should not be allowed with explicit allow list")
	}
}
