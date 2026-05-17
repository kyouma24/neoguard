package logtail

import (
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestMultilineDisabledPassesThrough(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{Enabled: false})

	lines := []string{
		"2024-01-15 ERROR exception",
		"  at line 1",
		"  at line 2",
	}
	for _, line := range lines {
		out := agg.Process(line)
		if len(out) != 1 || out[0] != line {
			t.Errorf("expected passthrough of %q, got %v", line, out)
		}
	}
}

func TestMultilineStartAggregates(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "start",
		Pattern: regexp.MustCompile(`^\d{4}-\d{2}-\d{2}`),
	})

	out1 := agg.Process("2024-01-15 ERROR exception")
	if len(out1) != 0 {
		t.Errorf("expected buffer, got %v", out1)
	}

	out2 := agg.Process("  at line 1")
	if len(out2) != 0 {
		t.Errorf("expected buffer, got %v", out2)
	}

	out3 := agg.Process("  at line 2")
	if len(out3) != 0 {
		t.Errorf("expected buffer, got %v", out3)
	}

	// Next start pattern flushes previous
	out4 := agg.Process("2024-01-15 INFO next log")
	if len(out4) != 1 {
		t.Fatalf("expected 1 emitted, got %d", len(out4))
	}
	want := "2024-01-15 ERROR exception\n  at line 1\n  at line 2"
	if out4[0] != want {
		t.Errorf("got %q, want %q", out4[0], want)
	}
}

func TestMultilineStartFirstLineNoMatch(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "start",
		Pattern: regexp.MustCompile(`^\d{4}-\d{2}-\d{2}`),
	})

	// First line doesn't match start pattern — emit as-is
	out := agg.Process("  orphan continuation line")
	if len(out) != 1 || out[0] != "  orphan continuation line" {
		t.Errorf("expected passthrough, got %v", out)
	}
}

func TestMultilineContinueMode(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "continue",
		Pattern: regexp.MustCompile(`^\s`), // leading whitespace = continuation
	})

	// "Traceback" is a non-matching line, starts buffering
	out1 := agg.Process("Traceback (most recent call last):")
	if len(out1) != 0 {
		t.Errorf("expected buffer, got %v", out1)
	}

	// Continuation lines (match pattern)
	out2 := agg.Process("  File \"main.py\", line 10")
	if len(out2) != 0 {
		t.Errorf("expected buffer, got %v", out2)
	}

	out3 := agg.Process("    raise ValueError(\"bad\")")
	if len(out3) != 0 {
		t.Errorf("expected buffer, got %v", out3)
	}

	// Non-matching line flushes previous buffer
	out4 := agg.Process("ValueError: bad")
	if len(out4) != 1 {
		t.Fatalf("expected 1 emitted, got %d", len(out4))
	}
	want := "Traceback (most recent call last):\n  File \"main.py\", line 10\n    raise ValueError(\"bad\")"
	if out4[0] != want {
		t.Errorf("got %q, want %q", out4[0], want)
	}
}

func TestMultilineContinueFirstLineContinuation(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "continue",
		Pattern: regexp.MustCompile(`^\s`),
	})

	// First line matches continuation — buffer it
	out := agg.Process("  indented first line")
	if len(out) != 0 {
		t.Errorf("expected buffer, got %v", out)
	}

	// Non-matching flushes
	out2 := agg.Process("next event")
	if len(out2) != 1 || out2[0] != "  indented first line" {
		t.Errorf("expected flush of first line, got %v", out2)
	}
}

func TestMultilineMaxBytesEmitsTruncated(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled:  true,
		Mode:     "start",
		Pattern:  regexp.MustCompile(`^START`),
		MaxBytes: 20,
	})

	out1 := agg.Process("START") // 5 bytes, buffered
	if len(out1) != 0 {
		t.Errorf("expected buffer, got %v", out1)
	}

	out2 := agg.Process("12345678901234") // 5 + 1 + 14 = 20, fits
	if len(out2) != 0 {
		t.Errorf("expected buffer, got %v", out2)
	}

	// Next line would exceed: 20 + 1 + 5 = 26 > 20
	out3 := agg.Process("EXTRA")
	if len(out3) != 1 {
		t.Fatalf("expected truncation emit, got %d", len(out3))
	}
	if !strings.HasSuffix(out3[0], TruncationMarker) {
		t.Errorf("expected truncation marker, got %q", out3[0])
	}
	content := strings.TrimSuffix(out3[0], TruncationMarker)
	if content != "START\n12345678901234" {
		t.Errorf("truncated content = %q", content)
	}
}

func TestMultilineFlushTimeout(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled:      true,
		Mode:         "start",
		Pattern:      regexp.MustCompile(`^START`),
		FlushTimeout: 50 * time.Millisecond,
	})

	agg.Process("START")
	agg.Process("line1")

	// Not expired yet
	out := agg.FlushIfExpired()
	if len(out) != 0 {
		t.Errorf("expected no flush yet, got %v", out)
	}

	time.Sleep(60 * time.Millisecond)

	out2 := agg.FlushIfExpired()
	if len(out2) != 1 {
		t.Fatalf("expected flush after timeout, got %d", len(out2))
	}
	if out2[0] != "START\nline1" {
		t.Errorf("got %q, want %q", out2[0], "START\nline1")
	}
}

func TestMultilineFlushExplicit(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "start",
		Pattern: regexp.MustCompile(`^START`),
	})

	agg.Process("START")
	agg.Process("continuation")

	out := agg.Flush()
	if len(out) != 1 || out[0] != "START\ncontinuation" {
		t.Errorf("Flush() = %v, want [\"START\\ncontinuation\"]", out)
	}

	// Second flush should be empty
	out2 := agg.Flush()
	if len(out2) != 0 {
		t.Errorf("second Flush() = %v, want empty", out2)
	}
}

func TestMultilineHasPending(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "start",
		Pattern: regexp.MustCompile(`^START`),
	})

	if agg.HasPending() {
		t.Error("expected no pending initially")
	}

	agg.Process("START")
	if !agg.HasPending() {
		t.Error("expected pending after Process")
	}

	agg.Flush()
	if agg.HasPending() {
		t.Error("expected no pending after Flush")
	}
}

func TestMultilineStartMultipleEvents(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "start",
		Pattern: regexp.MustCompile(`^\d{4}`),
	})

	var emitted []string

	lines := []string{
		"2024 event1 line1",
		"  continuation1",
		"2024 event2 line1",
		"  continuation2a",
		"  continuation2b",
		"2024 event3",
	}

	for _, line := range lines {
		out := agg.Process(line)
		emitted = append(emitted, out...)
	}

	// Final flush
	emitted = append(emitted, agg.Flush()...)

	if len(emitted) != 3 {
		t.Fatalf("expected 3 events, got %d: %v", len(emitted), emitted)
	}
	if emitted[0] != "2024 event1 line1\n  continuation1" {
		t.Errorf("event[0] = %q", emitted[0])
	}
	if emitted[1] != "2024 event2 line1\n  continuation2a\n  continuation2b" {
		t.Errorf("event[1] = %q", emitted[1])
	}
	if emitted[2] != "2024 event3" {
		t.Errorf("event[2] = %q", emitted[2])
	}
}

func TestMultilineContinueMultipleEvents(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled: true,
		Mode:    "continue",
		Pattern: regexp.MustCompile(`^\s`),
	})

	var emitted []string

	lines := []string{
		"Error: something failed",
		"  detail line 1",
		"  detail line 2",
		"Info: all good",
		"Warning: watch out",
		"  more info",
	}

	for _, line := range lines {
		out := agg.Process(line)
		emitted = append(emitted, out...)
	}
	emitted = append(emitted, agg.Flush()...)

	if len(emitted) != 3 {
		t.Fatalf("expected 3 events, got %d: %v", len(emitted), emitted)
	}
	if emitted[0] != "Error: something failed\n  detail line 1\n  detail line 2" {
		t.Errorf("event[0] = %q", emitted[0])
	}
	if emitted[1] != "Info: all good" {
		t.Errorf("event[1] = %q", emitted[1])
	}
	if emitted[2] != "Warning: watch out\n  more info" {
		t.Errorf("event[2] = %q", emitted[2])
	}
}

func TestMultilineMaxBytesInContinueMode(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled:  true,
		Mode:     "continue",
		Pattern:  regexp.MustCompile(`^\s`),
		MaxBytes: 30,
	})

	agg.Process("Error occurred")        // 14 bytes
	agg.Process("  detail one")           // 14 + 1 + 12 = 27 fits
	out := agg.Process("  detail two xx") // 27 + 1 + 14 = 42 > 30 → truncate

	if len(out) != 1 {
		t.Fatalf("expected truncation, got %d", len(out))
	}
	if !strings.HasSuffix(out[0], TruncationMarker) {
		t.Errorf("expected truncation marker, got %q", out[0])
	}
}

func TestMultilineFlushTimeoutDisabled(t *testing.T) {
	agg := NewMultilineAggregator(MultilineConfig{
		Enabled:      true,
		Mode:         "start",
		Pattern:      regexp.MustCompile(`^X`),
		FlushTimeout: 0, // disabled
	})

	agg.Process("X start")
	time.Sleep(10 * time.Millisecond)

	out := agg.FlushIfExpired()
	if len(out) != 0 {
		t.Errorf("expected no flush with timeout=0, got %v", out)
	}
}
