package logtail

import (
	"fmt"
	"log/slog"
	"regexp"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// RegexParser extracts fields via named capture groups per contract §5.3
type RegexParser struct {
	pattern    *regexp.Regexp
	timeFormat string
}

func NewRegexParser(pattern, timeFormat string) (*RegexParser, error) {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("invalid regex pattern: %w", err)
	}

	return &RegexParser{
		pattern:    re,
		timeFormat: timeFormat,
	}, nil
}

func (p *RegexParser) Parse(line string) (*model.LogEntry, error) {
	matches := p.pattern.FindStringSubmatch(line)
	if matches == nil {
		// No match: fallback to raw with parse_error per contract §5.3
		slog.Warn("regex no match, falling back to raw")
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

	// Extract named groups
	names := p.pattern.SubexpNames()
	for i, name := range names {
		if i == 0 || name == "" {
			continue // skip full match and unnamed groups
		}

		value := matches[i]

		switch name {
		case "timestamp":
			if p.timeFormat != "" {
				if t, err := time.Parse(p.timeFormat, value); err == nil {
					entry.Timestamp = t.UTC()
				}
			}
		case "level", "severity":
			entry.Severity = mapSeverity(value)
		case "message", "msg":
			entry.Message = value
		default:
			// Other named groups go into Fields
			entry.Fields[name] = value
		}
	}

	return entry, nil
}
