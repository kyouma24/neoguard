//go:build linux

package collector

func PlatformCollectors(disabled func(string) bool) []Collector {
	var cs []Collector

	if !disabled("vmstat") {
		cs = append(cs, NewVMStatCollector())
	}
	if !disabled("sockstat") {
		cs = append(cs, NewSockstatCollector())
	}
	if !disabled("filefd") {
		cs = append(cs, NewFileFDCollector())
	}
	if !disabled("cpustat") {
		cs = append(cs, NewCPUStatCollector())
	}

	return cs
}

func PlatformSlowCollectors(disabled func(string) bool) []Collector {
	var cs []Collector

	if !disabled("entropy") {
		cs = append(cs, NewEntropyCollector())
	}
	if !disabled("pressure") {
		cs = append(cs, NewPressureCollector())
	}
	if !disabled("conntrack") {
		cs = append(cs, NewConntrackCollector())
	}

	return cs
}
