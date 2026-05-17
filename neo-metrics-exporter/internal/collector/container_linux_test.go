//go:build linux

package collector

import (
	"context"
	"runtime"
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

// Test container collector emits correct metrics for Docker container with quota
func TestContainerCollectorWithQuota(t *testing.T) {
	// Stub readCgroupInfoFunc with static CgroupInfo (deterministic)
	originalReadCgroupInfo := readCgroupInfoFunc
	readCgroupInfoFunc = func() (*procfs.CgroupInfo, error) {
		return &procfs.CgroupInfo{
			Version:          procfs.CgroupV1,
			ContainerRuntime: "docker",
			IsContainer:      true,
			FallbackUsed:     false,
			CPUQuotaUS:       200000,
			CPUPeriodUS:      100000,
			CPULimitCores:    2.0,
			MemoryLimitBytes: 536870912, // 512MB
			MemoryUsageBytes: 268435456, // 256MB
			CPUUsageUS:       5000000,   // 5 seconds in µs
			NrPeriods:        100,
			NrThrottled:      10,
			ThrottledUS:      50000,
		}, nil
	}
	defer func() {
		readCgroupInfoFunc = originalReadCgroupInfo
	}()

	c := NewContainerCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatalf("Collect failed: %v", err)
	}

	metrics := make(map[string]float64)
	var containerRuntime string
	for _, p := range points {
		metrics[p.Name] = p.Value
		if rt, ok := p.Tags["container_runtime"]; ok {
			containerRuntime = rt
		}
	}

	// Verify metrics
	if metrics["system.container.detected"] != 1 {
		t.Errorf("expected system.container.detected=1, got %f", metrics["system.container.detected"])
	}
	if containerRuntime != "docker" {
		t.Errorf("expected container_runtime=docker, got %s", containerRuntime)
	}
	if metrics["system.container.cgroup_version"] != 1 {
		t.Errorf("expected cgroup_version=1, got %f", metrics["system.container.cgroup_version"])
	}
	if metrics["system.container.gomaxprocs"] != float64(runtime.GOMAXPROCS(0)) {
		t.Errorf("expected gomaxprocs=%d, got %f", runtime.GOMAXPROCS(0), metrics["system.container.gomaxprocs"])
	}
	if metrics["system.container.cgroup_fallback"] != 0 {
		t.Errorf("expected cgroup_fallback=0, got %f", metrics["system.container.cgroup_fallback"])
	}
	if metrics["system.container.cpu_limit_cores"] != 2.0 {
		t.Errorf("expected cpu_limit_cores=2.0, got %f", metrics["system.container.cpu_limit_cores"])
	}
	if metrics["system.container.memory_limit_bytes"] != 536870912 {
		t.Errorf("expected memory_limit_bytes=536870912, got %f", metrics["system.container.memory_limit_bytes"])
	}
}

// Test bare metal detection (no container)
func TestContainerCollectorBareMetal(t *testing.T) {
	// Stub readCgroupInfoFunc with bare metal info (deterministic)
	originalReadCgroupInfo := readCgroupInfoFunc
	readCgroupInfoFunc = func() (*procfs.CgroupInfo, error) {
		return &procfs.CgroupInfo{
			Version:          procfs.CgroupV2,
			ContainerRuntime: "baremetal",
			IsContainer:      false,
			FallbackUsed:     false,
			CPUQuotaUS:       -1, // No quota
			CPUPeriodUS:      100000,
			CPULimitCores:    -1,
			MemoryLimitBytes: -1,
		}, nil
	}
	defer func() {
		readCgroupInfoFunc = originalReadCgroupInfo
	}()

	c := NewContainerCollector()
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatalf("Collect failed: %v", err)
	}

	metrics := make(map[string]float64)
	var containerRuntime string
	for _, p := range points {
		metrics[p.Name] = p.Value
		if rt, ok := p.Tags["container_runtime"]; ok {
			containerRuntime = rt
		}
	}

	if metrics["system.container.detected"] != 0 {
		t.Errorf("expected system.container.detected=0 (bare metal), got %f", metrics["system.container.detected"])
	}
	if containerRuntime != "baremetal" {
		t.Errorf("expected container_runtime=baremetal, got %s", containerRuntime)
	}
}
