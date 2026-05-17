package logtail

import (
	"regexp"
	"strings"
	"sync"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

var (
	bearerRe = regexp.MustCompile(`Bearer [A-Za-z0-9._-]{20,}`)
	awsKeyRe = regexp.MustCompile(`AKIA[A-Z0-9]{16}`)
)

var sensitiveFieldNames = map[string]string{
	"api_key":      "api_key_field",
	"apikey":       "api_key_field",
	"token":        "api_key_field",
	"access_token": "api_key_field",
	"password":     "password_field",
	"passwd":       "password_field",
	"pwd":          "password_field",
	"secret":       "password_field",
}

// OnRedact is called each time a pattern matches. The argument is the pattern tag value.
type OnRedact func(pattern string)

type redactorCounts struct {
	mu     sync.Mutex
	counts map[string]int64
}

type Redactor struct {
	enabled  bool
	onRedact OnRedact
	counts   *redactorCounts
}

func NewRedactor(enabled bool) *Redactor {
	r := &Redactor{
		enabled: enabled,
		counts:  &redactorCounts{counts: make(map[string]int64)},
	}
	r.onRedact = r.counts.increment
	return r
}

func NewRedactorWithCallback(enabled bool, cb OnRedact) *Redactor {
	return &Redactor{
		enabled:  enabled,
		onRedact: cb,
		counts:   &redactorCounts{counts: make(map[string]int64)},
	}
}

func (r *Redactor) Apply(entry *model.LogEntry) {
	if !r.enabled {
		return
	}

	entry.Message = r.redactMessage(entry.Message)
	r.redactFields(entry.Fields)
}

func (r *Redactor) redactMessage(msg string) string {
	msg = bearerRe.ReplaceAllStringFunc(msg, func(_ string) string {
		r.onRedact("bearer")
		return "Bearer [REDACTED:TOKEN]"
	})
	msg = awsKeyRe.ReplaceAllStringFunc(msg, func(_ string) string {
		r.onRedact("aws_key")
		return "[REDACTED:AWS_KEY]"
	})
	return msg
}

func (r *Redactor) redactFields(fields map[string]any) {
	if fields == nil {
		return
	}
	for k, v := range fields {
		if r.isSensitiveFieldName(k) {
			fields[k] = "[REDACTED]"
			r.onRedact(sensitiveFieldPattern(k))
			continue
		}
		if s, ok := v.(string); ok {
			redacted := r.redactMessage(s)
			if redacted != s {
				fields[k] = redacted
			}
		}
	}
}

func (r *Redactor) isSensitiveFieldName(key string) bool {
	lower := strings.ToLower(key)
	if _, ok := sensitiveFieldNames[lower]; ok {
		return true
	}
	if idx := strings.LastIndex(lower, "."); idx >= 0 {
		terminal := lower[idx+1:]
		if _, ok := sensitiveFieldNames[terminal]; ok {
			return true
		}
	}
	return false
}

func sensitiveFieldPattern(key string) string {
	lower := strings.ToLower(key)
	if pattern, ok := sensitiveFieldNames[lower]; ok {
		return pattern
	}
	if idx := strings.LastIndex(lower, "."); idx >= 0 {
		terminal := lower[idx+1:]
		if pattern, ok := sensitiveFieldNames[terminal]; ok {
			return pattern
		}
	}
	return "unknown"
}

func (r *Redactor) Counts() map[string]int64 {
	r.counts.mu.Lock()
	defer r.counts.mu.Unlock()
	cp := make(map[string]int64, len(r.counts.counts))
	for k, v := range r.counts.counts {
		cp[k] = v
	}
	return cp
}

func (c *redactorCounts) increment(pattern string) {
	c.mu.Lock()
	c.counts[pattern]++
	c.mu.Unlock()
}
