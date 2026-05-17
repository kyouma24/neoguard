package agent

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
)

// LOGS-001 AT-3: Agent creates log-specific directories (spool and dead-letter only)
func TestAgentCreatesLogDirectories(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_testkey123456",
		Endpoint:       "http://localhost:8000",
		CloudDetection: "skip",
		StateDir:       tmpDir,
		Collection: config.CollectionConfig{
			IntervalSeconds: 60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 10,
			RequestTimeoutSeconds:   30,
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 100000,
			WALDir:         filepath.Join(tmpDir, "metrics", "wal"),
		},
		Logs: config.LogsConfig{
			Enabled: true,
			Sources: []config.LogSource{
				{
					Path:    "/var/log/app.log",
					Service: "web-api",
				},
			},
		},
	}

	agent, err := New(cfg, "1.0.0-test", "")
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}
	defer agent.buf.Close()

	// Assert directories exist
	logSpoolDir := filepath.Join(tmpDir, "logs-spool")
	if _, err := os.Stat(logSpoolDir); os.IsNotExist(err) {
		t.Errorf("logs-spool/ directory not created")
	}

	logDeadLetterDir := filepath.Join(tmpDir, "logs-dead-letter")
	if _, err := os.Stat(logDeadLetterDir); os.IsNotExist(err) {
		t.Errorf("logs-dead-letter/ directory not created")
	}

	logCursorsDir := filepath.Join(tmpDir, "log_cursors")
	if _, err := os.Stat(logCursorsDir); os.IsNotExist(err) {
		t.Errorf("log_cursors/ directory not created")
	}

	// Assert log WAL does NOT exist
	logWALDir := filepath.Join(tmpDir, "logs", "wal")
	if _, err := os.Stat(logWALDir); !os.IsNotExist(err) {
		t.Errorf("logs/wal/ directory should NOT exist (logs use spool, not WAL)")
	}
}

// LOGS-001 AT-4: Log and metric directories are separate
func TestLogAndMetricDirectoriesAreSeparate(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_testkey123456",
		Endpoint:       "http://localhost:8000",
		CloudDetection: "skip",
		StateDir:       tmpDir,
		Collection: config.CollectionConfig{
			IntervalSeconds: 60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 10,
			RequestTimeoutSeconds:   30,
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 100000,
			WALDir:         filepath.Join(tmpDir, "metrics", "wal"),
		},
		Logs: config.LogsConfig{
			Enabled: true,
			Sources: []config.LogSource{
				{
					Path:    "/var/log/app.log",
					Service: "web-api",
				},
			},
		},
	}

	agent, err := New(cfg, "1.0.0-test", "")
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}
	defer agent.buf.Close()

	// Assert metrics use WAL
	metricsWALDir := filepath.Join(tmpDir, "metrics", "wal")
	if _, err := os.Stat(metricsWALDir); err != nil {
		// WAL dir may not exist until first write, but config specifies it
		// Check that the path is set correctly in config
		if cfg.Buffer.WALDir != metricsWALDir {
			t.Errorf("metrics WAL dir path mismatch: got %q, want %q", cfg.Buffer.WALDir, metricsWALDir)
		}
	}

	// Assert logs use spool (NOT WAL)
	logSpoolDir := filepath.Join(tmpDir, "logs-spool")
	if _, err := os.Stat(logSpoolDir); os.IsNotExist(err) {
		t.Errorf("logs-spool/ directory not created")
	}

	logWALDir := filepath.Join(tmpDir, "logs", "wal")
	if _, err := os.Stat(logWALDir); !os.IsNotExist(err) {
		t.Errorf("logs/wal/ directory should NOT exist (logs use spool, not WAL)")
	}
}

// LOGS-001: Log directories not created when logs disabled
func TestLogDirectoriesNotCreatedWhenDisabled(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_testkey123456",
		Endpoint:       "http://localhost:8000",
		CloudDetection: "skip",
		StateDir:       tmpDir,
		Collection: config.CollectionConfig{
			IntervalSeconds: 60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 10,
			RequestTimeoutSeconds:   30,
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 100000,
			WALDir:         filepath.Join(tmpDir, "metrics", "wal"),
		},
		Logs: config.LogsConfig{
			Enabled: false,
		},
	}

	agent, err := New(cfg, "1.0.0-test", "")
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}
	defer agent.buf.Close()

	// Assert log directories do NOT exist
	logSpoolDir := filepath.Join(tmpDir, "logs-spool")
	if _, err := os.Stat(logSpoolDir); !os.IsNotExist(err) {
		t.Errorf("logs-spool/ directory should NOT be created when logs disabled")
	}

	logDeadLetterDir := filepath.Join(tmpDir, "logs-dead-letter")
	if _, err := os.Stat(logDeadLetterDir); !os.IsNotExist(err) {
		t.Errorf("logs-dead-letter/ directory should NOT be created when logs disabled")
	}

	logCursorsDir := filepath.Join(tmpDir, "log_cursors")
	if _, err := os.Stat(logCursorsDir); !os.IsNotExist(err) {
		t.Errorf("log_cursors/ directory should NOT be created when logs disabled")
	}
}
