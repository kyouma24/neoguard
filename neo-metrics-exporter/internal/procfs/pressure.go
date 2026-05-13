//go:build linux

package procfs

import (
	"fmt"
	"strconv"
	"strings"
)

type PressureMetric struct {
	Avg10  float64
	Avg60  float64
	Avg300 float64
	Total  uint64
}

type Pressure struct {
	CPU    *PressureEntry
	Memory *PressureEntry
	IO     *PressureEntry
}

type PressureEntry struct {
	Some *PressureMetric
	Full *PressureMetric
}

func ReadPressure() (*Pressure, error) {
	p := &Pressure{}
	var err error

	p.CPU, err = readPressureFile("/proc/pressure/cpu")
	if err != nil {
		return p, nil
	}

	p.Memory, _ = readPressureFile("/proc/pressure/memory")
	p.IO, _ = readPressureFile("/proc/pressure/io")

	return p, nil
}

func ReadPressureFrom(cpuPath, memPath, ioPath string) (*Pressure, error) {
	p := &Pressure{}
	p.CPU, _ = readPressureFile(cpuPath)
	p.Memory, _ = readPressureFile(memPath)
	p.IO, _ = readPressureFile(ioPath)
	return p, nil
}

func readPressureFile(path string) (*PressureEntry, error) {
	entry := &PressureEntry{}

	err := ScanLines(path, func(line string) error {
		metric, lineType, parseErr := parsePressureLine(line)
		if parseErr != nil {
			return nil
		}
		switch lineType {
		case "some":
			entry.Some = metric
		case "full":
			entry.Full = metric
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return entry, nil
}

func parsePressureLine(line string) (*PressureMetric, string, error) {
	fields := strings.Fields(line)
	if len(fields) < 4 {
		return nil, "", fmt.Errorf("too few fields")
	}

	lineType := fields[0]
	m := &PressureMetric{}

	for _, field := range fields[1:] {
		parts := strings.SplitN(field, "=", 2)
		if len(parts) != 2 {
			continue
		}
		switch parts[0] {
		case "avg10":
			m.Avg10, _ = strconv.ParseFloat(parts[1], 64)
		case "avg60":
			m.Avg60, _ = strconv.ParseFloat(parts[1], 64)
		case "avg300":
			m.Avg300, _ = strconv.ParseFloat(parts[1], 64)
		case "total":
			m.Total, _ = strconv.ParseUint(parts[1], 10, 64)
		}
	}

	return m, lineType, nil
}
