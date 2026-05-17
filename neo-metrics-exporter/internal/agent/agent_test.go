package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/collector"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
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
	a, err := New(cfg, "0.1.0-test", "")
	if err != nil {
		t.Fatal(err)
	}
	if a == nil {
		t.Fatal("agent is nil")
	}
}

func TestAgentBuildCollectors(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
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
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

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
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

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
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
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
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
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
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	err = a.TestConnection()
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
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	err = a.TestConnection()
	if err == nil {
		t.Fatal("expected error for 403")
	}
}

func TestAgentRunShortLived(t *testing.T) {
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
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	cfg := testConfig(srv.URL)
	cfg.Collection.IntervalSeconds = 10
	cfg.Transport.BatchMaxIntervalSeconds = 1
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err = a.Run(ctx)
	if err != nil {
		t.Fatal(err)
	}
}

func TestWarmUpPopulatesRateComputer(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
	baseTags := map[string]string{"hostname": "test"}

	// Warm up seeds rate computers
	a.warmUpCollectors(context.Background(), collectors, baseTags)

	// Second collection should produce rate metrics
	time.Sleep(100 * time.Millisecond)
	var allPoints []model.MetricPoint
	for _, c := range collectors {
		pts, _ := c.Collect(context.Background(), baseTags)
		allPoints = append(allPoints, pts...)
	}

	hasRate := false
	for _, p := range allPoints {
		if strings.Contains(p.Name, "_per_sec") {
			hasRate = true
			break
		}
	}
	if !hasRate {
		t.Error("no rate metrics after warm-up + second collection")
	}
}

func TestWarmUpDiscardsResults(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
	baseTags := map[string]string{"hostname": "test"}

	a.warmUpCollectors(context.Background(), collectors, baseTags)

	if a.buf.Len() != 0 {
		t.Errorf("buffer has %d items after warm-up, want 0", a.buf.Len())
	}
}

func TestWarmUpRespectsContext(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
	baseTags := map[string]string{"hostname": "test"}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // pre-cancelled

	start := time.Now()
	a.warmUpCollectors(ctx, collectors, baseTags)
	elapsed := time.Since(start)

	if elapsed > 2*time.Second {
		t.Errorf("warm-up with cancelled context took %v, should be near-instant", elapsed)
	}
}

func TestWarmUpEnablesRateBaseline(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
	baseTags := map[string]string{"hostname": "test"}

	// Find a rate-using collector (network)
	var netCollector collector.Collector
	for _, c := range collectors {
		if c.Name() == "network" {
			netCollector = c
			break
		}
	}
	if netCollector == nil {
		t.Skip("no network collector available")
	}

	// First collection without warm-up: no previous sample, no rate metrics
	points1, _ := netCollector.Collect(context.Background(), baseTags)
	rateCount1 := 0
	for _, p := range points1 {
		if strings.Contains(p.Name, "_per_sec") {
			rateCount1++
		}
	}

	// Warm up seeds rate computer
	a.warmUpCollectors(context.Background(), collectors, baseTags)
	time.Sleep(100 * time.Millisecond)

	// Collection after warm-up: rate metrics should now be present
	points2, _ := netCollector.Collect(context.Background(), baseTags)
	rateCount2 := 0
	for _, p := range points2 {
		if strings.Contains(p.Name, "_per_sec") {
			rateCount2++
		}
	}

	if rateCount2 <= rateCount1 {
		t.Errorf("expected more rate metrics after warm-up: before=%d after=%d", rateCount1, rateCount2)
	}
}

func TestFirstCollectionAfterWarmUpHasRates(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
	composites := a.buildCompositeCollectors()
	baseTags := map[string]string{"hostname": "test"}

	// Warm up
	a.warmUpCollectors(context.Background(), collectors, baseTags)

	// Small gap for measurable deltas
	time.Sleep(100 * time.Millisecond)

	// First real collection
	a.collectOnce(context.Background(), collectors, composites, baseTags)

	if a.buf.Len() == 0 {
		t.Fatal("buffer empty after first collectOnce")
	}

	// Drain and check for rate metrics
	result := a.buf.DrainWithMeta(100000)
	hasRate := false
	for _, p := range result.Points {
		if strings.Contains(p.Name, "_per_sec") {
			hasRate = true
			break
		}
	}
	if !hasRate {
		t.Error("first collection after warm-up has no _per_sec rate metrics")
	}
}

func TestWarmUpTimingGap(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}
	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}
	composites := a.buildCompositeCollectors()
	baseTags := map[string]string{"hostname": "test"}

	// Warm up then immediate collect (minimal gap)
	a.warmUpCollectors(context.Background(), collectors, baseTags)
	a.collectOnce(context.Background(), collectors, composites, baseTags)

	result := a.buf.DrainWithMeta(100000)
	for _, p := range result.Points {
		if strings.Contains(p.Name, "_per_sec") && p.Value < 0 {
			t.Errorf("negative rate %q = %f", p.Name, p.Value)
		}
	}
}

func TestCollectCmdlineConfigWiring(t *testing.T) {
	cfg := testConfig("http://localhost:8000")
	cfg.Process.CollectCmdline = true
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	collectors, err := a.buildCollectors()
	if err != nil {
		t.Fatal(err)
	}

	var procCollector collector.Collector
	for _, c := range collectors {
		if c.Name() == "process" {
			procCollector = c
			break
		}
	}
	if procCollector == nil {
		t.Fatal("process collector not found")
	}

	baseTags := map[string]string{"hostname": "test"}
	points, err := procCollector.Collect(context.Background(), baseTags)
	if err != nil {
		t.Fatal(err)
	}

	hasCmdline := false
	for _, p := range points {
		if _, ok := p.Tags["process_cmdline"]; ok {
			hasCmdline = true
			break
		}
	}
	if !hasCmdline {
		t.Error("CollectCmdline=true but no point has process_cmdline tag")
	}
}

func TestLifecycleRegisterPrecedesMetricIngest(t *testing.T) {
	var registerTime, firstIngestTime atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			registerTime.CompareAndSwap(0, time.Now().UnixNano())
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"id": "id", "agent_id_external": "a", "status": "active",
				"negotiated_schema_version": 1, "heartbeat_interval_seconds": 30, "first_registration": true,
			})
			return
		}
		if r.URL.Path == "/api/v1/agents/heartbeat" || r.URL.Path == "/api/v1/agents/stopping" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
			return
		}
		if r.URL.Path == "/api/v1/metrics/ingest" {
			firstIngestTime.CompareAndSwap(0, time.Now().UnixNano())
			w.WriteHeader(http.StatusAccepted)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := testConfig(srv.URL)
	cfg.Collection.IntervalSeconds = 10
	cfg.Transport.BatchMaxIntervalSeconds = 1
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_ = a.Run(ctx)

	regT := registerTime.Load()
	ingT := firstIngestTime.Load()
	if regT == 0 {
		t.Fatal("register was never called")
	}
	if ingT == 0 {
		t.Fatal("ingest was never called")
	}
	if regT >= ingT {
		t.Errorf("register (%d) was not before first ingest (%d)", regT, ingT)
	}
}

func TestLifecycleFailedRegistrationSendsNoMetrics(t *testing.T) {
	var ingestCalled atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if r.URL.Path == "/api/v1/metrics/ingest" {
			ingestCalled.Store(true)
			w.WriteHeader(http.StatusAccepted)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := testConfig(srv.URL)
	cfg.Collection.IntervalSeconds = 10
	cfg.Transport.BatchMaxIntervalSeconds = 1
	a, err := New(cfg, "test", "")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err = a.Run(ctx)
	if err == nil {
		t.Fatal("expected Run to return error when registration fails")
	}
	if ingestCalled.Load() {
		t.Error("metrics were sent despite registration failure")
	}
}

func TestAgentStrictClockCheckFailure(t *testing.T) {
	// Mock backend that returns Date header with severe clock skew
	var registerCalled atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			registerCalled.Store(true)
			// Server time is 400 seconds in the past (exceeds 300s threshold)
			serverTime := time.Now().Add(-400 * time.Second)
			w.Header().Set("Date", serverTime.UTC().Format(http.TimeFormat))
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"id":                        "test-agent-id",
				"agent_id_external":         "test",
				"status":                    "active",
				"negotiated_schema_version": 1,
				"heartbeat_interval_seconds": 30,
				"first_registration":        true,
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := &config.Config{
		APIKey:   "test-key",
		Endpoint: srv.URL,
		Clock: config.ClockConfig{
			StrictClockCheck: true, // Enable strict mode
		},
		Collection: config.CollectionConfig{
			IntervalSeconds:        60,
			ProcessIntervalSeconds: 30,
			SlowIntervalSeconds:    120,
		},
		Transport: config.TransportConfig{
			BatchMaxSize:            5000,
			BatchMaxIntervalSeconds: 10,
			RequestTimeoutSeconds:   30,
		},
		Buffer: config.BufferConfig{
			MemoryMaxItems: 100000,
		},
		Collectors: config.CollectorsConfig{
			Disabled: []string{"all"},
		},
	}

	a, err := New(cfg, "test-version", "")
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err = a.Run(ctx)
	if err == nil {
		t.Fatal("expected Run to return error when strict clock check fails")
	}

	// Verify error is ErrStrictClockSkew
	if !errors.Is(err, ErrStrictClockSkew) {
		t.Errorf("expected ErrStrictClockSkew, got: %v", err)
	}

	// Verify registration was called (skew detected after registration)
	if !registerCalled.Load() {
		t.Error("registration should have been called before strict check")
	}
}

func TestNewAgentRejectsInvalidLogParserRegex(t *testing.T) {
	dir := t.TempDir()
	cfg := testConfig("http://localhost:9999")
	cfg.StateDir = dir
	cfg.Logs = config.LogsConfig{
		Enabled: true,
		Sources: []config.LogSource{
			{
				Path:    "/var/log/app.log",
				Service: "app",
				Parser:  config.ParserConfig{Mode: "regex", Pattern: "[invalid(regex"},
			},
		},
		Spool: config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95},
	}

	_, err := New(cfg, "1.0.0", "")
	if err == nil {
		t.Fatal("expected error for invalid regex pattern, got nil")
	}
	if !strings.Contains(err.Error(), "parser") {
		t.Errorf("error should mention parser, got: %v", err)
	}
}

func TestAgentRunFailsOnInvalidLogConfig(t *testing.T) {
	dir := t.TempDir()
	cfg := testConfig("http://localhost:9999")
	cfg.StateDir = dir
	cfg.Logs = config.LogsConfig{
		Enabled: true,
		Sources: []config.LogSource{
			{
				Path:    "/var/log/app.log",
				Service: "app",
				Parser:  config.ParserConfig{Mode: "unknown_mode_xyz"},
			},
		},
		Spool: config.SpoolConfig{MaxSizeMB: 100, HighWatermarkPct: 80, CriticalWatermarkPct: 95},
	}

	_, err := New(cfg, "1.0.0", "")
	if err == nil {
		t.Fatal("expected error for unknown parser mode, got nil")
	}
}
