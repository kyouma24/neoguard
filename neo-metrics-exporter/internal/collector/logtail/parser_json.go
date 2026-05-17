package logtail

import (
	"encoding/json"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// JSONParser extracts fields from JSON lines per contract §5.2
type JSONParser struct{}

func NewJSONParser() *JSONParser {
	return &JSONParser{}
}

func (p *JSONParser) Parse(line string) (*model.LogEntry, error) {
	var raw map[string]any
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		// Malformed JSON: fallback to raw with parse_error per contract §5.2
		slog.Warn("JSON parse failure, falling back to raw", "error", err)
		return &model.LogEntry{
			Timestamp: time.Now().UTC(),
			Message:   line,
			Severity:  model.LogSeverityUnknown,
			Fields: map[string]any{
				"parse_error": true,
			},
		}, nil
	}

	entry := &model.LogEntry{
		Timestamp: time.Now().UTC(), // default if not parsed
		Severity:  model.LogSeverityUnknown,
		Fields:    make(map[string]any),
	}

	// Extract timestamp from multiple possible keys (contract §7.5: timestamp, ts, time, @timestamp)
	timestampKeys := []string{"timestamp", "ts", "time", "@timestamp"}
	for _, key := range timestampKeys {
		if ts, ok := raw[key]; ok {
			if parsed := parseTimestamp(ts); !parsed.IsZero() {
				entry.Timestamp = parsed
			}
			delete(raw, key)
			break // Use first match only
		}
	}

	if level, ok := raw["level"]; ok {
		entry.Severity = mapSeverity(level)
		delete(raw, "level")
	} else if level, ok := raw["severity"]; ok {
		entry.Severity = mapSeverity(level)
		delete(raw, "severity")
	}

	if msg, ok := raw["message"]; ok {
		entry.Message = toString(msg)
		delete(raw, "message")
	} else if msg, ok := raw["msg"]; ok {
		entry.Message = toString(msg)
		delete(raw, "msg")
	}

	// Flatten remaining fields with dot notation for nested objects
	flattenFields(raw, "", entry.Fields)

	return entry, nil
}

func parseTimestamp(val any) time.Time {
	switch v := val.(type) {
	case string:
		// Try RFC3339
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return t.UTC()
		}
		// Try RFC3339Nano
		if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
			return t.UTC()
		}
	case float64:
		// Unix timestamp: distinguish seconds vs milliseconds
		// If value > 1e12, treat as Unix milliseconds, else Unix seconds
		if v > 1e12 {
			sec := int64(v / 1000)
			nsec := int64((v - float64(sec)*1000) * 1e6)
			return time.Unix(sec, nsec).UTC()
		}
		return time.Unix(int64(v), 0).UTC()
	}
	return time.Time{}
}

func mapSeverity(val any) model.LogSeverity {
	s := strings.ToLower(toString(val))
	switch s {
	case "trace":
		return model.LogSeverityTrace
	case "debug":
		return model.LogSeverityDebug
	case "info", "information":
		return model.LogSeverityInfo
	case "warn", "warning":
		return model.LogSeverityWarn
	case "error":
		return model.LogSeverityError
	case "fatal", "critical":
		return model.LogSeverityFatal
	default:
		return model.LogSeverityUnknown
	}
}

func toString(val any) string {
	switch v := val.(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case bool:
		return strconv.FormatBool(v)
	default:
		return ""
	}
}

func flattenFields(obj map[string]any, prefix string, output map[string]any) {
	for k, v := range obj {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}

		switch val := v.(type) {
		case map[string]any:
			// Recurse into nested object
			flattenFields(val, key, output)
		default:
			// Store primitive value with native type preserved
			output[key] = v
		}
	}
}
