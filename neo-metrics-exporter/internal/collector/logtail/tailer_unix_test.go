//go:build !windows

package logtail

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// AT-3 (Linux): Live rename rotation while tailer is actively running.
// On Linux, os.Rename succeeds on open files. The tailer detects identity change
// during its EOF rotation check, drains the old handle, and opens the new file at offset 0.
func TestTailerLiveRenameRotation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("old1\nold2\n"), 0644)

	tailer := NewTailer(path, &TailerOptions{
		StartPosition: "start",
		PollInterval:  50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	// Read old lines while tailer is running
	lines := collectLines(t, tailer, 2, 2*time.Second)
	if lines[0] != "old1" || lines[1] != "old2" {
		t.Fatalf("expected [old1, old2], got %v", lines)
	}

	// Rotate live: rename old file, create new file at same path
	if err := os.Rename(path, path+".1"); err != nil {
		t.Fatalf("rename failed: %v", err)
	}
	// Small delay to ensure tailer's next rotation check sees the rename
	time.Sleep(50 * time.Millisecond)
	if err := os.WriteFile(path, []byte("new1\nnew2\n"), 0644); err != nil {
		t.Fatalf("write new file failed: %v", err)
	}

	// Tailer should detect identity change, drain old handle, open new file at offset 0
	lines = collectLines(t, tailer, 2, 3*time.Second)
	if len(lines) < 2 {
		t.Fatalf("expected 2 new lines after live rotation, got %d: %v", len(lines), lines)
	}
	if lines[0] != "new1" || lines[1] != "new2" {
		t.Errorf("expected [new1, new2], got %v", lines)
	}

	// Verify rotation counter incremented
	if tailer.metrics.rotations.Load() < 1 {
		t.Error("expected rotations counter to be incremented")
	}
}

// AT-4 (Linux): Live file deletion while tailer is actively running.
// On Linux, os.Remove (unlink) succeeds on open files. The tailer detects
// the path no longer exists during its EOF rotation check and deactivates.
func TestTailerLiveFileDeletion(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("line1\n"), 0644)

	tailer := NewTailer(path, &TailerOptions{
		StartPosition: "start",
		PollInterval:  50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	// Read line while tailer is running
	lines := collectLines(t, tailer, 1, 2*time.Second)
	if lines[0] != "line1" {
		t.Fatalf("expected line1, got %q", lines[0])
	}

	// Delete the file while tailer is running (unlink succeeds on Linux)
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove failed: %v", err)
	}

	// Wait for tailer to detect disappearance via rotation check
	time.Sleep(500 * time.Millisecond)

	if tailer.ActiveFileCount() != 0 {
		t.Errorf("expected 0 active files after live deletion, got %d", tailer.ActiveFileCount())
	}
}
