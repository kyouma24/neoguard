package collector

import (
	"sync"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// counterKey is a collision-safe compound key for labeled counters.
type counterKey struct {
	name string
	tags string // JSON-encoded sorted tags for uniqueness
}

// LogStats is a labeled counter registry for log pipeline metrics.
// Counters are monotonically increasing — Collect emits the cumulative value, never resets.
// Separate from AgentStats (scalar atomics for metrics pipeline) per Option A1.
type LogStats struct {
	mu       sync.Mutex
	counters map[counterKey]*labeledCounter
}

type labeledCounter struct {
	name  string
	tags  map[string]string
	value float64
}

func NewLogStats() *LogStats {
	return &LogStats{
		counters: make(map[counterKey]*labeledCounter),
	}
}

func (s *LogStats) Increment(name string, tags map[string]string) {
	s.Add(name, 1, tags)
}

func (s *LogStats) Add(name string, value float64, tags map[string]string) {
	key := counterKey{name: name, tags: canonicalTagString(tags)}
	s.mu.Lock()
	defer s.mu.Unlock()

	c, ok := s.counters[key]
	if !ok {
		tagsCopy := copyTags(tags)
		c = &labeledCounter{name: name, tags: tagsCopy}
		s.counters[key] = c
	}
	c.value += value
}

// Collect returns all counters as monotonic MetricPoints.
// Values are cumulative and never reset.
func (s *LogStats) Collect(baseTags map[string]string) []model.MetricPoint {
	s.mu.Lock()
	defer s.mu.Unlock()

	var points []model.MetricPoint

	for _, c := range s.counters {
		if c.value == 0 {
			continue
		}
		merged := make(map[string]string, len(c.tags)+len(baseTags))
		for k, v := range c.tags {
			merged[k] = v
		}
		for k, v := range baseTags {
			merged[k] = v
		}
		points = append(points, model.NewCounter(c.name, c.value, merged))
	}

	return points
}

// canonicalTagString produces a deterministic, collision-safe string from tags.
// Uses length-prefixed encoding: "3:key5:value" — no delimiter ambiguity.
func canonicalTagString(tags map[string]string) string {
	if len(tags) == 0 {
		return ""
	}
	// Sort keys for determinism
	keys := make([]string, 0, len(tags))
	for k := range tags {
		keys = append(keys, k)
	}
	sortStrings(keys)

	var buf []byte
	for _, k := range keys {
		v := tags[k]
		buf = appendLenPrefixed(buf, k)
		buf = appendLenPrefixed(buf, v)
	}
	return string(buf)
}

func appendLenPrefixed(buf []byte, s string) []byte {
	buf = appendInt(buf, len(s))
	buf = append(buf, ':')
	buf = append(buf, s...)
	return buf
}

func appendInt(buf []byte, n int) []byte {
	if n == 0 {
		return append(buf, '0')
	}
	var digits [20]byte
	i := len(digits)
	for n > 0 {
		i--
		digits[i] = byte('0' + n%10)
		n /= 10
	}
	return append(buf, digits[i:]...)
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

func copyTags(tags map[string]string) map[string]string {
	if tags == nil {
		return nil
	}
	cp := make(map[string]string, len(tags))
	for k, v := range tags {
		cp[k] = v
	}
	return cp
}
