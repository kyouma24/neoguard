package agent

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestIntegrationFullPipeline(t *testing.T) {
	var batchCount atomic.Int32
	var totalPoints atomic.Int64

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

	a := New(cfg, "integration-test", "")

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	err := a.Run(ctx)
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

	a := New(cfg, "test-down", "")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := a.Run(ctx)
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

	a := New(cfg, "wal-test", "")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := a.Run(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if points.Load() == 0 {
		t.Error("no points sent with WAL enabled")
	}
	t.Logf("WAL integration: %d points sent", points.Load())
}
