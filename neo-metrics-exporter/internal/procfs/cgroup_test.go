//go:build linux

package procfs

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// Test 1: Parse v1 unified cpu,cpuacct
func TestParseCgroupPathsV1UnifiedCPU(t *testing.T) {
	content := "3:cpu,cpuacct:/kubepods/pod123\n5:memory:/kubepods/pod123\n"
	paths := parseCgroupPaths(content, CgroupV1)

	if paths.CPUPath != "/kubepods/pod123" {
		t.Errorf("expected CPUPath=/kubepods/pod123, got %s", paths.CPUPath)
	}
	if paths.CPUAcctPath != "/kubepods/pod123" {
		t.Errorf("expected CPUAcctPath=/kubepods/pod123 (fallback to CPUPath), got %s", paths.CPUAcctPath)
	}
	if paths.MemoryPath != "/kubepods/pod123" {
		t.Errorf("expected MemoryPath=/kubepods/pod123, got %s", paths.MemoryPath)
	}
	if paths.FallbackUsed {
		t.Errorf("expected FallbackUsed=false, got true")
	}
}

// Test 2: Parse v1 separate cpuacct
func TestParseCgroupPathsV1SeparateCPUAcct(t *testing.T) {
	content := "3:cpu:/path/cpu\n4:cpuacct:/path/cpuacct\n5:memory:/path/mem\n"
	paths := parseCgroupPaths(content, CgroupV1)

	if paths.CPUPath != "/path/cpu" {
		t.Errorf("expected CPUPath=/path/cpu, got %s", paths.CPUPath)
	}
	if paths.CPUAcctPath != "/path/cpuacct" {
		t.Errorf("expected CPUAcctPath=/path/cpuacct, got %s", paths.CPUAcctPath)
	}
	if paths.MemoryPath != "/path/mem" {
		t.Errorf("expected MemoryPath=/path/mem, got %s", paths.MemoryPath)
	}
	if paths.FallbackUsed {
		t.Errorf("expected FallbackUsed=false, got true")
	}
}

// Test 3: Parse v2 unified
func TestParseCgroupPathsV2Unified(t *testing.T) {
	content := "0::/system.slice/svc\n"
	paths := parseCgroupPaths(content, CgroupV2)

	if paths.CPUPath != "/system.slice/svc" {
		t.Errorf("expected CPUPath=/system.slice/svc, got %s", paths.CPUPath)
	}
	if paths.MemoryPath != "/system.slice/svc" {
		t.Errorf("expected MemoryPath=/system.slice/svc, got %s", paths.MemoryPath)
	}
	if paths.CPUAcctPath != "" {
		t.Errorf("expected CPUAcctPath empty for v2, got %s", paths.CPUAcctPath)
	}
	if paths.FallbackUsed {
		t.Errorf("expected FallbackUsed=false, got true")
	}
}

// Test 4: Parse root cgroup
func TestParseCgroupPathsRoot(t *testing.T) {
	content := "0::/\n"
	paths := parseCgroupPaths(content, CgroupV2)

	if paths.CPUPath != "/" {
		t.Errorf("expected CPUPath=/, got %s", paths.CPUPath)
	}
	if paths.MemoryPath != "/" {
		t.Errorf("expected MemoryPath=/, got %s", paths.MemoryPath)
	}
	if paths.FallbackUsed {
		t.Errorf("expected FallbackUsed=false, got true (root is valid)")
	}
}

// Test 5: Parse failure → fallback
func TestParseCgroupPathsMalformed(t *testing.T) {
	content := "garbage\nmore garbage\n"
	paths := parseCgroupPaths(content, CgroupV1)

	if paths.CPUPath != "/" {
		t.Errorf("expected fallback CPUPath=/, got %s", paths.CPUPath)
	}
	if paths.MemoryPath != "/" {
		t.Errorf("expected fallback MemoryPath=/, got %s", paths.MemoryPath)
	}
	if !paths.FallbackUsed {
		t.Errorf("expected FallbackUsed=true, got false")
	}
}

// Test 6: Read v1 nested path with quota
func TestReadCgroupInfoV1NestedWithQuota(t *testing.T) {
	tmpDir := t.TempDir()

	// Create v1 sysfs hierarchy: /sys/fs/cgroup/cpu/kubepods/pod123/
	cpuBase := filepath.Join(tmpDir, "cpu", "kubepods", "pod123")
	memBase := filepath.Join(tmpDir, "memory", "kubepods", "pod123")
	if err := os.MkdirAll(cpuBase, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(memBase, 0755); err != nil {
		t.Fatal(err)
	}

	// Write cpu quota/period files (v1 hierarchy)
	writeFile(t, filepath.Join(cpuBase, "cpu.cfs_quota_us"), "200000")
	writeFile(t, filepath.Join(cpuBase, "cpu.cfs_period_us"), "100000")
	writeFile(t, filepath.Join(cpuBase, "cpuacct.usage"), "123456789")
	writeFile(t, filepath.Join(cpuBase, "cpu.stat"), "nr_periods 100\nnr_throttled 10\nthrottled_time 5000000\n")

	// Write memory files (v1 hierarchy)
	writeFile(t, filepath.Join(memBase, "memory.limit_in_bytes"), "536870912") // 512MB
	writeFile(t, filepath.Join(memBase, "memory.usage_in_bytes"), "268435456") // 256MB

	// Write /proc/self/cgroup content
	cgroupFile := filepath.Join(tmpDir, "cgroup")
	cgroupContent := "3:cpu,cpuacct:/kubepods/pod123\n5:memory:/kubepods/pod123\n"
	if err := os.WriteFile(cgroupFile, []byte(cgroupContent), 0644); err != nil {
		t.Fatal(err)
	}

	info, err := ReadCgroupInfoFrom(cgroupFile, tmpDir)
	if err != nil {
		t.Fatalf("ReadCgroupInfoFrom failed: %v", err)
	}

	if info.CPULimitCores != 2.0 {
		t.Errorf("expected CPULimitCores=2.0, got %f", info.CPULimitCores)
	}
	if info.FallbackUsed {
		t.Errorf("expected FallbackUsed=false, got true")
	}
	if info.Version != CgroupV1 {
		t.Errorf("expected Version=CgroupV1, got %v", info.Version)
	}
	if info.MemoryLimitBytes != 536870912 {
		t.Errorf("expected MemoryLimitBytes=536870912, got %d", info.MemoryLimitBytes)
	}
}

// Test 7: Read v2 nested path with quota
func TestReadCgroupInfoV2NestedWithQuota(t *testing.T) {
	tmpDir := t.TempDir()

	cgroupBase := filepath.Join(tmpDir, "system.slice", "neoguard.service")
	if err := os.MkdirAll(cgroupBase, 0755); err != nil {
		t.Fatal(err)
	}

	// v2 uses cpu.max: "quota period"
	writeFile(t, filepath.Join(cgroupBase, "cpu.max"), "400000 100000")
	writeFile(t, filepath.Join(cgroupBase, "cpu.stat"), "usage_usec 987654321\nnr_periods 200\nnr_throttled 5\nthrottled_usec 1000000\n")
	writeFile(t, filepath.Join(cgroupBase, "memory.max"), "1073741824") // 1GB
	writeFile(t, filepath.Join(cgroupBase, "memory.current"), "536870912") // 512MB

	cgroupFile := filepath.Join(tmpDir, "cgroup")
	cgroupContent := "0::/system.slice/neoguard.service\n"
	if err := os.WriteFile(cgroupFile, []byte(cgroupContent), 0644); err != nil {
		t.Fatal(err)
	}

	info, err := ReadCgroupInfoFrom(cgroupFile, tmpDir)
	if err != nil {
		t.Fatalf("ReadCgroupInfoFrom failed: %v", err)
	}

	if info.CPULimitCores != 4.0 {
		t.Errorf("expected CPULimitCores=4.0, got %f", info.CPULimitCores)
	}
	if info.FallbackUsed {
		t.Errorf("expected FallbackUsed=false, got true")
	}
	if info.Version != CgroupV2 {
		t.Errorf("expected Version=CgroupV2, got %v", info.Version)
	}
	if info.MemoryLimitBytes != 1073741824 {
		t.Errorf("expected MemoryLimitBytes=1073741824, got %d", info.MemoryLimitBytes)
	}
}

// Test 8: Read v1 fallback to root
func TestReadCgroupInfoV1FallbackToRoot(t *testing.T) {
	tmpDir := t.TempDir()

	// Create root v1 sysfs structure only (nested path will NOT exist)
	cpuRoot := filepath.Join(tmpDir, "cpu")
	memRoot := filepath.Join(tmpDir, "memory")
	if err := os.MkdirAll(cpuRoot, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(memRoot, 0755); err != nil {
		t.Fatal(err)
	}

	writeFile(t, filepath.Join(cpuRoot, "cpu.cfs_quota_us"), "-1")
	writeFile(t, filepath.Join(cpuRoot, "cpu.cfs_period_us"), "100000")
	writeFile(t, filepath.Join(cpuRoot, "cpuacct.usage"), "0")
	writeFile(t, filepath.Join(cpuRoot, "cpu.stat"), "")
	writeFile(t, filepath.Join(memRoot, "memory.limit_in_bytes"), "9223372036854771712")
	writeFile(t, filepath.Join(memRoot, "memory.usage_in_bytes"), "0")

	// /proc/self/cgroup points to nested path that doesn't exist in sysfs
	cgroupFile := filepath.Join(tmpDir, "cgroup")
	cgroupContent := "3:cpu,cpuacct:/kubepods/nonexistent\n5:memory:/kubepods/nonexistent\n"
	if err := os.WriteFile(cgroupFile, []byte(cgroupContent), 0644); err != nil {
		t.Fatal(err)
	}

	info, err := ReadCgroupInfoFrom(cgroupFile, tmpDir)
	if err != nil {
		t.Fatalf("ReadCgroupInfoFrom failed: %v", err)
	}

	if !info.FallbackUsed {
		t.Errorf("expected FallbackUsed=true (nested path missing, root fallback used), got false")
	}
	if info.CPULimitCores != -1 {
		t.Errorf("expected CPULimitCores=-1 (no quota at root), got %f", info.CPULimitCores)
	}
}

// Test 9: Read v1 cpuacct separate path
func TestReadCgroupInfoV1SeparateCPUAcct(t *testing.T) {
	tmpDir := t.TempDir()

	// v1 sysfs hierarchy with separate cpu/cpuacct hierarchies
	cpuBase := filepath.Join(tmpDir, "cpu", "service")
	cpuacctBase := filepath.Join(tmpDir, "cpuacct", "service")
	memBase := filepath.Join(tmpDir, "memory", "service")

	if err := os.MkdirAll(cpuBase, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(cpuacctBase, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(memBase, 0755); err != nil {
		t.Fatal(err)
	}

	writeFile(t, filepath.Join(cpuBase, "cpu.cfs_quota_us"), "100000")
	writeFile(t, filepath.Join(cpuBase, "cpu.cfs_period_us"), "100000")
	writeFile(t, filepath.Join(cpuBase, "cpu.stat"), "nr_periods 50\nnr_throttled 0\nthrottled_time 0\n")
	writeFile(t, filepath.Join(cpuacctBase, "cpuacct.usage"), "111222333444") // nanoseconds in file
	writeFile(t, filepath.Join(memBase, "memory.limit_in_bytes"), "268435456")
	writeFile(t, filepath.Join(memBase, "memory.usage_in_bytes"), "134217728")

	cgroupFile := filepath.Join(tmpDir, "cgroup")
	cgroupContent := "3:cpu:/service\n4:cpuacct:/service\n5:memory:/service\n"
	if err := os.WriteFile(cgroupFile, []byte(cgroupContent), 0644); err != nil {
		t.Fatal(err)
	}

	info, err := ReadCgroupInfoFrom(cgroupFile, tmpDir)
	if err != nil {
		t.Fatalf("ReadCgroupInfoFrom failed: %v", err)
	}

	expectedUS := uint64(111222333) // cpuacct.usage in ns → converted to µs (/1000)
	if info.CPUUsageUS != expectedUS {
		t.Errorf("expected CPUUsageUS=%d (from cpuacct.usage nanoseconds / 1000), got %d", expectedUS, info.CPUUsageUS)
	}
	if info.CPULimitCores != 1.0 {
		t.Errorf("expected CPULimitCores=1.0, got %f", info.CPULimitCores)
	}
}

// Test 10: Read no quota
func TestReadCgroupInfoNoQuota(t *testing.T) {
	tmpDir := t.TempDir()

	// v1 sysfs hierarchy
	cgroupBase := filepath.Join(tmpDir, "cpu", "unlimited")
	memBase := filepath.Join(tmpDir, "memory", "unlimited")
	if err := os.MkdirAll(cgroupBase, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(memBase, 0755); err != nil {
		t.Fatal(err)
	}

	writeFile(t, filepath.Join(cgroupBase, "cpu.cfs_quota_us"), "-1") // No limit
	writeFile(t, filepath.Join(cgroupBase, "cpu.cfs_period_us"), "100000")
	writeFile(t, filepath.Join(cgroupBase, "cpuacct.usage"), "0")
	writeFile(t, filepath.Join(cgroupBase, "cpu.stat"), "")
	writeFile(t, filepath.Join(memBase, "memory.limit_in_bytes"), "9223372036854771712")
	writeFile(t, filepath.Join(memBase, "memory.usage_in_bytes"), "0")

	cgroupFile := filepath.Join(tmpDir, "cgroup")
	cgroupContent := "3:cpu,cpuacct:/unlimited\n5:memory:/unlimited\n"
	if err := os.WriteFile(cgroupFile, []byte(cgroupContent), 0644); err != nil {
		t.Fatal(err)
	}

	info, err := ReadCgroupInfoFrom(cgroupFile, tmpDir)
	if err != nil {
		t.Fatalf("ReadCgroupInfoFrom failed: %v", err)
	}

	if info.CPULimitCores != -1 {
		t.Errorf("expected CPULimitCores=-1 (no quota), got %f", info.CPULimitCores)
	}
}

// Helper to write file content
func writeFile(t *testing.T, path, content string) {
	t.Helper()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strings.TrimSpace(content)), 0644); err != nil {
		t.Fatal(err)
	}
}

// Helper to parse int64
func parseInt64(t *testing.T, s string) int64 {
	t.Helper()
	v, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	return v
}
