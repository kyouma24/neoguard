//go:build linux

package procfs

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const maxLineLength = 4096

func ReadFileString(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if len(data) > 1<<20 {
		return "", fmt.Errorf("file too large: %s (%d bytes)", path, len(data))
	}
	return strings.TrimSpace(string(data)), nil
}

func ReadFileUint64(path string) (uint64, error) {
	s, err := ReadFileString(path)
	if err != nil {
		return 0, err
	}
	return strconv.ParseUint(s, 10, 64)
}

func ReadFileFloat64(path string) (float64, error) {
	s, err := ReadFileString(path)
	if err != nil {
		return 0, err
	}
	return strconv.ParseFloat(s, 64)
}

func ParseKeyValueFile(path string) (map[string]uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	result := make(map[string]uint64)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, maxLineLength), maxLineLength)

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := strings.TrimSuffix(fields[0], ":")
		val, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		result[key] = val
	}

	return result, scanner.Err()
}

func ScanLines(path string, fn func(line string) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, maxLineLength), maxLineLength)

	for scanner.Scan() {
		if err := fn(scanner.Text()); err != nil {
			return err
		}
	}
	return scanner.Err()
}
