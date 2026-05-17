package identity

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestMachineIDDetectSuccess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("machine-id not available on windows")
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "machine-id")
	if err := os.WriteFile(path, []byte("abc123def456\n"), 0644); err != nil {
		t.Fatal(err)
	}

	origPaths := machineIDPaths
	machineIDPaths = []string{path}
	defer func() { machineIDPaths = origPaths }()

	p := NewMachineIDProvider()
	id, err := p.Detect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.CloudProvider != ProviderOnPrem {
		t.Errorf("provider = %q, want on-prem", id.CloudProvider)
	}
	if id.InstanceID != "host-abc123def456" {
		t.Errorf("instance_id = %q, want host-abc123def456", id.InstanceID)
	}
}

func TestMachineIDFallbackToDbusPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("machine-id not available on windows")
	}

	dir := t.TempDir()
	missingPath := filepath.Join(dir, "nonexistent")
	dbusPath := filepath.Join(dir, "dbus-machine-id")
	if err := os.WriteFile(dbusPath, []byte("dbus789xyz\n"), 0644); err != nil {
		t.Fatal(err)
	}

	origPaths := machineIDPaths
	machineIDPaths = []string{missingPath, dbusPath}
	defer func() { machineIDPaths = origPaths }()

	p := NewMachineIDProvider()
	id, err := p.Detect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.InstanceID != "host-dbus789xyz" {
		t.Errorf("instance_id = %q, want host-dbus789xyz", id.InstanceID)
	}
}

func TestMachineIDMissingBothPaths(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("machine-id not available on windows")
	}

	dir := t.TempDir()
	origPaths := machineIDPaths
	machineIDPaths = []string{
		filepath.Join(dir, "nonexistent1"),
		filepath.Join(dir, "nonexistent2"),
	}
	defer func() { machineIDPaths = origPaths }()

	p := NewMachineIDProvider()
	_, err := p.Detect(context.Background())
	if err == nil {
		t.Fatal("expected error when both paths missing")
	}
}

func TestMachineIDEmptyFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("machine-id not available on windows")
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "machine-id")
	if err := os.WriteFile(path, []byte("  \n"), 0644); err != nil {
		t.Fatal(err)
	}

	origPaths := machineIDPaths
	machineIDPaths = []string{path}
	defer func() { machineIDPaths = origPaths }()

	p := NewMachineIDProvider()
	_, err := p.Detect(context.Background())
	if err == nil {
		t.Fatal("expected error for empty machine-id file")
	}
}

func TestMachineIDWindowsSkip(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("only runs on windows")
	}

	p := NewMachineIDProvider()
	_, err := p.Detect(context.Background())
	if err == nil {
		t.Fatal("expected error on windows")
	}
}

func TestMachineIDName(t *testing.T) {
	p := NewMachineIDProvider()
	if p.Name() != ProviderOnPrem {
		t.Errorf("name = %q, want on-prem", p.Name())
	}
}
