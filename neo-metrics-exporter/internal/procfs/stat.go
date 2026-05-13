//go:build linux

package procfs

import (
	"strconv"
	"strings"
)

type Stat struct {
	ContextSwitches uint64
	Interrupts      uint64
	Forks           uint64
	ProcsRunning    uint64
	ProcsBlocked    uint64
	SoftIRQ         map[string]uint64
}

func ReadStat() (*Stat, error) {
	return ReadStatFrom("/proc/stat")
}

func ReadStatFrom(path string) (*Stat, error) {
	s := &Stat{SoftIRQ: make(map[string]uint64)}

	err := ScanLines(path, func(line string) error {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return nil
		}

		switch fields[0] {
		case "ctxt":
			s.ContextSwitches, _ = strconv.ParseUint(fields[1], 10, 64)
		case "intr":
			s.Interrupts, _ = strconv.ParseUint(fields[1], 10, 64)
		case "processes":
			s.Forks, _ = strconv.ParseUint(fields[1], 10, 64)
		case "procs_running":
			s.ProcsRunning, _ = strconv.ParseUint(fields[1], 10, 64)
		case "procs_blocked":
			s.ProcsBlocked, _ = strconv.ParseUint(fields[1], 10, 64)
		case "softirq":
			if len(fields) > 1 {
				s.SoftIRQ["total"], _ = strconv.ParseUint(fields[1], 10, 64)
			}
			names := []string{"total", "hi", "timer", "net_tx", "net_rx", "block", "irq_poll", "tasklet", "sched", "hrtimer", "rcu"}
			for i := 1; i < len(fields) && i < len(names); i++ {
				s.SoftIRQ[names[i]], _ = strconv.ParseUint(fields[i], 10, 64)
			}
		}
		return nil
	})

	return s, err
}
