package collector

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/collector/logtail"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/identity"
)

func TestLogCollectorProcessLineInjectsAgentVersion(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{
		AgentID:  "agent-abc",
		Hostname: "testhost",
		OS:       "linux",
	}
	sources := []config.LogSource{
		{Path: "/var/log/test.log", Service: "testsvc", Parser: config.ParserConfig{Mode: "raw"}},
	}

	coll, err := NewLogCollector(id, "2.5.0", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "hello world", Source: "/var/log/test.log"})

	entries := ring.Read(1, 0)
	if len(entries) != 1 {
		t.Fatal("expected 1 entry in ring")
	}

	if entries[0].Tags["agent_version"] != "2.5.0" {
		t.Errorf("agent_version = %q, want %q", entries[0].Tags["agent_version"], "2.5.0")
	}
}

func TestLogCollectorProcessLineExcludesTenantID(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{
		AgentID:  "agent-xyz",
		Hostname: "myhost",
		OS:       "linux",
	}
	// Manually inject tenant_id into identity tags to prove it's excluded
	sources := []config.LogSource{
		{Path: "/app/app.log", Service: "webapp", Parser: config.ParserConfig{Mode: "raw"}},
	}

	coll, err := NewLogCollector(id, "3.0.1", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "test log line", Source: "/app/app.log"})

	entries := ring.Read(1, 0)
	if len(entries) != 1 {
		t.Fatal("expected 1 entry in ring")
	}

	if _, ok := entries[0].Tags["tenant_id"]; ok {
		t.Error("tenant_id present in entry tags — contract violation")
	}
}

func TestLogCollectorProcessLineSetsServiceAndSource(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{Path: "/logs/svc.log", Service: "payment-api", Parser: config.ParserConfig{Mode: "raw"}},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "transaction complete", Source: "/logs/svc.log"})

	entries := ring.Read(1, 0)
	if len(entries) != 1 {
		t.Fatal("expected 1 entry")
	}

	if entries[0].Service != "payment-api" {
		t.Errorf("Service = %q, want %q", entries[0].Service, "payment-api")
	}
	if entries[0].Source != "/logs/svc.log" {
		t.Errorf("Source = %q, want %q", entries[0].Source, "/logs/svc.log")
	}
}

func TestLogCollectorProcessLineIdentityTags(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{
		AgentID:  "agent-123",
		Hostname: "prod-host",
		OS:       "linux",
		Region:   "us-east-1",
	}
	sources := []config.LogSource{
		{Path: "/app.log", Service: "app", Parser: config.ParserConfig{Mode: "raw"}},
	}

	coll, err := NewLogCollector(id, "4.2.0", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "msg", Source: "/app.log"})

	entries := ring.Read(1, 0)
	if len(entries) != 1 {
		t.Fatal("expected 1 entry")
	}

	tags := entries[0].Tags
	if tags["hostname"] != "prod-host" {
		t.Errorf("hostname = %q, want %q", tags["hostname"], "prod-host")
	}
	if tags["region"] != "us-east-1" {
		t.Errorf("region = %q, want %q", tags["region"], "us-east-1")
	}
	if tags["agent_id"] != "agent-123" {
		t.Errorf("agent_id = %q, want %q", tags["agent_id"], "agent-123")
	}
	if tags["agent_version"] != "4.2.0" {
		t.Errorf("agent_version = %q, want %q", tags["agent_version"], "4.2.0")
	}
}

func TestLogCollectorRedactsBeforeRingWrite(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{Path: "/app.log", Service: "app", Parser: config.ParserConfig{Mode: "raw"}},
	}
	stats := NewLogStats()

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, stats)
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longtoken1234567890", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "key=AKIAIOSFODNN7EXAMPLE", Source: "/app.log"})

	entries := ring.Read(10, 0)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	if entries[0].Message != "auth: Bearer [REDACTED:TOKEN]" {
		t.Errorf("bearer not redacted: %q", entries[0].Message)
	}
	if entries[1].Message != "key=[REDACTED:AWS_KEY]" {
		t.Errorf("aws key not redacted: %q", entries[1].Message)
	}

	// Verify stats emitted
	points := stats.Collect(nil)
	foundBearer := false
	foundAWS := false
	for _, p := range points {
		if p.Name == "agent.logs.redaction_applied" {
			if p.Tags["pattern"] == "bearer" {
				foundBearer = true
			}
			if p.Tags["pattern"] == "aws_key" {
				foundAWS = true
			}
		}
	}
	if !foundBearer {
		t.Error("missing agent.logs.redaction_applied{pattern=bearer}")
	}
	if !foundAWS {
		t.Error("missing agent.logs.redaction_applied{pattern=aws_key}")
	}
}

func TestLogCollectorRedactionDisabled(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{Path: "/app.log", Service: "app", Parser: config.ParserConfig{Mode: "raw"}},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, false, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longtoken1234567890", Source: "/app.log"})

	entries := ring.Read(1, 0)
	if len(entries) != 1 {
		t.Fatal("expected 1 entry")
	}
	if entries[0].Message != "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longtoken1234567890" {
		t.Errorf("message modified when redaction disabled: %q", entries[0].Message)
	}
}

func TestLogCollectorRedactsNestedFlattenedFields(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{Path: "/app.log", Service: "app", Parser: config.ParserConfig{Mode: "json"}},
	}
	stats := NewLogStats()

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, stats)
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{
		Text:   `{"msg":"login attempt","auth":{"password":"hunter2"},"credentials":{"api_key":"sk_live_xxx"}}`,
		Source: "/app.log",
	})

	entries := ring.Read(1, 0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}

	if entries[0].Fields["auth.password"] != "[REDACTED]" {
		t.Errorf("auth.password = %v, want [REDACTED]", entries[0].Fields["auth.password"])
	}
	if entries[0].Fields["credentials.api_key"] != "[REDACTED]" {
		t.Errorf("credentials.api_key = %v, want [REDACTED]", entries[0].Fields["credentials.api_key"])
	}
}

func TestLogCollectorMultilineStartMode(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{
			Path:    "/app.log",
			Service: "app",
			Parser:  config.ParserConfig{Mode: "raw"},
			Multiline: config.MultilineConfig{
				Enabled: true,
				Mode:    "start",
				Pattern: `^\d{4}-\d{2}-\d{2}`,
			},
		},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "2024-01-15 ERROR exception", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "  at line 1", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "  at line 2", Source: "/app.log"})

	// Nothing emitted yet (all buffered)
	entries := ring.Read(10, 0)
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries (buffered), got %d", len(entries))
	}

	// Next start pattern flushes previous
	coll.processLine(logtail.Line{Text: "2024-01-15 INFO next log", Source: "/app.log"})

	entries = ring.Read(10, 0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	want := "2024-01-15 ERROR exception\n  at line 1\n  at line 2"
	if entries[0].Message != want {
		t.Errorf("message = %q, want %q", entries[0].Message, want)
	}
}

func TestLogCollectorMultilineContinueMode(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{
			Path:    "/app.log",
			Service: "app",
			Parser:  config.ParserConfig{Mode: "raw"},
			Multiline: config.MultilineConfig{
				Enabled: true,
				Mode:    "continue",
				Pattern: `^\s`,
			},
		},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "Traceback (most recent call last):", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "  File \"main.py\", line 10", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "  raise ValueError", Source: "/app.log"})
	// Non-continuation flushes
	coll.processLine(logtail.Line{Text: "ValueError: bad input", Source: "/app.log"})

	entries := ring.Read(10, 0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	want := "Traceback (most recent call last):\n  File \"main.py\", line 10\n  raise ValueError"
	if entries[0].Message != want {
		t.Errorf("message = %q, want %q", entries[0].Message, want)
	}
}

func TestLogCollectorMultilineDisabledPassesThrough(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{
			Path:    "/app.log",
			Service: "app",
			Parser:  config.ParserConfig{Mode: "raw"},
			Multiline: config.MultilineConfig{
				Enabled: false,
			},
		},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "line1", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "  continuation", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "line2", Source: "/app.log"})

	entries := ring.Read(10, 0)
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries (passthrough), got %d", len(entries))
	}
}

func TestLogCollectorMultilineMaxBytesEmitsTruncated(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	stats := NewLogStats()
	sources := []config.LogSource{
		{
			Path:    "/app.log",
			Service: "app",
			Parser:  config.ParserConfig{Mode: "raw"},
			Multiline: config.MultilineConfig{
				Enabled:  true,
				Mode:     "start",
				Pattern:  `^START`,
				MaxBytes: 20,
			},
		},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, stats)
	if err != nil {
		t.Fatal(err)
	}

	coll.processLine(logtail.Line{Text: "START", Source: "/app.log"})
	coll.processLine(logtail.Line{Text: "12345678901234", Source: "/app.log"}) // 5+1+14=20, fits
	coll.processLine(logtail.Line{Text: "OVERFLOW", Source: "/app.log"})       // exceeds max_bytes

	entries := ring.Read(10, 0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 truncated entry, got %d", len(entries))
	}

	if entries[0].Fields == nil || entries[0].Fields["truncated"] != true {
		t.Error("expected truncated=true field")
	}

	// Verify metric emitted
	points := stats.Collect(nil)
	found := false
	for _, p := range points {
		if p.Name == "agent.logs.multiline_truncations" && p.Tags["source"] == "/app.log" {
			found = true
		}
	}
	if !found {
		t.Error("missing agent.logs.multiline_truncations metric")
	}
}

func TestLogCollectorDrainChannelFlushesOnlyOwnSource(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}
	sources := []config.LogSource{
		{
			Path:    "/var/log/sourceA.log",
			Service: "svcA",
			Parser:  config.ParserConfig{Mode: "raw"},
			Multiline: config.MultilineConfig{
				Enabled: true,
				Mode:    "start",
				Pattern: `^START`,
			},
		},
		{
			Path:    "/var/log/sourceB.log",
			Service: "svcB",
			Parser:  config.ParserConfig{Mode: "raw"},
			Multiline: config.MultilineConfig{
				Enabled: true,
				Mode:    "start",
				Pattern: `^START`,
			},
		},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, true, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	// Buffer partial multiline events in both sources
	coll.processLine(logtail.Line{Text: "START event A", Source: "/var/log/sourceA.log"})
	coll.processLine(logtail.Line{Text: "  continuation A1", Source: "/var/log/sourceA.log"})
	coll.processLine(logtail.Line{Text: "START event B", Source: "/var/log/sourceB.log"})
	coll.processLine(logtail.Line{Text: "  continuation B1", Source: "/var/log/sourceB.log"})

	// Nothing emitted yet — both buffered
	entries := ring.Read(10, 0)
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries before drain, got %d", len(entries))
	}

	// Create a tailer-like object for source A and simulate drainChannel
	// drainChannel flushes only source A's aggregator
	coll.flushMultiline("/var/log/sourceA.log")

	entries = ring.Read(10, 0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry (source A flushed), got %d", len(entries))
	}
	if entries[0].Source != "/var/log/sourceA.log" {
		t.Errorf("flushed entry source = %q, want /var/log/sourceA.log", entries[0].Source)
	}

	// Source B's aggregator must still be pending (not flushed by source A's drain)
	aggB := coll.multilines["/var/log/sourceB.log"]
	if !aggB.HasPending() {
		t.Error("source B aggregator should still have pending data after source A drain")
	}

	// Now flush source B separately
	coll.flushMultiline("/var/log/sourceB.log")
	entries = ring.Read(10, 0)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry (source B flushed), got %d", len(entries))
	}
	if entries[0].Source != "/var/log/sourceB.log" {
		t.Errorf("flushed entry source = %q, want /var/log/sourceB.log", entries[0].Source)
	}
	wantB := "START event B\n  continuation B1"
	if entries[0].Message != wantB {
		t.Errorf("source B message = %q, want %q", entries[0].Message, wantB)
	}
}

func TestLogCollectorFlushTimeoutHonoredByCollector(t *testing.T) {
	// Proves that a source with flush_timeout=150ms emits its buffered multiline entry
	// within ~200ms via the collector's scheduled flush ticker, not delayed to ~1s.
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}

	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "app.log")
	if err := os.WriteFile(logFile, []byte{}, 0644); err != nil {
		t.Fatal(err)
	}

	sources := []config.LogSource{
		{
			Path:    logFile,
			Service: "app",
			Parser:  config.ParserConfig{Mode: "raw"},
			Multiline: config.MultilineConfig{
				Enabled:      true,
				Mode:         "start",
				Pattern:      `^START`,
				FlushTimeout: 150 * time.Millisecond,
			},
		},
	}

	coll, err := NewLogCollector(id, "1.0.0", ring, sources, false, NewLogStats())
	if err != nil {
		t.Fatal(err)
	}

	// Verify flushTickInterval is derived correctly (half of 150ms = 75ms, floored at 50ms => 75ms)
	if coll.flushTickInterval > 100*time.Millisecond {
		t.Fatalf("flushTickInterval = %v, want <= 100ms for 150ms flush_timeout", coll.flushTickInterval)
	}

	// Create tailer with short poll and checkpoint intervals for testing
	tailer := logtail.NewTailer(logFile, &logtail.TailerOptions{
		StateDir:           tmpDir,
		CheckpointInterval: 1 * time.Second,
		PollInterval:       50 * time.Millisecond,
		StartPosition:      "start",
	})
	tailer.Start()

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		coll.collectFromTailer(ctx, tailer)
	}()

	// Write a start-pattern line followed by a continuation (no subsequent start pattern)
	time.Sleep(100 * time.Millisecond) // let tailer initialize
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("START multiline event\n")
	f.WriteString("  continuation line\n")
	f.Close()

	// Wait for flush_timeout + tick interval + margin (150ms + 75ms + 175ms = 400ms total)
	// The entry MUST appear well before 1s (the old hardcoded ticker).
	time.Sleep(450 * time.Millisecond)

	cancel()
	tailer.Stop()
	wg.Wait()

	entries := ring.Read(10, 0)
	if len(entries) == 0 {
		t.Fatal("expected entry to be flushed by timeout within 450ms, got 0 entries")
	}
	want := "START multiline event\n  continuation line"
	if entries[0].Message != want {
		t.Errorf("message = %q, want %q", entries[0].Message, want)
	}
}

func TestLogCollectorFlushTickIntervalComputation(t *testing.T) {
	ring := buffer.NewLogRing(100, 1000, 1024*1024)
	id := &identity.Identity{AgentID: "a", Hostname: "h", OS: "linux"}

	tests := []struct {
		name     string
		sources  []config.LogSource
		wantMax  time.Duration
	}{
		{
			name: "default 5s timeout yields 500ms tick",
			sources: []config.LogSource{
				{Path: "/a.log", Service: "a", Parser: config.ParserConfig{Mode: "raw"},
					Multiline: config.MultilineConfig{Enabled: true, Mode: "start", Pattern: `^X`, FlushTimeout: 5 * time.Second}},
			},
			wantMax: 2500 * time.Millisecond,
		},
		{
			name: "100ms timeout yields 50ms tick (floor)",
			sources: []config.LogSource{
				{Path: "/b.log", Service: "b", Parser: config.ParserConfig{Mode: "raw"},
					Multiline: config.MultilineConfig{Enabled: true, Mode: "start", Pattern: `^X`, FlushTimeout: 100 * time.Millisecond}},
			},
			wantMax: 50 * time.Millisecond,
		},
		{
			name: "multiple sources uses smallest timeout",
			sources: []config.LogSource{
				{Path: "/c.log", Service: "c", Parser: config.ParserConfig{Mode: "raw"},
					Multiline: config.MultilineConfig{Enabled: true, Mode: "start", Pattern: `^X`, FlushTimeout: 5 * time.Second}},
				{Path: "/d.log", Service: "d", Parser: config.ParserConfig{Mode: "raw"},
					Multiline: config.MultilineConfig{Enabled: true, Mode: "start", Pattern: `^X`, FlushTimeout: 200 * time.Millisecond}},
			},
			wantMax: 100 * time.Millisecond,
		},
		{
			name: "no multiline enabled yields 500ms default",
			sources: []config.LogSource{
				{Path: "/e.log", Service: "e", Parser: config.ParserConfig{Mode: "raw"},
					Multiline: config.MultilineConfig{Enabled: false}},
			},
			wantMax: 500 * time.Millisecond,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coll, err := NewLogCollector(id, "1.0.0", ring, tc.sources, false, NewLogStats())
			if err != nil {
				t.Fatal(err)
			}
			if coll.flushTickInterval > tc.wantMax {
				t.Errorf("flushTickInterval = %v, want <= %v", coll.flushTickInterval, tc.wantMax)
			}
		})
	}
}
