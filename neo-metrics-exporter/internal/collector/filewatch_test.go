package collector

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
)

func TestFileWatchCollectorName(t *testing.T) {
	c := NewFileWatchCollector(config.FileWatchConfig{})
	if c.Name() != "filewatch" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestFileWatchExistingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")
	os.WriteFile(path, []byte("hello world"), 0644)

	c := NewFileWatchCollector(config.FileWatchConfig{
		Paths:    []string{path},
		MaxFiles: 10,
	})

	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	hasExists := false
	hasSize := false
	hasAge := false
	for _, p := range points {
		switch p.Name {
		case "system.file.exists":
			hasExists = true
			if p.Value != 1 {
				t.Errorf("exists = %f, want 1", p.Value)
			}
		case "system.file.size_bytes":
			hasSize = true
			if p.Value != 11 {
				t.Errorf("size = %f, want 11", p.Value)
			}
		case "system.file.age_seconds":
			hasAge = true
			if p.Value < 0 {
				t.Errorf("age = %f, should be >= 0", p.Value)
			}
		}
		if p.Tags["filename"] != "test.log" {
			t.Errorf("filename = %q, want test.log", p.Tags["filename"])
		}
	}

	if !hasExists {
		t.Error("missing system.file.exists")
	}
	if !hasSize {
		t.Error("missing system.file.size_bytes")
	}
	if !hasAge {
		t.Error("missing system.file.age_seconds")
	}
}

func TestFileWatchMissingFile(t *testing.T) {
	c := NewFileWatchCollector(config.FileWatchConfig{
		Paths:    []string{"/nonexistent/file/12345"},
		MaxFiles: 10,
	})

	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	if len(points) != 1 {
		t.Fatalf("expected 1 point (exists=0), got %d", len(points))
	}
	if points[0].Name != "system.file.exists" || points[0].Value != 0 {
		t.Errorf("expected exists=0, got %s=%f", points[0].Name, points[0].Value)
	}
}

func TestFileWatchGlobPattern(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"a.log", "b.log", "c.log"} {
		os.WriteFile(filepath.Join(dir, name), []byte("data"), 0644)
	}

	c := NewFileWatchCollector(config.FileWatchConfig{
		Paths:    []string{filepath.Join(dir, "*.log")},
		MaxFiles: 50,
	})

	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	existsCount := 0
	for _, p := range points {
		if p.Name == "system.file.exists" {
			existsCount++
		}
	}
	if existsCount != 3 {
		t.Errorf("expected 3 files, got %d", existsCount)
	}
}

func TestFileWatchMaxFiles(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 10; i++ {
		os.WriteFile(filepath.Join(dir, filepath.Base(t.Name())+string(rune('a'+i))+".log"), []byte("x"), 0644)
	}

	c := NewFileWatchCollector(config.FileWatchConfig{
		Paths:    []string{filepath.Join(dir, "*.log")},
		MaxFiles: 3,
	})

	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	existsCount := 0
	for _, p := range points {
		if p.Name == "system.file.exists" {
			existsCount++
		}
	}
	if existsCount != 3 {
		t.Errorf("expected 3 files (capped), got %d", existsCount)
	}
}

func TestFileWatchGrowthRate(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "growing.log")
	os.WriteFile(path, []byte("small"), 0644)

	c := NewFileWatchCollector(config.FileWatchConfig{
		Paths:    []string{path},
		MaxFiles: 10,
	})

	c.Collect(context.Background(), map[string]string{})

	// Backdate the stored sample so elapsed > 0 on next Compute
	c.rate.mu.Lock()
	for k, s := range c.rate.samples {
		s.ts = s.ts.Add(-10 * time.Second)
		c.rate.samples[k] = s
	}
	c.rate.mu.Unlock()

	os.WriteFile(path, []byte("this is much larger content now"), 0644)

	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	hasGrowth := false
	for _, p := range points {
		if p.Name == "system.file.growth_bytes_per_sec" {
			hasGrowth = true
		}
	}
	if !hasGrowth {
		t.Error("missing growth rate on second collection")
	}
}

func TestFileWatchEmptyConfig(t *testing.T) {
	c := NewFileWatchCollector(config.FileWatchConfig{})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 0 {
		t.Errorf("expected no points with no paths, got %d", len(points))
	}
}
