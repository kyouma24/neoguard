package logtail

import (
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// AT-1: RawParser wraps line with severity UNKNOWN
func TestRawParserWrapsLineAsIs(t *testing.T) {
	parser := NewRawParser()
	entry, err := parser.Parse("2024-01-15 ERROR something broke")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Message != "2024-01-15 ERROR something broke" {
		t.Errorf("message = %q, want %q", entry.Message, "2024-01-15 ERROR something broke")
	}
	if entry.Severity != model.LogSeverityUnknown {
		t.Errorf("severity = %v, want %v", entry.Severity, model.LogSeverityUnknown)
	}
}

// AT-2: JSONParser extracts fields
func TestJSONParserExtractsFields(t *testing.T) {
	parser := NewJSONParser()
	line := `{"timestamp":"2024-01-15T10:00:00Z","level":"error","msg":"failed","user":"alice"}`
	entry, err := parser.Parse(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Message != "failed" {
		t.Errorf("message = %q, want %q", entry.Message, "failed")
	}
	if entry.Severity != model.LogSeverityError {
		t.Errorf("severity = %v, want %v", entry.Severity, model.LogSeverityError)
	}
	if entry.Fields["user"] != "alice" {
		t.Errorf("Fields[user] = %v, want %q", entry.Fields["user"], "alice")
	}
}

// AT-3: JSONParser flattens nested objects with dot notation and preserves types
func TestJSONParserFlattensNestedFields(t *testing.T) {
	parser := NewJSONParser()
	line := `{"level":"info","msg":"ok","context":{"request_id":"123","user":{"id":456}}}`
	entry, err := parser.Parse(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Fields["context.request_id"] != "123" {
		t.Errorf("Fields[context.request_id] = %v, want %q", entry.Fields["context.request_id"], "123")
	}
	// Numeric values preserved as float64 (JSON unmarshals numbers as float64)
	if v, ok := entry.Fields["context.user.id"].(float64); !ok || v != 456 {
		t.Errorf("Fields[context.user.id] = %v (type %T), want 456 (float64)", entry.Fields["context.user.id"], entry.Fields["context.user.id"])
	}
}

// AT-4: RegexParser extracts named groups
func TestRegexParserExtractsNamedGroups(t *testing.T) {
	pattern := `(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (?P<level>\w+) (?P<message>.*)`
	parser, err := NewRegexParser(pattern, "2006-01-02 15:04:05")
	if err != nil {
		t.Fatalf("NewRegexParser failed: %v", err)
	}

	line := "2024-01-15 10:00:00 ERROR connection failed"
	entry, err := parser.Parse(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Message != "connection failed" {
		t.Errorf("message = %q, want %q", entry.Message, "connection failed")
	}
	if entry.Severity != model.LogSeverityError {
		t.Errorf("severity = %v, want %v", entry.Severity, model.LogSeverityError)
	}
}

// AT-5: JSONParser fallback sets parse_error=true
func TestJSONParserFallbackSetsParseError(t *testing.T) {
	parser := NewJSONParser()
	line := "not valid json"
	entry, err := parser.Parse(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Message != "not valid json" {
		t.Errorf("message = %q, want %q", entry.Message, "not valid json")
	}
	if entry.Severity != model.LogSeverityUnknown {
		t.Errorf("severity = %v, want %v", entry.Severity, model.LogSeverityUnknown)
	}
	if entry.Fields["parse_error"] != true {
		t.Errorf("Fields[parse_error] = %v, want true", entry.Fields["parse_error"])
	}
}

// AT-6: RegexParser fallback sets parse_error=true
func TestRegexParserFallbackSetsParseError(t *testing.T) {
	pattern := `(?P<timestamp>\d{4}-\d{2}-\d{2}) (?P<level>\w+) (?P<message>.*)`
	parser, err := NewRegexParser(pattern, "2006-01-02")
	if err != nil {
		t.Fatalf("NewRegexParser failed: %v", err)
	}

	line := "does not match pattern"
	entry, err := parser.Parse(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Message != "does not match pattern" {
		t.Errorf("message = %q, want %q", entry.Message, "does not match pattern")
	}
	if entry.Severity != model.LogSeverityUnknown {
		t.Errorf("severity = %v, want %v", entry.Severity, model.LogSeverityUnknown)
	}
	if entry.Fields["parse_error"] != true {
		t.Errorf("Fields[parse_error] = %v, want true", entry.Fields["parse_error"])
	}
}

// Additional test: alternate timestamp field names (ts, time, @timestamp)
func TestJSONParserAlternateTimestampFields(t *testing.T) {
	parser := NewJSONParser()

	tests := []struct {
		name string
		line string
	}{
		{"ts field", `{"ts":"2024-01-15T10:00:00Z","level":"info","msg":"test"}`},
		{"time field", `{"time":"2024-01-15T10:00:00Z","level":"info","msg":"test"}`},
		{"@timestamp field", `{"@timestamp":"2024-01-15T10:00:00Z","level":"info","msg":"test"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry, err := parser.Parse(tt.line)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			expected := "2024-01-15T10:00:00Z"
			actual := entry.Timestamp.Format("2006-01-02T15:04:05Z07:00")
			if actual != expected {
				t.Errorf("timestamp = %v, want %v", actual, expected)
			}
		})
	}
}

// Additional test: Unix millisecond timestamp
func TestJSONParserUnixMillisecondTimestamp(t *testing.T) {
	parser := NewJSONParser()
	// 1705312800000 = 2024-01-15T10:00:00Z in milliseconds
	line := `{"ts":1705312800000,"level":"info","msg":"test"}`
	entry, err := parser.Parse(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "2024-01-15T10:00:00Z"
	actual := entry.Timestamp.Format("2006-01-02T15:04:05Z07:00")
	if actual != expected {
		t.Errorf("timestamp = %v, want %v", actual, expected)
	}
}

// Additional test: type preservation in flattened fields
func TestJSONParserTypePreservation(t *testing.T) {
	parser := NewJSONParser()
	line := `{"level":"info","msg":"test","count":42,"active":true,"name":"alice"}`
	entry, err := parser.Parse(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Numeric preserved as float64
	if v, ok := entry.Fields["count"].(float64); !ok || v != 42 {
		t.Errorf("Fields[count] = %v (type %T), want 42 (float64)", entry.Fields["count"], entry.Fields["count"])
	}

	// Boolean preserved
	if v, ok := entry.Fields["active"].(bool); !ok || v != true {
		t.Errorf("Fields[active] = %v (type %T), want true (bool)", entry.Fields["active"], entry.Fields["active"])
	}

	// String preserved
	if v, ok := entry.Fields["name"].(string); !ok || v != "alice" {
		t.Errorf("Fields[name] = %v (type %T), want \"alice\" (string)", entry.Fields["name"], entry.Fields["name"])
	}
}

// Test: empty parser mode defaults to raw parser
func TestNewParserEmptyModeDefaultsToRaw(t *testing.T) {
	parser, err := NewParser("", "", "")
	if err != nil {
		t.Fatalf("NewParser with empty mode failed: %v", err)
	}

	// Verify it behaves like raw parser (severity UNKNOWN)
	entry, err := parser.Parse("some log line")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Message != "some log line" {
		t.Errorf("message = %q, want %q", entry.Message, "some log line")
	}
	if entry.Severity != model.LogSeverityUnknown {
		t.Errorf("severity = %v, want %v", entry.Severity, model.LogSeverityUnknown)
	}
}
