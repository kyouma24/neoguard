package collector

import (
	"context"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/collector/logtail"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/identity"
)

type LogCollector struct {
	identity          *identity.Identity
	agentVersion      string
	ring              *buffer.LogRing
	parsers           map[string]logtail.Parser
	parserModes       map[string]string
	services          map[string]string
	multilines        map[string]*logtail.MultilineAggregator
	stats             *LogStats
	redactor          *logtail.Redactor
	flushTickInterval time.Duration
}

func NewLogCollector(identity *identity.Identity, agentVersion string, ring *buffer.LogRing, sources []config.LogSource, redactionEnabled bool, stats *LogStats) (*LogCollector, error) {
	parsers := make(map[string]logtail.Parser)
	parserModes := make(map[string]string)
	services := make(map[string]string)
	multilines := make(map[string]*logtail.MultilineAggregator)

	for _, src := range sources {
		parser, err := logtail.NewParser(src.Parser.Mode, src.Parser.Pattern, "")
		if err != nil {
			return nil, err
		}
		parsers[src.Path] = parser
		parserModes[src.Path] = src.Parser.Mode
		services[src.Path] = src.Service

		mlCfg := logtail.MultilineConfig{
			Enabled:      src.Multiline.Enabled,
			Mode:         src.Multiline.Mode,
			MaxBytes:     src.Multiline.MaxBytes,
			FlushTimeout: src.Multiline.FlushTimeout,
		}
		if src.Multiline.Enabled && src.Multiline.Pattern != "" {
			compiled, err := regexp.Compile(src.Multiline.Pattern)
			if err != nil {
				return nil, err
			}
			mlCfg.Pattern = compiled
		}
		multilines[src.Path] = logtail.NewMultilineAggregator(mlCfg)
	}

	redactor := logtail.NewRedactorWithCallback(redactionEnabled, func(pattern string) {
		stats.Increment("agent.logs.redaction_applied", map[string]string{"pattern": pattern})
	})

	// Tick interval = min(smallest enabled FlushTimeout, 1s) / 2.
	// Capped at 1s so timeouts above 1s still get sub-second expiry checks.
	// Floor at 50ms to avoid busy-spinning.
	minFlush := 1 * time.Second
	for _, src := range sources {
		if src.Multiline.Enabled && src.Multiline.FlushTimeout > 0 && src.Multiline.FlushTimeout < minFlush {
			minFlush = src.Multiline.FlushTimeout
		}
	}
	tickInterval := minFlush / 2
	if tickInterval < 50*time.Millisecond {
		tickInterval = 50 * time.Millisecond
	}

	return &LogCollector{
		identity:          identity,
		agentVersion:      agentVersion,
		ring:              ring,
		parsers:           parsers,
		parserModes:       parserModes,
		services:          services,
		multilines:        multilines,
		stats:             stats,
		redactor:          redactor,
		flushTickInterval: tickInterval,
	}, nil
}

func (c *LogCollector) Run(ctx context.Context, tailers []*logtail.Tailer, wg *sync.WaitGroup) {
	for _, tailer := range tailers {
		wg.Add(1)
		go func(t *logtail.Tailer) {
			defer wg.Done()
			c.collectFromTailer(ctx, t)
		}(tailer)
	}
}

func (c *LogCollector) collectFromTailer(ctx context.Context, tailer *logtail.Tailer) {
	flushTicker := time.NewTicker(c.flushTickInterval)
	defer flushTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			c.drainChannel(tailer)
			return
		case line, ok := <-tailer.Lines():
			if !ok {
				c.flushMultiline(tailer.Path())
				return
			}
			c.processLine(line)
		case <-flushTicker.C:
			c.flushExpiredMultilines()
		}
	}
}

func (c *LogCollector) drainChannel(tailer *logtail.Tailer) {
	for line := range tailer.Lines() {
		c.processLine(line)
	}
	c.flushMultiline(tailer.Path())
}

func (c *LogCollector) flushMultiline(source string) {
	agg, ok := c.multilines[source]
	if !ok {
		return
	}
	for _, msg := range agg.Flush() {
		c.processAggregatedLine(msg, source)
	}
}

func (c *LogCollector) flushAllMultilines() {
	for source, agg := range c.multilines {
		for _, msg := range agg.Flush() {
			c.processAggregatedLine(msg, source)
		}
	}
}

func (c *LogCollector) flushExpiredMultilines() {
	for source, agg := range c.multilines {
		for _, msg := range agg.FlushIfExpired() {
			c.processAggregatedLine(msg, source)
		}
	}
}

func (c *LogCollector) processLine(line logtail.Line) {
	agg, ok := c.multilines[line.Source]
	if !ok {
		slog.Warn("no multiline aggregator for source", "source", line.Source)
		return
	}

	messages := agg.Process(line.Text)
	for _, msg := range messages {
		c.processAggregatedLine(msg, line.Source)
	}
}

func (c *LogCollector) processAggregatedLine(msg string, source string) {
	truncated := strings.HasSuffix(msg, logtail.TruncationMarker)
	if truncated {
		msg = strings.TrimSuffix(msg, logtail.TruncationMarker)
		c.stats.Increment("agent.logs.multiline_truncations", map[string]string{"source": source})
	}

	parser, found := c.parsers[source]
	if !found {
		slog.Warn("no parser for source", "source", source)
		return
	}

	entry, err := parser.Parse(msg)
	if err != nil {
		slog.Warn("parse error", "source", source, "error", err)
		return
	}

	if entry.Fields != nil {
		if parseError, ok := entry.Fields["parse_error"].(bool); ok && parseError {
			c.stats.Increment("agent.logs.parser_errors", map[string]string{
				"source":      source,
				"parser_mode": c.getParserMode(source),
			})
		}
	}

	if truncated {
		if entry.Fields == nil {
			entry.Fields = make(map[string]any)
		}
		entry.Fields["truncated"] = true
	}

	c.redactor.Apply(entry)

	if entry.Tags == nil {
		entry.Tags = make(map[string]string)
	}
	for k, v := range c.identity.Tags() {
		if k != "tenant_id" {
			entry.Tags[k] = v
		}
	}
	entry.Tags["agent_version"] = c.agentVersion

	entry.Service = c.getServiceForSource(source)
	entry.Source = source

	if !c.ring.Write(*entry) {
		slog.Warn("log ring full, dropping entry", "source", source)
	}
}

func (c *LogCollector) getParserMode(source string) string {
	if mode, ok := c.parserModes[source]; ok {
		return mode
	}
	return "unknown"
}

func (c *LogCollector) getServiceForSource(source string) string {
	if service, ok := c.services[source]; ok {
		return service
	}
	return "unknown"
}
