package logtail

import (
	"fmt"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// Parser converts raw log lines into structured LogEntry
type Parser interface {
	Parse(line string) (*model.LogEntry, error)
}

// NewParser creates a parser based on mode
// Empty mode defaults to raw parser
func NewParser(mode, pattern, timeFormat string) (Parser, error) {
	switch mode {
	case "", "raw":
		return NewRawParser(), nil
	case "json":
		return NewJSONParser(), nil
	case "regex":
		if pattern == "" {
			return nil, fmt.Errorf("regex parser requires pattern")
		}
		return NewRegexParser(pattern, timeFormat)
	default:
		return nil, fmt.Errorf("unknown parser mode: %s", mode)
	}
}
