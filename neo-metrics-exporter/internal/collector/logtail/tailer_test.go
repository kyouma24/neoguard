package logtail

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeTempLog(t *testing.T, content string) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "logtest-*.log")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return f.Name()
}

func writeTempLogInDir(t *testing.T, dir, content string) string {
	t.Helper()
	f, err := os.CreateTemp(dir, "logtest-*.log")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return f.Name()
}

func collectLines(t *testing.T, tailer *Tailer, count int, timeout time.Duration) []string {
	t.Helper()
	var lines []string
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for i := 0; i < count; i++ {
		select {
		case line, ok := <-tailer.Lines():
			if !ok {
				return lines
			}
			lines = append(lines, line.Text)
		case <-timer.C:
			t.Fatalf("timeout waiting for line %d/%d, got %d lines so far: %v", i+1, count, len(lines), lines)
		}
	}
	return lines
}

// AT-1: Tailer reads existing file from start
func TestTailerReadsFromStart(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("line1\nline2\nline3\n"), 0644)

	tailer := NewTailer(path, &TailerOptions{
		StartPosition: "start",
		PollInterval:  50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	lines := collectLines(t, tailer, 3, 2*time.Second)
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d: %v", len(lines), lines)
	}
	if lines[0] != "line1" || lines[1] != "line2" || lines[2] != "line3" {
		t.Errorf("unexpected lines: %v", lines)
	}
}

// AT-2: Tailer resumes from saved offset (does not re-read already-tailed content)
func TestTailerResumesFromCheckpoint(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("line1\nline2\nline3\n"), 0644)

	stateDir := t.TempDir()

	// First run: read all existing lines, save checkpoint at EOF
	tailer := NewTailer(path, &TailerOptions{
		StateDir:           stateDir,
		StartPosition:      "start",
		CheckpointInterval: 50 * time.Millisecond,
		PollInterval:       50 * time.Millisecond,
	})
	tailer.Start()
	lines := collectLines(t, tailer, 3, 2*time.Second)
	if len(lines) != 3 || lines[0] != "line1" {
		t.Fatalf("expected 3 lines starting with line1, got %v", lines)
	}
	tailer.SaveCheckpoint()
	tailer.Stop()

	// Append new content after checkpoint
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("line4\nline5\n")
	f.Close()

	// Second run: should resume at checkpoint offset, read only new lines
	tailer = NewTailer(path, &TailerOptions{
		StateDir:           stateDir,
		StartPosition:      "start",
		CheckpointInterval: 50 * time.Millisecond,
		PollInterval:       50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()
	lines = collectLines(t, tailer, 2, 2*time.Second)
	if len(lines) != 2 {
		t.Fatalf("expected 2 new lines, got %d: %v", len(lines), lines)
	}
	if lines[0] != "line4" || lines[1] != "line5" {
		t.Errorf("expected [line4, line5], got %v", lines)
	}
}

// AT-3 (cross-platform): Tailer detects rename rotation on startup.
// Tests the identity-mismatch-on-startup path. On Windows, files cannot be
// renamed while open, so rotation is detected on next startup when stored
// cursor identity differs from the current file's identity.
// See tailer_unix_test.go for the live-rotation test (Linux only).
func TestTailerDetectsRenameRotationOnStartup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("old1\nold2\n"), 0644)

	stateDir := t.TempDir()

	// First run: read old lines, checkpoint
	tailer := NewTailer(path, &TailerOptions{
		StateDir:           stateDir,
		StartPosition:      "start",
		CheckpointInterval: 50 * time.Millisecond,
		PollInterval:       50 * time.Millisecond,
	})
	tailer.Start()
	lines := collectLines(t, tailer, 2, 2*time.Second)
	if lines[0] != "old1" || lines[1] != "old2" {
		t.Fatalf("expected [old1, old2], got %v", lines)
	}
	tailer.SaveCheckpoint()
	tailer.Stop()

	// Perform rotation: rename old to .1, create new file at same path
	if err := os.Rename(path, path+".1"); err != nil {
		t.Fatalf("rename failed: %v", err)
	}
	if err := os.WriteFile(path, []byte("new1\nnew2\n"), 0644); err != nil {
		t.Fatalf("write new file failed: %v", err)
	}

	// Second run: tailer detects identity change (stored cursor has old inode,
	// current file has new inode). Should treat as rotation and read from offset 0.
	tailer = NewTailer(path, &TailerOptions{
		StateDir:           stateDir,
		StartPosition:      "start",
		CheckpointInterval: 50 * time.Millisecond,
		PollInterval:       50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	lines = collectLines(t, tailer, 2, 2*time.Second)
	if len(lines) < 2 {
		t.Fatalf("expected 2 new lines after rotation, got %d: %v", len(lines), lines)
	}
	if lines[0] != "new1" || lines[1] != "new2" {
		t.Errorf("expected [new1, new2], got %v", lines)
	}
}

// AT-4 (cross-platform): Tailer handles file disappearance on startup.
// Tests the startup-missing-file path. On Windows, open files cannot be
// deleted, so disappearance is detected on next startup.
// See tailer_unix_test.go for the live-deletion test (Linux only).
func TestTailerHandlesFileDisappearanceOnStartup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("line1\nline2\n"), 0644)

	stateDir := t.TempDir()

	// First run: read content, checkpoint
	tailer := NewTailer(path, &TailerOptions{
		StateDir:           stateDir,
		StartPosition:      "start",
		CheckpointInterval: 50 * time.Millisecond,
		PollInterval:       50 * time.Millisecond,
	})
	tailer.Start()
	collectLines(t, tailer, 2, 2*time.Second)
	tailer.SaveCheckpoint()
	tailer.Stop()

	// Delete the file (handle is closed now)
	os.Remove(path)

	// Second run: file is gone. Tailer should enter poll mode, not panic.
	tailer = NewTailer(path, &TailerOptions{
		StateDir:      stateDir,
		StartPosition: "start",
		PollInterval:  100 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	// Wait for poll cycles
	time.Sleep(250 * time.Millisecond)

	if tailer.ActiveFileCount() != 0 {
		t.Errorf("expected 0 active files when file is missing, got %d", tailer.ActiveFileCount())
	}
	if tailer.metrics.missingPolls.Load() < 1 {
		t.Error("expected missing_files counter to be incremented")
	}

	// File reappears
	os.WriteFile(path, []byte("recovered1\n"), 0644)
	time.Sleep(200 * time.Millisecond)

	lines := collectLines(t, tailer, 1, 2*time.Second)
	if lines[0] != "recovered1" {
		t.Errorf("expected 'recovered1', got %q", lines[0])
	}
}

// AT-5: Tailer detects copytruncate and resets to offset 0
func TestTailerDetectsCopytruncate(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("line1\nline2\nline3\n"), 0644)

	stateDir := t.TempDir()
	tailer := NewTailer(path, &TailerOptions{
		StateDir:           stateDir,
		StartPosition:      "start",
		CheckpointInterval: 50 * time.Millisecond,
		PollInterval:       50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	// Read all existing lines
	collectLines(t, tailer, 3, 2*time.Second)
	tailer.SaveCheckpoint()

	// Simulate copytruncate: truncate then write new content
	os.Truncate(path, 0)
	time.Sleep(500 * time.Millisecond)
	os.WriteFile(path, []byte("new1\nnew2\n"), 0644)

	// Should detect truncation and read new content from offset 0
	lines := collectLines(t, tailer, 2, 5*time.Second)
	if len(lines) < 2 {
		t.Fatalf("expected 2 new lines after truncation, got %d: %v", len(lines), lines)
	}
	if lines[0] != "new1" || lines[1] != "new2" {
		t.Errorf("unexpected lines after truncation: %v", lines)
	}

	if tailer.metrics.truncations.Load() < 1 {
		t.Error("expected truncation counter to be incremented")
	}
}

// AT-6: First watch with start_position=end skips existing content
func TestTailerStartPositionEnd(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("old1\nold2\nold3\n"), 0644)

	tailer := NewTailer(path, &TailerOptions{
		StartPosition: "end",
		PollInterval:  50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	// Wait for tailer to be ready
	time.Sleep(100 * time.Millisecond)

	// Append new content
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("new1\n")
	f.Close()

	// Should only read new line
	lines := collectLines(t, tailer, 1, 2*time.Second)
	if lines[0] != "new1" {
		t.Errorf("expected 'new1', got %q", lines[0])
	}
}

// AT-7: Periodic checkpoint persistence (deterministic with injected interval)
func TestTailerPeriodicCheckpoint(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	os.WriteFile(path, []byte("line1\nline2\nline3\n"), 0644)

	stateDir := t.TempDir()
	os.MkdirAll(filepath.Join(stateDir, "log_cursors"), 0750)

	tailer := NewTailer(path, &TailerOptions{
		StateDir:           stateDir,
		StartPosition:      "start",
		CheckpointInterval: 100 * time.Millisecond,
		PollInterval:       50 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	// Read 1 line
	collectLines(t, tailer, 1, 2*time.Second)

	// Wait for checkpoint (interval is 100ms)
	time.Sleep(200 * time.Millisecond)

	// Verify checkpoint file exists
	pathHash := PathHash(path)
	checkpointPath := filepath.Join(stateDir, "log_cursors", pathHash+".json")

	data, err := os.ReadFile(checkpointPath)
	if err != nil {
		t.Fatalf("checkpoint file should exist: %v", err)
	}

	var cursor Cursor
	if err := json.Unmarshal(data, &cursor); err != nil {
		t.Fatalf("invalid checkpoint JSON: %v", err)
	}
	if cursor.Offset <= 0 {
		t.Errorf("cursor offset should be > 0, got %d", cursor.Offset)
	}
	if cursor.ConfiguredPath != path {
		t.Errorf("cursor path = %q, want %q", cursor.ConfiguredPath, path)
	}
	if time.Since(cursor.LastCheckpoint) > 1*time.Second {
		t.Errorf("last_checkpoint too old: %v", cursor.LastCheckpoint)
	}
}

// AT-8: Missing file polling and resume on appearance
func TestTailerMissingFilePollAndResume(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "missing.log")

	tailer := NewTailer(path, &TailerOptions{
		StartPosition: "start",
		PollInterval:  100 * time.Millisecond,
	})
	tailer.Start()
	defer tailer.Stop()

	// Wait for a few poll cycles (file doesn't exist)
	time.Sleep(250 * time.Millisecond)

	if tailer.metrics.missingPolls.Load() < 1 {
		t.Error("expected missing_files counter to be incremented during polling")
	}

	// Create the file
	os.WriteFile(path, []byte("appeared1\nappeared2\n"), 0644)

	// Wait for poll to detect it
	time.Sleep(200 * time.Millisecond)

	lines := collectLines(t, tailer, 2, 2*time.Second)
	if len(lines) < 2 {
		t.Fatalf("expected 2 lines after file appeared, got %d", len(lines))
	}
	if lines[0] != "appeared1" || lines[1] != "appeared2" {
		t.Errorf("unexpected lines: %v", lines)
	}
}

// Test: cursor store save and load round-trip
func TestCursorStoreRoundTrip(t *testing.T) {
	stateDir := t.TempDir()
	store := NewCursorStore(stateDir)

	cursor := &Cursor{
		ConfiguredPath: "/var/log/app.log",
		PlatformFileIdentity: FileIdentity{
			Device: 2049,
			Inode:  12345678,
		},
		Offset:         987654,
		FileSize:       1048576,
		LastCheckpoint: time.Now().UTC().Truncate(time.Millisecond),
	}

	if err := store.Save("/var/log/app.log", cursor); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := store.Load("/var/log/app.log")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if loaded.ConfiguredPath != cursor.ConfiguredPath {
		t.Errorf("path = %q, want %q", loaded.ConfiguredPath, cursor.ConfiguredPath)
	}
	if loaded.Offset != cursor.Offset {
		t.Errorf("offset = %d, want %d", loaded.Offset, cursor.Offset)
	}
	if loaded.PlatformFileIdentity.Device != cursor.PlatformFileIdentity.Device {
		t.Errorf("device = %d, want %d", loaded.PlatformFileIdentity.Device, cursor.PlatformFileIdentity.Device)
	}
	if loaded.PlatformFileIdentity.Inode != cursor.PlatformFileIdentity.Inode {
		t.Errorf("inode = %d, want %d", loaded.PlatformFileIdentity.Inode, cursor.PlatformFileIdentity.Inode)
	}
}

// Test: PathHash produces consistent 16-char hex
func TestPathHash(t *testing.T) {
	hash := PathHash("/var/log/app.log")
	if len(hash) != 16 {
		t.Errorf("PathHash length = %d, want 16", len(hash))
	}

	hash2 := PathHash("/var/log/app.log")
	if hash != hash2 {
		t.Error("PathHash should be deterministic")
	}

	hash3 := PathHash("/var/log/other.log")
	if hash == hash3 {
		t.Error("different paths should produce different hashes")
	}
}
