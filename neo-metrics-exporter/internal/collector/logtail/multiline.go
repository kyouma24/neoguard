package logtail

import (
	"regexp"
	"strings"
	"sync"
	"time"
)

type MultilineConfig struct {
	Enabled      bool
	Mode         string // "start" or "continue"
	Pattern      *regexp.Regexp
	MaxBytes     int
	FlushTimeout time.Duration
}

type MultilineAggregator struct {
	cfg     MultilineConfig
	buf     []string
	bufSize int
	mu      sync.Mutex
	lastAdd time.Time
}

func NewMultilineAggregator(cfg MultilineConfig) *MultilineAggregator {
	return &MultilineAggregator{
		cfg: cfg,
	}
}

// Process feeds a line into the aggregator.
// Returns zero or one aggregated messages ready for parsing.
func (m *MultilineAggregator) Process(line string) []string {
	if !m.cfg.Enabled {
		return []string{line}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	switch m.cfg.Mode {
	case "start":
		return m.processStart(line)
	case "continue":
		return m.processContinue(line)
	default:
		return []string{line}
	}
}

func (m *MultilineAggregator) processStart(line string) []string {
	matches := m.cfg.Pattern.MatchString(line)

	if matches {
		// This line starts a new event — flush the previous buffer
		var emitted []string
		if len(m.buf) > 0 {
			emitted = append(emitted, m.emit())
		}
		m.buf = []string{line}
		m.bufSize = len(line)
		m.lastAdd = time.Now()
		return emitted
	}

	// Continuation line
	if len(m.buf) == 0 {
		// No buffer yet (first line of file doesn't match start pattern) — emit as-is
		return []string{line}
	}

	return m.appendLine(line)
}

func (m *MultilineAggregator) processContinue(line string) []string {
	matches := m.cfg.Pattern.MatchString(line)

	if matches {
		// This is a continuation line — buffer it
		if len(m.buf) == 0 {
			// First line matches continuation but there's nothing to continue — buffer it
			m.buf = []string{line}
			m.bufSize = len(line)
			m.lastAdd = time.Now()
			return nil
		}
		return m.appendLine(line)
	}

	// Non-matching line — this starts a new event
	var emitted []string
	if len(m.buf) > 0 {
		emitted = append(emitted, m.emit())
	}
	// Buffer the new line (it's the start of the next event)
	m.buf = []string{line}
	m.bufSize = len(line)
	m.lastAdd = time.Now()
	return emitted
}

func (m *MultilineAggregator) appendLine(line string) []string {
	newSize := m.bufSize + 1 + len(line) // +1 for \n separator
	if m.cfg.MaxBytes > 0 && newSize > m.cfg.MaxBytes {
		// MaxBytes exceeded — emit current buffer as truncated, start new buffer
		emitted := m.emitTruncated()
		m.buf = []string{line}
		m.bufSize = len(line)
		m.lastAdd = time.Now()
		return []string{emitted}
	}
	m.buf = append(m.buf, line)
	m.bufSize = newSize
	m.lastAdd = time.Now()
	return nil
}

// Flush emits whatever is buffered (used on timeout or shutdown).
func (m *MultilineAggregator) Flush() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.buf) == 0 {
		return nil
	}
	return []string{m.emit()}
}

// FlushIfExpired emits the buffer if flush_timeout has elapsed since the last line was added.
// Returns nil if no flush is needed.
func (m *MultilineAggregator) FlushIfExpired() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.buf) == 0 || m.cfg.FlushTimeout <= 0 {
		return nil
	}
	if time.Since(m.lastAdd) >= m.cfg.FlushTimeout {
		return []string{m.emit()}
	}
	return nil
}

// IsTruncated reports whether the last emit was due to max_bytes overflow.
// The caller should check the returned message for the truncation marker.
var TruncationMarker = "\x00TRUNCATED"

func (m *MultilineAggregator) emit() string {
	msg := strings.Join(m.buf, "\n")
	m.buf = nil
	m.bufSize = 0
	return msg
}

func (m *MultilineAggregator) emitTruncated() string {
	msg := strings.Join(m.buf, "\n")
	m.buf = nil
	m.bufSize = 0
	return msg + TruncationMarker
}

// HasPending reports whether the aggregator has buffered lines.
func (m *MultilineAggregator) HasPending() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.buf) > 0
}
