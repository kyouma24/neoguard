package agent

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/transport"
)

func TestIntegrationFullPipeline(t *testing.T) {
	var batchCount atomic.Int32
	var totalPoints atomic.Int64

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"id":"test-id","agent_id_external":"a","status":"active","negotiated_schema_version":1,"heartbeat_interval_seconds":30,"first_registration":true}`))
			return
		}
		if r.URL.Path == "/api/v1/agents/heartbeat" || r.URL.Path == "/api/v1/agents/stopping" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
			return
		}
		if r.URL.Path != "/api/v1/metrics/ingest" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		if r.Header.Get("Authorization") == "" {
			t.Error("missing Authorization header")
		}
		if r.Header.Get("Content-Encoding") != "gzip" {
			t.Error("missing gzip encoding")
		}
		if r.Header.Get("X-NeoGuard-Agent-Version") == "" {
			t.Error("missing agent version header")
		}

		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			t.Errorf("gzip decode: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		defer gz.Close()

		body, _ := io.ReadAll(gz)
		var batch model.MetricBatch
		if err := json.Unmarshal(body, &batch); err != nil {
			t.Errorf("json decode: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		batchCount.Add(1)
		totalPoints.Add(int64(len(batch.Metrics)))

		for _, m := range batch.Metrics {
			if m.Name == "" {
				t.Error("metric has empty name")
			}
			if m.Timestamp.IsZero() {
				t.Error("metric has zero timestamp")
			}
			if _, ok := m.Tags["hostname"]; !ok {
				if _, ok2 := m.Tags["agent_version"]; !ok2 {
					t.Error("metric missing base tags")
				}
			}
		}

		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"accepted":` + json.Number(string(rune('0'+len(batch.Metrics)%10))).String() + `}`))
	}))
	defer srv.Close()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_integration_test",
		Endpoint:       srv.URL,
		CloudDetection: "skip",
		ExtraTags:      map[string]string{"env": "integration-test"},
		Collection: config.CollectionConfig{
			IntervalSeconds:        10,
			ProcessIntervalSeconds: 30,
			SlowIntervalSeconds:    60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 1,
			RequestTimeoutSeconds:   5,
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 100000,
		},
		Disk: config.DiskConfig{
			ExcludeMounts:  []string{"/proc", "/sys", "/dev"},
			ExcludeFSTypes: []string{"tmpfs"},
		},
		Network: config.NetworkConfig{
			ExcludeInterfaces: []string{"lo"},
		},
		Logging: config.LoggingConfig{
			Level:  "warn",
			Format: "text",
		},
		Process: config.ProcessConfig{TopN: 5},
	}

	a, err := New(cfg, "integration-test", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	err = a.Run(ctx)
	if err != nil {
		t.Fatal("agent.Run returned error:", err)
	}

	batches := batchCount.Load()
	points := totalPoints.Load()

	if batches == 0 {
		t.Fatal("no batches received — pipeline broken")
	}
	if points == 0 {
		t.Fatal("no points received — collection broken")
	}

	t.Logf("Integration test: %d batches, %d total points", batches, points)

	if points < 20 {
		t.Errorf("expected at least 20 points (basic collectors), got %d", points)
	}
}

func TestIntegrationServerDown(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"id":"test-id","agent_id_external":"a","status":"active","negotiated_schema_version":1,"heartbeat_interval_seconds":30,"first_registration":true}`))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_test_down_12345",
		Endpoint:       srv.URL,
		CloudDetection: "skip",
		ExtraTags:      map[string]string{},
		Collection: config.CollectionConfig{
			IntervalSeconds:        10,
			ProcessIntervalSeconds: 30,
			SlowIntervalSeconds:    60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 1,
			RequestTimeoutSeconds:   2,
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 10000,
		},
		Disk: config.DiskConfig{
			ExcludeMounts:  []string{"/proc", "/sys", "/dev"},
			ExcludeFSTypes: []string{"tmpfs"},
		},
		Network: config.NetworkConfig{
			ExcludeInterfaces: []string{"lo"},
		},
		Logging: config.LoggingConfig{
			Level:  "error",
			Format: "text",
		},
	}

	a, err := New(cfg, "test-down", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = a.Run(ctx)
	if err != nil {
		t.Fatal("agent should shut down cleanly even when server is down:", err)
	}

	if a.stats.SendErrors.Load() == 0 {
		t.Error("expected send errors when server returns 503")
	}
}

func TestIntegrationWALReplay(t *testing.T) {
	dir := t.TempDir()
	var points atomic.Int64

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"id":"test-id","agent_id_external":"a","status":"active","negotiated_schema_version":1,"heartbeat_interval_seconds":30,"first_registration":true}`))
			return
		}
		if r.URL.Path == "/api/v1/agents/heartbeat" || r.URL.Path == "/api/v1/agents/stopping" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
			return
		}
		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		defer gz.Close()
		body, _ := io.ReadAll(gz)
		var batch model.MetricBatch
		json.Unmarshal(body, &batch)
		points.Add(int64(len(batch.Metrics)))
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_wal_test_123456",
		Endpoint:       srv.URL,
		CloudDetection: "skip",
		ExtraTags:      map[string]string{},
		Collection: config.CollectionConfig{
			IntervalSeconds:        10,
			ProcessIntervalSeconds: 30,
			SlowIntervalSeconds:    60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 1,
			RequestTimeoutSeconds:   5,
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 100000,
			WALDir:         dir,
		},
		Disk: config.DiskConfig{
			ExcludeMounts:  []string{"/proc", "/sys", "/dev"},
			ExcludeFSTypes: []string{"tmpfs"},
		},
		Network: config.NetworkConfig{
			ExcludeInterfaces: []string{"lo"},
		},
		Logging: config.LoggingConfig{
			Level:  "warn",
			Format: "text",
		},
	}

	a, err := New(cfg, "wal-test", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = a.Run(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if points.Load() == 0 {
		t.Error("no points sent with WAL enabled")
	}
	t.Logf("WAL integration: %d points sent", points.Load())
}

func TestAgentEmitsPressureMetrics(t *testing.T) {
	dir := t.TempDir()
	var receivedPoints []model.MetricPoint
	var mu sync.Mutex

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			w.Header().Set("Date", time.Now().UTC().Format(http.TimeFormat))
			json.NewEncoder(w).Encode(transport.RegisterResponse{
				ID:                      "test-id",
				AgentIDExternal:         "test-agent",
				Status:                  "active",
				NegotiatedSchemaVersion: 1,
				HeartbeatIntervalSecs:   300,
				FirstRegistration:       true,
			})
			return
		}
		if r.URL.Path == "/api/v1/agents/heartbeat" || r.URL.Path == "/api/v1/agents/stopping" {
			json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return
		}
		if r.URL.Path == "/api/v1/metrics/ingest" {
			// Decompress if gzipped
			body := r.Body
			if r.Header.Get("Content-Encoding") == "gzip" {
				gz, err := gzip.NewReader(r.Body)
				if err != nil {
					t.Errorf("gzip decode: %v", err)
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				defer gz.Close()
				body = gz
			}

			var batch model.MetricBatch
			if err := json.NewDecoder(body).Decode(&batch); err != nil {
				t.Errorf("json decode: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}

			mu.Lock()
			receivedPoints = append(receivedPoints, batch.Metrics...)
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := &config.Config{
		Endpoint: srv.URL,
		APIKey:   "test-key",
		Buffer: config.BufferConfig{
			MemoryMaxItems: 1000,
			WALDir:         dir,
		},
		Collection: config.CollectionConfig{
			IntervalSeconds:        1,
			ProcessIntervalSeconds: 5,
			SlowIntervalSeconds:    10,
		},
		Collectors: config.CollectorsConfig{
			Disabled: []string{}, // Explicitly enable all collectors including agentself
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            500,
			BatchMaxIntervalSeconds: 1,
			RequestTimeoutSeconds:   5,
			DeadLetter: config.DeadLetterConfig{
				Enabled:    true,
				Dir:        filepath.Join(dir, "dead-letter"),
				MaxFiles:   10,
				MaxTotalMB: 100,
			},
		},
		CloudDetection: "skip",
		StateDir:       dir,
	}

	a, err := New(cfg, "test-version", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	errChan := make(chan error, 1)
	go func() {
		errChan <- a.Run(ctx)
	}()

	// Wait for collection cycles
	time.Sleep(2 * time.Second)
	cancel()

	// Check Run error
	err = <-errChan
	if err != nil && err != context.Canceled {
		t.Fatalf("Run() returned unexpected error: %v", err)
	}

	mu.Lock()
	points := append([]model.MetricPoint{}, receivedPoints...)
	mu.Unlock()

	// Check for 7 new pressure metrics
	expectedMetrics := []string{
		"agent.wal.size_bytes",
		"agent.wal.frames_total",
		"agent.wal.corrupted_frames_total",
		"agent.wal.write_rejections_total",
		"agent.wal.dropped_points_total",
		"agent.dead_letter.files_written_total",
		"agent.dead_letter.files_evicted_total",
	}

	foundMetrics := make(map[string]*model.MetricPoint)
	for i := range points {
		for _, name := range expectedMetrics {
			if points[i].Name == name {
				foundMetrics[name] = &points[i]
				break
			}
		}
	}

	for _, name := range expectedMetrics {
		metric, found := foundMetrics[name]
		if !found {
			t.Errorf("missing pressure metric: %s", name)
			continue
		}

		// Verify base tags are present
		if metric.Tags["hostname"] == "" {
			t.Errorf("metric %s missing hostname tag", name)
		}
		if metric.Tags["agent_version"] == "" {
			t.Errorf("metric %s missing agent_version tag", name)
		}
		if metric.Tags["os"] == "" {
			t.Errorf("metric %s missing os tag", name)
		}
		if metric.Tags["cloud_provider"] == "" {
			t.Errorf("metric %s missing cloud_provider tag", name)
		}
	}

	if len(foundMetrics) != len(expectedMetrics) {
		t.Errorf("found %d/%d expected pressure metrics", len(foundMetrics), len(expectedMetrics))
	}
}

func TestIntegrationLogPipelineEndToEnd(t *testing.T) {
	dir := t.TempDir()

	// Create a source log file with content written before the agent starts
	logFile := filepath.Join(dir, "app.log")
	if err := os.WriteFile(logFile, []byte("first log line\nsecond log line\n"), 0644); err != nil {
		t.Fatal(err)
	}

	var logEnvelopes []model.LogEnvelope
	var mu sync.Mutex
	logReceived := make(chan struct{}, 1)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/agents/register":
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(transport.RegisterResponse{
				ID:                      "test-id",
				AgentIDExternal:         "test-agent-logs",
				Status:                  "active",
				NegotiatedSchemaVersion: 1,
				HeartbeatIntervalSecs:   300,
				FirstRegistration:       true,
			})
		case "/api/v1/agents/heartbeat", "/api/v1/agents/stopping":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
		case "/api/v1/metrics/ingest":
			// Accept metrics silently
			io.Copy(io.Discard, r.Body)
			w.WriteHeader(http.StatusAccepted)
		case "/api/v1/logs/ingest":
			body := r.Body
			if r.Header.Get("Content-Encoding") == "gzip" {
				gz, err := gzip.NewReader(r.Body)
				if err != nil {
					t.Errorf("gzip decode: %v", err)
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				defer gz.Close()
				body = gz
			}

			var env model.LogEnvelope
			if err := json.NewDecoder(body).Decode(&env); err != nil {
				t.Errorf("json decode: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}

			mu.Lock()
			logEnvelopes = append(logEnvelopes, env)
			mu.Unlock()

			select {
			case logReceived <- struct{}{}:
			default:
			}

			w.WriteHeader(http.StatusAccepted)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_log_integration_test",
		Endpoint:       srv.URL,
		CloudDetection: "skip",
		StateDir:       dir,
		ExtraTags:      map[string]string{},
		Collection: config.CollectionConfig{
			IntervalSeconds:        10,
			ProcessIntervalSeconds: 30,
			SlowIntervalSeconds:    60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 1,
			RequestTimeoutSeconds:   5,
			DeadLetter: config.DeadLetterConfig{
				Enabled:    true,
				Dir:        filepath.Join(dir, "dead-letter"),
				MaxFiles:   10,
				MaxTotalMB: 100,
			},
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 10000,
		},
		Disk: config.DiskConfig{
			ExcludeMounts:  []string{"/proc", "/sys", "/dev"},
			ExcludeFSTypes: []string{"tmpfs"},
		},
		Network: config.NetworkConfig{
			ExcludeInterfaces: []string{"lo"},
		},
		Logging: config.LoggingConfig{
			Level:  "warn",
			Format: "text",
		},
		Logs: config.LogsConfig{
			Enabled: true,
			Sources: []config.LogSource{
				{
					Path:          logFile,
					Service:       "test-app",
					StartPosition: "start",
					Parser:        config.ParserConfig{Mode: "raw"},
				},
			},
			Spool: config.SpoolConfig{
				MaxSizeMB:            100,
				HighWatermarkPct:     80,
				CriticalWatermarkPct: 95,
			},
		},
	}

	a, err := New(cfg, "9.8.7", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- a.Run(ctx)
	}()

	// Wait for at least one log envelope to arrive (initial file content)
	select {
	case <-logReceived:
	case <-time.After(8 * time.Second):
		cancel()
		t.Fatal("timed out waiting for log envelope")
	}

	// Write additional content after agent is running to prove live tailing works
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("third line after start\n")
	f.Close()

	// Wait for the live-tailed line to arrive in a second envelope
	select {
	case <-logReceived:
	case <-time.After(8 * time.Second):
		cancel()
		t.Fatal("timed out waiting for live-tailed log envelope")
	}

	cancel()

	if err := <-errCh; err != nil {
		t.Fatal("agent.Run returned error:", err)
	}

	mu.Lock()
	envelopes := append([]model.LogEnvelope{}, logEnvelopes...)
	mu.Unlock()

	if len(envelopes) == 0 {
		t.Fatal("no log envelopes received — log pipeline broken")
	}

	// Collect all log entries across envelopes
	var allEntries []model.LogEntry
	for _, env := range envelopes {
		// Verify envelope-level fields
		if env.AgentID == "" {
			t.Error("envelope missing agent_id")
		}
		if env.AgentVersion != "9.8.7" {
			t.Errorf("envelope agent_version = %q, want %q", env.AgentVersion, "9.8.7")
		}
		if env.SchemaVersion != 1 {
			t.Errorf("envelope schema_version = %d, want 1", env.SchemaVersion)
		}
		allEntries = append(allEntries, env.Logs...)
	}

	if len(allEntries) < 3 {
		t.Fatalf("expected at least 3 log entries (2 initial + 1 live-tailed), got %d", len(allEntries))
	}

	// Verify identity tags present and tenant_id absent
	for i, entry := range allEntries {
		if entry.Tags["hostname"] == "" {
			t.Errorf("entry[%d] missing hostname tag", i)
		}
		if entry.Tags["agent_version"] != "9.8.7" {
			t.Errorf("entry[%d] agent_version = %q, want %q", i, entry.Tags["agent_version"], "9.8.7")
		}
		if _, hasTenant := entry.Tags["tenant_id"]; hasTenant {
			t.Errorf("entry[%d] contains tenant_id — contract violation", i)
		}
		if entry.Service != "test-app" {
			t.Errorf("entry[%d] Service = %q, want %q", i, entry.Service, "test-app")
		}
		if entry.Source != logFile {
			t.Errorf("entry[%d] Source = %q, want %q", i, entry.Source, logFile)
		}
	}

	// Verify messages contain expected content
	messages := make(map[string]bool)
	for _, e := range allEntries {
		messages[e.Message] = true
	}
	if !messages["first log line"] {
		t.Error("missing 'first log line' in received entries")
	}
	if !messages["second log line"] {
		t.Error("missing 'second log line' in received entries")
	}
	if !messages["third line after start"] {
		t.Error("missing 'third line after start' — live tailing broken")
	}

	t.Logf("Log integration: %d envelopes, %d total entries", len(envelopes), len(allEntries))
}

func TestLogShipperRunBlocksUntilShutdownSendCompletes(t *testing.T) {
	dir := t.TempDir()

	logFile := filepath.Join(dir, "block.log")
	if err := os.WriteFile(logFile, []byte("line-for-shutdown-test\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Server that delays log responses by 2 seconds to prove Run waits
	var logSendTime atomic.Int64

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/agents/register":
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(transport.RegisterResponse{
				ID:                      "test-id",
				AgentIDExternal:         "block-test-agent",
				Status:                  "active",
				NegotiatedSchemaVersion: 1,
				HeartbeatIntervalSecs:   300,
				FirstRegistration:       true,
			})
		case "/api/v1/agents/heartbeat", "/api/v1/agents/stopping":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
		case "/api/v1/metrics/ingest":
			io.Copy(io.Discard, r.Body)
			w.WriteHeader(http.StatusAccepted)
		case "/api/v1/logs/ingest":
			// Delay to simulate slow send during shutdown
			time.Sleep(2 * time.Second)
			logSendTime.Store(time.Now().UnixMilli())
			w.WriteHeader(http.StatusAccepted)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_block_test_key",
		Endpoint:       srv.URL,
		CloudDetection: "skip",
		StateDir:       dir,
		ExtraTags:      map[string]string{},
		Collection: config.CollectionConfig{
			IntervalSeconds:        60,
			ProcessIntervalSeconds: 60,
			SlowIntervalSeconds:    60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 60,
			RequestTimeoutSeconds:   5,
			DeadLetter: config.DeadLetterConfig{
				Enabled:    true,
				Dir:        filepath.Join(dir, "dead-letter"),
				MaxFiles:   10,
				MaxTotalMB: 100,
			},
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 10000,
		},
		Disk: config.DiskConfig{
			ExcludeMounts:  []string{"/proc", "/sys", "/dev"},
			ExcludeFSTypes: []string{"tmpfs"},
		},
		Network: config.NetworkConfig{
			ExcludeInterfaces: []string{"lo"},
		},
		Logging: config.LoggingConfig{
			Level:  "warn",
			Format: "text",
		},
		Logs: config.LogsConfig{
			Enabled: true,
			Sources: []config.LogSource{
				{
					Path:          logFile,
					Service:       "block-test",
					StartPosition: "start",
					Parser:        config.ParserConfig{Mode: "raw"},
				},
			},
			Spool: config.SpoolConfig{
				MaxSizeMB:            100,
				HighWatermarkPct:     80,
				CriticalWatermarkPct: 95,
			},
		},
	}

	a, err := New(cfg, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() {
		errCh <- a.Run(ctx)
	}()

	// Let the agent start and the log line flow into ring/spool
	time.Sleep(3 * time.Second)

	// Cancel context — shutdown begins. shutdownSend will call the slow /logs/ingest endpoint.
	cancelTime := time.Now().UnixMilli()
	cancel()

	// Run must not return until shutdownSend completes (2s server delay)
	if err := <-errCh; err != nil {
		t.Fatal("agent.Run returned error:", err)
	}
	runReturnTime := time.Now().UnixMilli()

	sendTime := logSendTime.Load()
	if sendTime == 0 {
		t.Fatal("log send never completed during shutdown — shutdownSend not called")
	}

	// Run must have returned AFTER the slow log send completed
	if runReturnTime < sendTime {
		t.Errorf("Run returned at %d, before log send completed at %d — not waiting for shipper", runReturnTime, sendTime)
	}

	// The send must have started after cancel (proving it's the shutdown path)
	if sendTime < cancelTime {
		t.Errorf("log send at %d was before cancel at %d — not a shutdown send", sendTime, cancelTime)
	}

	t.Logf("Lifecycle: cancel=%dms, send_complete=%dms, run_return=%dms (send waited %dms)",
		cancelTime, sendTime, runReturnTime, sendTime-cancelTime)
}

func TestLogShutdownDrainDoesNotLoseBufferedLines(t *testing.T) {
	dir := t.TempDir()

	logFile := filepath.Join(dir, "drain.log")
	if err := os.WriteFile(logFile, []byte{}, 0644); err != nil {
		t.Fatal(err)
	}

	var logEnvelopes []model.LogEnvelope
	var mu sync.Mutex

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/agents/register":
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(transport.RegisterResponse{
				ID:                      "test-id",
				AgentIDExternal:         "drain-test",
				Status:                  "active",
				NegotiatedSchemaVersion: 1,
				HeartbeatIntervalSecs:   300,
				FirstRegistration:       true,
			})
		case "/api/v1/agents/heartbeat", "/api/v1/agents/stopping":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
		case "/api/v1/metrics/ingest":
			io.Copy(io.Discard, r.Body)
			w.WriteHeader(http.StatusAccepted)
		case "/api/v1/logs/ingest":
			body := r.Body
			if r.Header.Get("Content-Encoding") == "gzip" {
				gz, err := gzip.NewReader(r.Body)
				if err != nil {
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				defer gz.Close()
				body = gz
			}
			var env model.LogEnvelope
			if err := json.NewDecoder(body).Decode(&env); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			mu.Lock()
			logEnvelopes = append(logEnvelopes, env)
			mu.Unlock()
			w.WriteHeader(http.StatusAccepted)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	cfg := &config.Config{
		APIKey:         "obl_live_v2_drain_test_key_1",
		Endpoint:       srv.URL,
		CloudDetection: "skip",
		StateDir:       dir,
		ExtraTags:      map[string]string{},
		Collection: config.CollectionConfig{
			IntervalSeconds:        60,
			ProcessIntervalSeconds: 60,
			SlowIntervalSeconds:    60,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 60,
			RequestTimeoutSeconds:   5,
			DeadLetter: config.DeadLetterConfig{
				Enabled:    true,
				Dir:        filepath.Join(dir, "dead-letter"),
				MaxFiles:   10,
				MaxTotalMB: 100,
			},
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 10000,
		},
		Disk: config.DiskConfig{
			ExcludeMounts:  []string{"/proc", "/sys", "/dev"},
			ExcludeFSTypes: []string{"tmpfs"},
		},
		Network: config.NetworkConfig{
			ExcludeInterfaces: []string{"lo"},
		},
		Logging: config.LoggingConfig{
			Level:  "warn",
			Format: "text",
		},
		Logs: config.LogsConfig{
			Enabled: true,
			Sources: []config.LogSource{
				{
					Path:          logFile,
					Service:       "drain-svc",
					StartPosition: "start",
					Parser:        config.ParserConfig{Mode: "raw"},
				},
			},
			Spool: config.SpoolConfig{
				MaxSizeMB:            100,
				HighWatermarkPct:     80,
				CriticalWatermarkPct: 95,
			},
		},
	}

	a, err := New(cfg, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() {
		errCh <- a.Run(ctx)
	}()

	// Wait for agent to start and log pipeline to be running
	time.Sleep(2 * time.Second)

	// Write lines rapidly — these will be read by the tailer into its 100k buffered channel.
	// The shipper flush interval is 5s, so at the moment of cancellation there will be
	// lines sitting in the tailer channel that haven't been processed by the collector yet.
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 50; i++ {
		fmt.Fprintf(f, "drain-line-%03d\n", i)
	}
	f.Close()

	// Brief pause to let tailer read lines into its channel buffer
	time.Sleep(500 * time.Millisecond)

	// Cancel immediately — lines should be in tailer channel, some possibly not yet in ring
	cancel()

	if err := <-errCh; err != nil {
		t.Fatal("agent.Run returned error:", err)
	}

	// Collect all received log entries
	mu.Lock()
	var allEntries []model.LogEntry
	for _, env := range logEnvelopes {
		allEntries = append(allEntries, env.Logs...)
	}
	mu.Unlock()

	// ALL 50 lines must have been delivered — none lost during shutdown
	messages := make(map[string]bool)
	for _, e := range allEntries {
		messages[e.Message] = true
	}

	var missing []string
	for i := 0; i < 50; i++ {
		msg := fmt.Sprintf("drain-line-%03d", i)
		if !messages[msg] {
			missing = append(missing, msg)
		}
	}

	if len(missing) > 0 {
		t.Errorf("shutdown drain lost %d/%d lines. First missing: %v", len(missing), 50, missing[:min(5, len(missing))])
	}

	t.Logf("Shutdown drain: %d entries received, %d expected, %d missing", len(allEntries), 50, len(missing))
}
