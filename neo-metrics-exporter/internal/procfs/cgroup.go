//go:build linux

package procfs

import (
	"os"
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

	version, err := detectCgroupVersion(cgroupPath)
	if err != nil {
		return info, err
	}
	info.Version = version

	info.ContainerRuntime = detectContainerRuntime()
	info.IsContainer = info.ContainerRuntime != "baremetal"

	if version == CgroupV2 {
		readCPUV2(sysfsBase, info)
		readMemoryV2(sysfsBase, info)
		readCPUStatV2(sysfsBase, info)
	} else {
		readCPUV1(sysfsBase, info)
		readMemoryV1(sysfsBase, info)
		readCPUStatV1(sysfsBase, info)
		readCPUUsageV1(sysfsBase, info)
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

func readCPUV1(sysfsBase string, info *CgroupInfo) {
	quotaStr, err := ReadFileString(sysfsBase + "/cpu/cpu.cfs_quota_us")
	if err != nil {
		return
	}
	quota, err := strconv.ParseInt(strings.TrimSpace(quotaStr), 10, 64)
	if err != nil {
		return
	}
	info.CPUQuotaUS = quota

	periodStr, err := ReadFileString(sysfsBase + "/cpu/cpu.cfs_period_us")
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

func readCPUV2(sysfsBase string, info *CgroupInfo) {
	content, err := ReadFileString(sysfsBase + "/cpu.max")
	if err != nil {
		return
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

func readMemoryV1(sysfsBase string, info *CgroupInfo) {
	val, err := ReadFileUint64(sysfsBase + "/memory/memory.limit_in_bytes")
	if err != nil {
		return
	}
	if val > 9000000000000000000 {
		info.MemoryLimitBytes = -1
		return
	}
	info.MemoryLimitBytes = int64(val)

	usage, err := ReadFileUint64(sysfsBase + "/memory/memory.usage_in_bytes")
	if err == nil {
		info.MemoryUsageBytes = int64(usage)
	}
}

func readMemoryV2(sysfsBase string, info *CgroupInfo) {
	content, err := ReadFileString(sysfsBase + "/memory.max")
	if err != nil {
		return
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

	usage, err := ReadFileUint64(sysfsBase + "/memory.current")
	if err == nil {
		info.MemoryUsageBytes = int64(usage)
	}
}

func readCPUStatV1(sysfsBase string, info *CgroupInfo) {
	_ = ScanLines(sysfsBase+"/cpu/cpu.stat", func(line string) error {
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
}

func readCPUStatV2(sysfsBase string, info *CgroupInfo) {
	_ = ScanLines(sysfsBase+"/cpu.stat", func(line string) error {
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
}

func readCPUUsageV1(sysfsBase string, info *CgroupInfo) {
	val, err := ReadFileUint64(sysfsBase + "/cpuacct/cpuacct.usage")
	if err != nil {
		return
	}
	info.CPUUsageUS = val / 1000
}
