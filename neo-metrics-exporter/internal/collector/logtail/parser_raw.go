package logtail

import (
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// RawParser wraps each line as-is with severity UNKNOWN per contract §5.1
type RawParser struct{}

func NewRawParser() *RawParser {
	return &RawParser{}
}

func (p *RawParser) Parse(line string) (*model.LogEntry, error) {
	return &model.LogEntry{
		Timestamp: time.Now().UTC(),
		Message:   line,
		Severity:  model.LogSeverityUnknown,
		Fields:    make(map[string]any),
	}, nil
}
