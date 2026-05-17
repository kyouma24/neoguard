//go:build linux

package procfs

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type CgroupVersion int

const (
	CgroupVersionUnknown CgroupVersion = iota
	CgroupV1
	CgroupV2
)

type CgroupInfo struct {
	Version          CgroupVersion
	ContainerRuntime string
	IsContainer      bool
	FallbackUsed     bool // true if parse fallback or sysfs fallback occurred

	CPUQuotaUS    int64
	CPUPeriodUS   int64
	CPULimitCores float64

	MemoryLimitBytes int64
	MemoryUsageBytes int64

	CPUUsageUS  uint64
	NrPeriods   uint64
	NrThrottled uint64
	ThrottledUS uint64
}

// CgroupPaths represents parsed cgroup controller paths
type CgroupPaths struct {
	Version      CgroupVersion
	CPUPath      string // v1: cpu hierarchy, v2: unified
	CPUAcctPath  string // v1: cpuacct hierarchy (may differ), v2: empty
	MemoryPath   string // v1: memory hierarchy, v2: unified
	FallbackUsed bool   // true if parse failed (malformed content)
}

func ReadCgroupInfo() (*CgroupInfo, error) {
	return ReadCgroupInfoFrom("/proc/self/cgroup", "/sys/fs/cgroup")
}

func ReadCgroupInfoFrom(cgroupPath, sysfsBase string) (*CgroupInfo, error) {
	info := &CgroupInfo{
		CPUQuotaUS:       -1,
		CPUPeriodUS:      100000,
		CPULimitCores:    -1,
		MemoryLimitBytes: -1,
	}

	content, err := ReadFileString(cgroupPath)
	if err != nil {
		return info, err
	}

	version, err := detectCgroupVersion(cgroupPath)
	if err != nil {
		return info, err
	}
	info.Version = version

	// Parse cgroup paths (non-failing)
	paths := parseCgroupPaths(content, version)
	info.FallbackUsed = paths.FallbackUsed // Initially from parse fallback

	info.ContainerRuntime = detectContainerRuntime()
	info.IsContainer = info.ContainerRuntime != "baremetal"

	if version == CgroupV2 {
		readCPUV2(sysfsBase, paths.CPUPath, info)
		readMemoryV2(sysfsBase, paths.MemoryPath, info)
		readCPUStatV2(sysfsBase, paths.CPUPath, info)
	} else {
		readCPUV1(sysfsBase, paths.CPUPath, info)
		readMemoryV1(sysfsBase, paths.MemoryPath, info)
		readCPUStatV1(sysfsBase, paths.CPUPath, info)
		// Use CPUAcctPath for usage (may differ from CPUPath in v1)
		readCPUUsageV1(sysfsBase, paths.CPUAcctPath, info)
	}

	return info, nil
}

func detectCgroupVersion(path string) (CgroupVersion, error) {
	content, err := ReadFileString(path)
	if err != nil {
		return CgroupVersionUnknown, err
	}
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(line, "0::") {
			return CgroupV2, nil
		}
	}
	return CgroupV1, nil
}

func detectContainerRuntime() string {
	if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		return "kubernetes"
	}
	if _, err := os.Stat("/var/run/secrets/kubernetes.io"); err == nil {
		return "kubernetes"
	}

	cgroupContent, _ := ReadFileString("/proc/1/cgroup")
	if strings.Contains(cgroupContent, "/kubepods") {
		return "kubernetes"
	}

	if _, err := os.Stat("/.dockerenv"); err == nil {
		return "docker"
	}
	if strings.Contains(cgroupContent, "/docker") {
		return "docker"
	}

	if strings.Contains(cgroupContent, "cri-containerd") {
		return "containerd"
	}
	if strings.Contains(cgroupContent, "/lxc/") {
		return "lxc"
	}

	for _, line := range strings.Split(cgroupContent, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasSuffix(line, ":/") && !strings.HasSuffix(line, ":/init.scope") {
			return "container"
		}
	}

	return "baremetal"
}

// parseCgroupPaths extracts cgroup paths from /proc/self/cgroup content.
// This function is non-failing: malformed content returns root paths with FallbackUsed=true.
func parseCgroupPaths(content string, version CgroupVersion) *CgroupPaths {
	paths := &CgroupPaths{
		Version:      version,
		FallbackUsed: false,
	}

	if version == CgroupV2 {
		// v2: unified hierarchy, look for line "0::/path"
		for _, line := range strings.Split(content, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "0::") {
				path := strings.TrimPrefix(line, "0::")
				if path == "" {
					path = "/"
				}
				paths.CPUPath = path
				paths.MemoryPath = path
				paths.CPUAcctPath = "" // v2 has no separate cpuacct
				return paths
			}
		}
		// Parse failure: no "0::" line found
		paths.CPUPath = "/"
		paths.MemoryPath = "/"
		paths.FallbackUsed = true
		return paths
	}

	// v1: separate hierarchies for cpu, cpuacct, memory
	cpuFound := false
	memoryFound := false

	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 3)
		if len(parts) < 3 {
			continue
		}
		controllers := parts[1]
		path := parts[2]

		// Parse controller list - may be comma-separated
		controllerList := strings.Split(controllers, ",")
		controllerSet := make(map[string]bool)
		for _, c := range controllerList {
			controllerSet[strings.TrimSpace(c)] = true
		}

		// Handle cpu and cpuacct (may be combined or separate)
		if controllerSet["cpu"] && controllerSet["cpuacct"] {
			// Combined: cpu,cpuacct
			paths.CPUPath = path
			cpuFound = true
		} else if controllerSet["cpu"] {
			// Separate cpu controller
			paths.CPUPath = path
			cpuFound = true
		} else if controllerSet["cpuacct"] {
			// Separate cpuacct controller
			paths.CPUAcctPath = path
		}

		// Handle memory
		if controllerSet["memory"] {
			paths.MemoryPath = path
			memoryFound = true
		}
	}

	// Validate we found required paths
	if !cpuFound || !memoryFound {
		// Parse failure: missing required controllers
		paths.CPUPath = "/"
		paths.CPUAcctPath = ""
		paths.MemoryPath = "/"
		paths.FallbackUsed = true
		return paths
	}

	// If CPUAcctPath is still empty, use CPUPath as fallback
	// (this handles the combined cpu,cpuacct case)
	if paths.CPUAcctPath == "" {
		paths.CPUAcctPath = paths.CPUPath
	}

	return paths
}

func readCPUV1(sysfsBase, cgroupPath string, info *CgroupInfo) {
	// Try nested path first
	quotaPath := filepath.Join(sysfsBase, "cpu", cgroupPath, "cpu.cfs_quota_us")
	quotaStr, err := ReadFileString(quotaPath)
	if err != nil {
		// Nested path missing, try root fallback
		quotaPath = filepath.Join(sysfsBase, "cpu", "cpu.cfs_quota_us")
		quotaStr, err = ReadFileString(quotaPath)
		if err != nil {
			return // Root path also missing
		}
		info.FallbackUsed = true // Mark sysfs fallback
	}

	quota, err := strconv.ParseInt(strings.TrimSpace(quotaStr), 10, 64)
	if err != nil {
		return
	}
	info.CPUQuotaUS = quota

	// Try nested path for period
	periodPath := filepath.Join(sysfsBase, "cpu", cgroupPath, "cpu.cfs_period_us")
	periodStr, err := ReadFileString(periodPath)
	if err != nil {
		// Try root fallback
		periodPath = filepath.Join(sysfsBase, "cpu", "cpu.cfs_period_us")
		periodStr, err = ReadFileString(periodPath)
		if err == nil {
			info.FallbackUsed = true // Mark sysfs fallback
		}
	}

	if err == nil {
		period, err := strconv.ParseInt(strings.TrimSpace(periodStr), 10, 64)
		if err == nil && period > 0 {
			info.CPUPeriodUS = period
		}
	}

	if quota > 0 && info.CPUPeriodUS > 0 {
		info.CPULimitCores = float64(quota) / float64(info.CPUPeriodUS)
	}
}

func readCPUV2(sysfsBase, cgroupPath string, info *CgroupInfo) {
	// Try nested path first
	cpuMaxPath := filepath.Join(sysfsBase, cgroupPath, "cpu.max")
	content, err := ReadFileString(cpuMaxPath)
	if err != nil {
		// Nested path missing, try root fallback
		cpuMaxPath = filepath.Join(sysfsBase, "cpu.max")
		content, err = ReadFileString(cpuMaxPath)
		if err != nil {
			return // Root path also missing
		}
		info.FallbackUsed = true // Mark sysfs fallback
	}

	fields := strings.Fields(content)
	if len(fields) < 2 {
		return
	}

	if fields[0] == "max" {
		info.CPUQuotaUS = -1
		return
	}

	quota, err := strconv.ParseInt(fields[0], 10, 64)
	if err != nil {
		return
	}
	info.CPUQuotaUS = quota

	period, err := strconv.ParseInt(fields[1], 10, 64)
	if err == nil && period > 0 {
		info.CPUPeriodUS = period
	}

	if quota > 0 && info.CPUPeriodUS > 0 {
		info.CPULimitCores = float64(quota) / float64(info.CPUPeriodUS)
	}
}

func readMemoryV1(sysfsBase, cgroupPath string, info *CgroupInfo) {
	// Try nested path first
	limitPath := filepath.Join(sysfsBase, "memory", cgroupPath, "memory.limit_in_bytes")
	val, err := ReadFileUint64(limitPath)
	if err != nil {
		// Nested path missing, try root fallback
		limitPath = filepath.Join(sysfsBase, "memory", "memory.limit_in_bytes")
		val, err = ReadFileUint64(limitPath)
		if err != nil {
			return // Root path also missing
		}
		info.FallbackUsed = true // Mark sysfs fallback
	}

	if val > 9000000000000000000 {
		info.MemoryLimitBytes = -1
		return
	}
	info.MemoryLimitBytes = int64(val)

	// Try nested path for usage
	usagePath := filepath.Join(sysfsBase, "memory", cgroupPath, "memory.usage_in_bytes")
	usage, err := ReadFileUint64(usagePath)
	if err != nil {
		// Try root fallback
		usagePath = filepath.Join(sysfsBase, "memory", "memory.usage_in_bytes")
		usage, err = ReadFileUint64(usagePath)
		if err == nil {
			info.FallbackUsed = true // Mark sysfs fallback
		}
	}

	if err == nil {
		info.MemoryUsageBytes = int64(usage)
	}
}

func readMemoryV2(sysfsBase, cgroupPath string, info *CgroupInfo) {
	// Try nested path first
	memMaxPath := filepath.Join(sysfsBase, cgroupPath, "memory.max")
	content, err := ReadFileString(memMaxPath)
	if err != nil {
		// Nested path missing, try root fallback
		memMaxPath = filepath.Join(sysfsBase, "memory.max")
		content, err = ReadFileString(memMaxPath)
		if err != nil {
			return // Root path also missing
		}
		info.FallbackUsed = true // Mark sysfs fallback
	}

	content = strings.TrimSpace(content)
	if content == "max" {
		info.MemoryLimitBytes = -1
		return
	}
	val, err := strconv.ParseInt(content, 10, 64)
	if err != nil {
		return
	}
	info.MemoryLimitBytes = val

	// Try nested path for usage
	memCurrentPath := filepath.Join(sysfsBase, cgroupPath, "memory.current")
	usage, err := ReadFileUint64(memCurrentPath)
	if err != nil {
		// Try root fallback
		memCurrentPath = filepath.Join(sysfsBase, "memory.current")
		usage, err = ReadFileUint64(memCurrentPath)
		if err == nil {
			info.FallbackUsed = true // Mark sysfs fallback
		}
	}

	if err == nil {
		info.MemoryUsageBytes = int64(usage)
	}
}

func readCPUStatV1(sysfsBase, cgroupPath string, info *CgroupInfo) {
	// Try nested path first
	statPath := filepath.Join(sysfsBase, "cpu", cgroupPath, "cpu.stat")
	err := ScanLines(statPath, func(line string) error {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return nil
		}
		val, _ := strconv.ParseUint(fields[1], 10, 64)
		switch fields[0] {
		case "nr_periods":
			info.NrPeriods = val
		case "nr_throttled":
			info.NrThrottled = val
		case "throttled_time":
			info.ThrottledUS = val / 1000
		}
		return nil
	})

	if err != nil {
		// Nested path missing, try root fallback
		statPath = filepath.Join(sysfsBase, "cpu", "cpu.stat")
		err = ScanLines(statPath, func(line string) error {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				return nil
			}
			val, _ := strconv.ParseUint(fields[1], 10, 64)
			switch fields[0] {
			case "nr_periods":
				info.NrPeriods = val
			case "nr_throttled":
				info.NrThrottled = val
			case "throttled_time":
				info.ThrottledUS = val / 1000
			}
			return nil
		})
		if err == nil {
			info.FallbackUsed = true // Mark sysfs fallback
		}
	}
}

func readCPUStatV2(sysfsBase, cgroupPath string, info *CgroupInfo) {
	// Try nested path first
	statPath := filepath.Join(sysfsBase, cgroupPath, "cpu.stat")
	err := ScanLines(statPath, func(line string) error {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return nil
		}
		val, _ := strconv.ParseUint(fields[1], 10, 64)
		switch fields[0] {
		case "nr_periods":
			info.NrPeriods = val
		case "nr_throttled":
			info.NrThrottled = val
		case "throttled_usec":
			info.ThrottledUS = val
		case "usage_usec":
			info.CPUUsageUS = val
		}
		return nil
	})

	if err != nil {
		// Nested path missing, try root fallback
		statPath = filepath.Join(sysfsBase, "cpu.stat")
		err = ScanLines(statPath, func(line string) error {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				return nil
			}
			val, _ := strconv.ParseUint(fields[1], 10, 64)
			switch fields[0] {
			case "nr_periods":
				info.NrPeriods = val
			case "nr_throttled":
				info.NrThrottled = val
			case "throttled_usec":
				info.ThrottledUS = val
			case "usage_usec":
				info.CPUUsageUS = val
			}
			return nil
		})
		if err == nil {
			info.FallbackUsed = true // Mark sysfs fallback
		}
	}
}

func readCPUUsageV1(sysfsBase, cgroupPath string, info *CgroupInfo) {
	// Try nested path first (cpuacct may be separate from cpu)
	usagePath := filepath.Join(sysfsBase, "cpuacct", cgroupPath, "cpuacct.usage")
	val, err := ReadFileUint64(usagePath)
	if err != nil {
		// Nested path missing, try root fallback
		usagePath = filepath.Join(sysfsBase, "cpuacct", "cpuacct.usage")
		val, err = ReadFileUint64(usagePath)
		if err != nil {
			return // Root path also missing
		}
		info.FallbackUsed = true // Mark sysfs fallback
	}

	info.CPUUsageUS = val / 1000
}
