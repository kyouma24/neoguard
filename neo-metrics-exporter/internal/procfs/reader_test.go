//go:build linux

package procfs

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTempFile(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "testfile")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestReadFileString(t *testing.T) {
	path := writeTempFile(t, "hello world\n")
	s, err := ReadFileString(path)
	if err != nil {
		t.Fatal(err)
	}
	if s != "hello world" {
		t.Errorf("got %q", s)
	}
}

func TestReadFileUint64(t *testing.T) {
	path := writeTempFile(t, "12345\n")
	v, err := ReadFileUint64(path)
	if err != nil {
		t.Fatal(err)
	}
	if v != 12345 {
		t.Errorf("got %d", v)
	}
}

func TestReadFileFloat64(t *testing.T) {
	path := writeTempFile(t, "3.14\n")
	v, err := ReadFileFloat64(path)
	if err != nil {
		t.Fatal(err)
	}
	if v != 3.14 {
		t.Errorf("got %f", v)
	}
}

func TestParseKeyValueFile(t *testing.T) {
	content := `MemTotal:       16384000 kB
MemFree:         8192000 kB
Buffers:          512000 kB
`
	path := writeTempFile(t, content)
	kv, err := ParseKeyValueFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if kv["MemTotal"] != 16384000 {
		t.Errorf("MemTotal = %d", kv["MemTotal"])
	}
	if kv["MemFree"] != 8192000 {
		t.Errorf("MemFree = %d", kv["MemFree"])
	}
	if kv["Buffers"] != 512000 {
		t.Errorf("Buffers = %d", kv["Buffers"])
	}
}

func TestScanLines(t *testing.T) {
	content := "line1\nline2\nline3\n"
	path := writeTempFile(t, content)
	var lines []string
	err := ScanLines(path, func(line string) error {
		lines = append(lines, line)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 3 {
		t.Errorf("got %d lines", len(lines))
	}
}

func TestReadFileMissing(t *testing.T) {
	_, err := ReadFileString("/nonexistent/file")
	if err == nil {
		t.Error("expected error")
	}
}
