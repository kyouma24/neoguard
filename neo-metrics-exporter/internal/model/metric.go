package model

import (
	"math"
	"strings"
	"time"
)

const (
	maxMetricNameLen = 200
	maxTagKeyLen     = 128
	maxTagValueLen   = 256
	maxTagCount      = 50
)

type MetricType string

const (
	MetricGauge   MetricType = "gauge"
	MetricCounter MetricType = "counter"
)

type MetricPoint struct {
	Name       string            `json:"name"`
	Value      float64           `json:"value"`
	Timestamp  time.Time         `json:"timestamp"`
	Tags       map[string]string `json:"tags"`
	MetricType MetricType        `json:"metric_type"`
}

type MetricBatch struct {
	Metrics  []MetricPoint `json:"metrics"`
	TenantID string        `json:"tenant_id,omitempty"`
}

func NewGauge(name string, value float64, tags map[string]string) MetricPoint {
	return MetricPoint{
		Name:       sanitizeName(name),
		Value:      sanitizeValue(value),
		Timestamp:  time.Now().UTC(),
		Tags:       sanitizeTags(tags),
		MetricType: MetricGauge,
	}
}

func NewCounter(name string, value float64, tags map[string]string) MetricPoint {
	return MetricPoint{
		Name:       sanitizeName(name),
		Value:      sanitizeValue(value),
		Timestamp:  time.Now().UTC(),
		Tags:       sanitizeTags(tags),
		MetricType: MetricCounter,
	}
}

func MergeTags(base, extra map[string]string) map[string]string {
	merged := make(map[string]string, len(base)+len(extra))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range extra {
		merged[k] = v
	}
	return merged
}

func sanitizeName(name string) string {
	if len(name) > maxMetricNameLen {
		name = name[:maxMetricNameLen]
	}
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '_', r == '-':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
}

func sanitizeValue(v float64) float64 {
	if math.IsNaN(v) {
		return 0
	}
	if math.IsInf(v, 1) {
		return math.MaxFloat64
	}
	if math.IsInf(v, -1) {
		return -math.MaxFloat64
	}
	return v
}

func sanitizeTags(tags map[string]string) map[string]string {
	if len(tags) == 0 {
		return tags
	}
	out := make(map[string]string, len(tags))
	count := 0
	for k, v := range tags {
		if count >= maxTagCount {
			break
		}
		k = truncate(k, maxTagKeyLen)
		v = truncate(v, maxTagValueLen)
		out[k] = v
		count++
	}
	return out
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
