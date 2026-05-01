package model

import (
	"math"
	"strings"
	"testing"
)

func TestSanitizeNameAllowedChars(t *testing.T) {
	got := sanitizeName("system.cpu.usage_pct-total")
	if got != "system.cpu.usage_pct-total" {
		t.Errorf("got %q", got)
	}
}

func TestSanitizeNameReplacesInvalid(t *testing.T) {
	got := sanitizeName("system cpu/usage@pct")
	if got != "system_cpu_usage_pct" {
		t.Errorf("got %q", got)
	}
}

func TestSanitizeNameTruncates(t *testing.T) {
	long := strings.Repeat("a", 300)
	got := sanitizeName(long)
	if len(got) != maxMetricNameLen {
		t.Errorf("len = %d, want %d", len(got), maxMetricNameLen)
	}
}

func TestSanitizeValueNaN(t *testing.T) {
	if v := sanitizeValue(math.NaN()); v != 0 {
		t.Errorf("NaN -> %f, want 0", v)
	}
}

func TestSanitizeValuePosInf(t *testing.T) {
	v := sanitizeValue(math.Inf(1))
	if v != math.MaxFloat64 {
		t.Errorf("+Inf -> %f, want MaxFloat64", v)
	}
}

func TestSanitizeValueNegInf(t *testing.T) {
	v := sanitizeValue(math.Inf(-1))
	if v != -math.MaxFloat64 {
		t.Errorf("-Inf -> %f, want -MaxFloat64", v)
	}
}

func TestSanitizeValueNormal(t *testing.T) {
	if v := sanitizeValue(42.5); v != 42.5 {
		t.Errorf("got %f, want 42.5", v)
	}
}

func TestSanitizeTagsTruncatesValues(t *testing.T) {
	tags := map[string]string{
		"key": strings.Repeat("v", 500),
	}
	out := sanitizeTags(tags)
	if len(out["key"]) != maxTagValueLen {
		t.Errorf("value len = %d, want %d", len(out["key"]), maxTagValueLen)
	}
}

func TestSanitizeTagsMaxCount(t *testing.T) {
	tags := make(map[string]string)
	for i := 0; i < 100; i++ {
		tags[strings.Repeat("k", 3)+string(rune('A'+i%26))+string(rune('0'+i/26))] = "v"
	}
	out := sanitizeTags(tags)
	if len(out) != maxTagCount {
		t.Errorf("tag count = %d, want %d", len(out), maxTagCount)
	}
}

func TestNewGaugeSanitizes(t *testing.T) {
	p := NewGauge("bad name!", math.NaN(), map[string]string{"k": "v"})
	if strings.Contains(p.Name, " ") || strings.Contains(p.Name, "!") {
		t.Errorf("name not sanitized: %q", p.Name)
	}
	if p.Value != 0 {
		t.Errorf("NaN not sanitized: %f", p.Value)
	}
}

func TestNewCounterSanitizes(t *testing.T) {
	p := NewCounter("ok.name", math.Inf(1), nil)
	if p.Value != math.MaxFloat64 {
		t.Errorf("+Inf not sanitized: %f", p.Value)
	}
}

func TestMergeTags(t *testing.T) {
	base := map[string]string{"a": "1"}
	extra := map[string]string{"b": "2", "a": "override"}
	merged := MergeTags(base, extra)
	if merged["a"] != "override" {
		t.Errorf("a = %q, want override", merged["a"])
	}
	if merged["b"] != "2" {
		t.Errorf("b = %q, want 2", merged["b"])
	}
}
