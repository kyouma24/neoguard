package logtail

import (
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestRedactorBearerToken(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0"}
	r.Apply(entry)
	if entry.Message != "Authorization: Bearer [REDACTED:TOKEN]" {
		t.Errorf("got %q", entry.Message)
	}
}

func TestRedactorAWSAccessKey(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"}
	r.Apply(entry)
	if entry.Message != "AWS_ACCESS_KEY_ID=[REDACTED:AWS_KEY]" {
		t.Errorf("got %q", entry.Message)
	}
}

func TestRedactorAPIKeyField(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Message: "API call",
		Fields:  map[string]any{"api_key": "sk_live_abc123xyz456def", "user_id": "12345"},
	}
	r.Apply(entry)
	if entry.Fields["api_key"] != "[REDACTED]" {
		t.Errorf("api_key = %q, want [REDACTED]", entry.Fields["api_key"])
	}
	if entry.Fields["user_id"] != "12345" {
		t.Errorf("user_id changed: %v", entry.Fields["user_id"])
	}
}

func TestRedactorPasswordFieldCaseInsensitive(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{"Password": "hunter2", "username": "alice"},
	}
	r.Apply(entry)
	if entry.Fields["Password"] != "[REDACTED]" {
		t.Errorf("Password = %q, want [REDACTED]", entry.Fields["Password"])
	}
	if entry.Fields["username"] != "alice" {
		t.Errorf("username changed: %v", entry.Fields["username"])
	}
}

func TestRedactorMultiplePatternsInMessage(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0 and AKIAIOSFODNN7EXAMPLE"}
	r.Apply(entry)
	want := "Bearer [REDACTED:TOKEN] and [REDACTED:AWS_KEY]"
	if entry.Message != want {
		t.Errorf("got %q, want %q", entry.Message, want)
	}
}

func TestRedactorDisabledSkipsAll(t *testing.T) {
	r := NewRedactor(false)
	msg := "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0"
	entry := &model.LogEntry{Message: msg}
	r.Apply(entry)
	if entry.Message != msg {
		t.Errorf("message modified when disabled: %q", entry.Message)
	}
}

func TestRedactorCountsMetrics(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ODc2NTQzMjEwIn0"}
	r.Apply(entry)
	counts := r.Counts()
	if counts["bearer"] != 2 {
		t.Errorf("bearer count = %d, want 2", counts["bearer"])
	}
}

func TestRedactorEmailNotRedacted(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "User user@example.com logged in"}
	r.Apply(entry)
	if entry.Message != "User user@example.com logged in" {
		t.Errorf("email was modified: %q", entry.Message)
	}
}

func TestRedactorAllFieldNameVariants(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"apikey":       "val1",
			"token":        "val2",
			"access_token": "val3",
			"passwd":       "val4",
			"pwd":          "val5",
			"secret":       "val6",
			"safe_field":   "keep",
		},
	}
	r.Apply(entry)

	for _, k := range []string{"apikey", "token", "access_token", "passwd", "pwd", "secret"} {
		if entry.Fields[k] != "[REDACTED]" {
			t.Errorf("Fields[%q] = %v, want [REDACTED]", k, entry.Fields[k])
		}
	}
	if entry.Fields["safe_field"] != "keep" {
		t.Errorf("safe_field modified: %v", entry.Fields["safe_field"])
	}
}

func TestRedactorBearerInFieldValue(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"auth_header": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longtoken123456",
		},
	}
	r.Apply(entry)
	if entry.Fields["auth_header"] != "Bearer [REDACTED:TOKEN]" {
		t.Errorf("field value not redacted: %v", entry.Fields["auth_header"])
	}
}

func TestRedactorAWSKeyInFieldValue(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"config": "key=AKIAIOSFODNN7EXAMPLE region=us-east-1",
		},
	}
	r.Apply(entry)
	want := "key=[REDACTED:AWS_KEY] region=us-east-1"
	if entry.Fields["config"] != want {
		t.Errorf("got %v, want %q", entry.Fields["config"], want)
	}
}

func TestRedactorNonStringFieldUntouched(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"count":   42,
			"enabled": true,
			"nested":  map[string]any{"key": "value"},
		},
	}
	r.Apply(entry)
	if entry.Fields["count"] != 42 {
		t.Errorf("count changed: %v", entry.Fields["count"])
	}
	if entry.Fields["enabled"] != true {
		t.Errorf("enabled changed: %v", entry.Fields["enabled"])
	}
}

func TestRedactorShortBearerNotRedacted(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "Bearer short"}
	r.Apply(entry)
	if entry.Message != "Bearer short" {
		t.Errorf("short bearer modified: %q", entry.Message)
	}
}

func TestRedactorFalsePositiveAWSPrefix(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "AKIA is a prefix but AKIA_TOO_SHORT is not a key"}
	r.Apply(entry)
	if entry.Message != "AKIA is a prefix but AKIA_TOO_SHORT is not a key" {
		t.Errorf("false positive: %q", entry.Message)
	}
}

func TestRedactorNilFields(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{Message: "no fields"}
	r.Apply(entry)
	if entry.Message != "no fields" {
		t.Errorf("modified: %q", entry.Message)
	}
}

func TestRedactorNestedFlattenedPasswordField(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"auth.password": "hunter2",
			"user.name":     "alice",
		},
	}
	r.Apply(entry)
	if entry.Fields["auth.password"] != "[REDACTED]" {
		t.Errorf("auth.password = %v, want [REDACTED]", entry.Fields["auth.password"])
	}
	if entry.Fields["user.name"] != "alice" {
		t.Errorf("user.name changed: %v", entry.Fields["user.name"])
	}
}

func TestRedactorNestedFlattenedAPIKeyField(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"credentials.api_key":       "sk_live_secret123",
			"headers.access_token":      "tok_abc",
			"request.headers.token":     "jwt_xyz",
			"config.database.host":      "localhost",
		},
	}
	r.Apply(entry)
	if entry.Fields["credentials.api_key"] != "[REDACTED]" {
		t.Errorf("credentials.api_key = %v, want [REDACTED]", entry.Fields["credentials.api_key"])
	}
	if entry.Fields["headers.access_token"] != "[REDACTED]" {
		t.Errorf("headers.access_token = %v, want [REDACTED]", entry.Fields["headers.access_token"])
	}
	if entry.Fields["request.headers.token"] != "[REDACTED]" {
		t.Errorf("request.headers.token = %v, want [REDACTED]", entry.Fields["request.headers.token"])
	}
	if entry.Fields["config.database.host"] != "localhost" {
		t.Errorf("config.database.host changed: %v", entry.Fields["config.database.host"])
	}
}

func TestRedactorNestedFlattenedSecretField(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"app.config.secret": "s3cr3t_val",
			"deep.nested.pwd":   "p4ssw0rd",
			"service.passwd":    "old_pass",
		},
	}
	r.Apply(entry)
	for _, k := range []string{"app.config.secret", "deep.nested.pwd", "service.passwd"} {
		if entry.Fields[k] != "[REDACTED]" {
			t.Errorf("Fields[%q] = %v, want [REDACTED]", k, entry.Fields[k])
		}
	}
}

func TestRedactorNestedFieldMetricsEmitted(t *testing.T) {
	r := NewRedactor(true)
	entry := &model.LogEntry{
		Fields: map[string]any{
			"auth.password":        "hunter2",
			"credentials.api_key":  "key123",
		},
	}
	r.Apply(entry)
	counts := r.Counts()
	if counts["password_field"] != 1 {
		t.Errorf("password_field count = %d, want 1", counts["password_field"])
	}
	if counts["api_key_field"] != 1 {
		t.Errorf("api_key_field count = %d, want 1", counts["api_key_field"])
	}
}
