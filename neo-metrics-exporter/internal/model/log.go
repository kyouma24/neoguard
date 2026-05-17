package model

import "time"

// LogSeverity represents log severity levels per contract §7.3
type LogSeverity string

const (
	LogSeverityTrace   LogSeverity = "trace"
	LogSeverityDebug   LogSeverity = "debug"
	LogSeverityInfo    LogSeverity = "info"
	LogSeverityWarn    LogSeverity = "warn"
	LogSeverityError   LogSeverity = "error"
	LogSeverityFatal   LogSeverity = "fatal"
	LogSeverityUnknown LogSeverity = "unknown"
)

// LogEntry represents a parsed log event per contract §7.3.
// Serves as both domain model and wire format (no separate LogEvent type).
type LogEntry struct {
	Timestamp time.Time         `json:"timestamp"` // ISO8601 UTC
	Message   string            `json:"message"`   // Max 64 KB (enforced by collector)
	Severity  LogSeverity       `json:"level"`     // trace/debug/info/warn/error/fatal/unknown (JSON key per §7.3)
	Service   string            `json:"service"`   // From sources[].service config
	Source    string            `json:"source"`    // File path
	Tags      map[string]string `json:"tags"`      // Identity tags (injected by collector)
	Fields    map[string]any    `json:"fields"`    // Parsed key-value pairs, max 100 keys
}

// LogEnvelope wraps log entries for HTTP transmission per contract §7.1.
// NO tenant_id field - backend derives from API key (§3.4, §7.4).
type LogEnvelope struct {
	AgentID       string     `json:"agent_id"`
	AgentVersion  string     `json:"agent_version"`
	SchemaVersion int        `json:"schema_version"`
	Logs          []LogEntry `json:"logs"`
}
