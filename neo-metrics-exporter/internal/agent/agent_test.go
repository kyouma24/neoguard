package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
)

func testConfig(endpoint string) *config.Config {
	return &config.Config{
		APIKey:         "obl_live_v2_testkey123456",
		Endpoint:       endpoint,
		CloudDetection: "skip",
		ExtraTags:      map[string]string{"env": "test"},
		Collection: config.CollectionConfig{
			IntervalSeconds:        10,
			ProcessIntervalSeconds: 30,
			SlowIntervalSeconds:    120,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 2,
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
			Level:  "info",
			Format: "json",
		},
	}
}

func TestNewAgent(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a := New(cfg, "0.1.0-test", "")
	if a == nil {
		t.Fatal("agent is nil")
	}
}

func TestAgentBuildCollectors(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a := New(cfg, "test", "")

	collectors := a.buildCollectors()
	if len(collectors) == 0 {
		t.Error("no collectors built")
	}

	names := make(map[string]bool)
	for _, c := range collectors {
		names[c.Name()] = true
	}

	required := []string{"cpu", "memory", "disk", "diskio", "network", "system", "netstat", "process", "portmap", "container", "agentself"}
	for _, name := range required {
		if !names[name] {
			t.Errorf("missing collector: %s", name)
		}
	}
}

func TestAgentBuildCompositeCollectors(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a := New(cfg, "test", "")

	composites := a.buildCompositeCollectors()
	if len(composites) != 3 {
		t.Errorf("expected 3 composite collectors, got %d", len(composites))
	}

	names := make(map[string]bool)
	for _, c := range composites {
		names[c.Name()] = true
	}

	for _, name := range []string{"healthscore", "saturation", "correlation"} {
		if !names[name] {
			t.Errorf("missing composite collector: %s", name)
		}
	}
}

func TestAgentBuildCompositeCollectorsDisabled(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	cfg.Collectors.Disabled = []string{"healthscore", "correlation"}
	a := New(cfg, "test", "")

	composites := a.buildCompositeCollectors()
	for _, c := range composites {
		if c.Name() == "healthscore" {
			t.Error("healthscore should be disabled")
		}
		if c.Name() == "correlation" {
			t.Error("correlation should be disabled")
		}
	}
}

func TestAgentBuildCollectorsWithDisabled(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	cfg.Collectors.Disabled = []string{"netstat", "sensors", "process", "portmap", "container"}
	a := New(cfg, "test", "")

	collectors := a.buildCollectors()
	for _, c := range collectors {
		if c.Name() == "netstat" {
			t.Error("netstat should be disabled")
		}
		if c.Name() == "process" {
			t.Error("process should be disabled")
		}
		if c.Name() == "portmap" {
			t.Error("portmap should be disabled")
		}
		if c.Name() == "container" {
			t.Error("container should be disabled")
		}
	}

	slow := a.buildSlowCollectors()
	for _, c := range slow {
		if c.Name() == "sensors" {
			t.Error("sensors should be disabled")
		}
	}
}

func TestAgentCollectOnce(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a := New(cfg, "test", "")

	collectors := a.buildCollectors()
	composites := a.buildCompositeCollectors()
	baseTags := map[string]string{"hostname": "test", "os": "test"}

	a.collectOnce(context.Background(), collectors, composites, baseTags)

	if a.buf.Len() == 0 {
		t.Error("buffer should have metrics after collectOnce")
	}
}

func TestAgentTestConnection(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"accepted": 1}`))
	}))
	defer srv.Close()

	cfg := testConfig(srv.URL)
	a := New(cfg, "test", "")

	err := a.TestConnection()
	if err != nil {
		t.Fatal(err)
	}
}

func TestAgentTestConnectionFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	cfg := testConfig(srv.URL)
	a := New(cfg, "test", "")

	err := a.TestConnection()
	if err == nil {
		t.Fatal("expected error for 403")
	}
}

func TestAgentRunShortLived(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	cfg := testConfig(srv.URL)
	cfg.Collection.IntervalSeconds = 10
	cfg.Transport.BatchMaxIntervalSeconds = 1
	a := New(cfg, "test", "")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err := a.Run(ctx)
	if err != nil {
		t.Fatal(err)
	}
}
