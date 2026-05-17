package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func writeTestConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "agent.yaml")
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadMinimalConfig(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIKey != "obl_live_v2_testkey123456" {
		t.Errorf("api_key = %q", cfg.APIKey)
	}
	if cfg.Endpoint != "http://localhost:8000" {
		t.Errorf("endpoint = %q", cfg.Endpoint)
	}
	if cfg.Collection.IntervalSeconds != 60 {
		t.Errorf("interval_seconds = %d, want 60", cfg.Collection.IntervalSeconds)
	}
	if cfg.CloudDetection != "auto" {
		t.Errorf("cloud_detection = %q, want auto", cfg.CloudDetection)
	}
	if cfg.Transport.BatchMaxSize != 5000 {
		t.Errorf("batch_max_size = %d, want 5000", cfg.Transport.BatchMaxSize)
	}
	if cfg.Buffer.MemoryMaxItems != 100000 {
		t.Errorf("memory_max_items = %d, want 100000", cfg.Buffer.MemoryMaxItems)
	}
}

func TestLoadFullConfig(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: https://ingest.neoguard.io
cloud_detection: skip
extra_tags:
  environment: production
  team: platform
collection:
  interval_seconds: 10
  process_interval_seconds: 30
  slow_interval_seconds: 120
transport:
  batch_max_size: 3000
  batch_max_interval_seconds: 15
  request_timeout_seconds: 45
buffer:
  memory_max_items: 50000
collectors:
  disabled:
    - entropy
    - conntrack
disk:
  exclude_mounts:
    - /proc
    - /sys
  exclude_fstypes:
    - tmpfs
network:
  exclude_interfaces:
    - lo
logging:
  level: debug
  format: text
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Collection.IntervalSeconds != 10 {
		t.Errorf("interval = %d, want 10", cfg.Collection.IntervalSeconds)
	}
	if cfg.CloudDetection != "skip" {
		t.Errorf("cloud_detection = %q", cfg.CloudDetection)
	}
	if cfg.ExtraTags["environment"] != "production" {
		t.Errorf("extra_tags missing environment")
	}
	if cfg.Transport.BatchMaxSize != 3000 {
		t.Errorf("batch_max_size = %d", cfg.Transport.BatchMaxSize)
	}
	if len(cfg.Collectors.Disabled) != 2 {
		t.Errorf("disabled collectors = %d", len(cfg.Collectors.Disabled))
	}
	if cfg.Logging.Level != "debug" {
		t.Errorf("logging.level = %q", cfg.Logging.Level)
	}
}

func TestMissingAPIKey(t *testing.T) {
	path := writeTestConfig(t, `endpoint: http://localhost:8000`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for missing api_key")
	}
}

func TestMissingEndpoint(t *testing.T) {
	path := writeTestConfig(t, `api_key: obl_live_v2_testkey123456`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for missing endpoint")
	}
}

func TestInvalidEndpoint(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: ftp://bad
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for bad endpoint scheme")
	}
}

func TestInvalidCloudDetection(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
cloud_detection: magic
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid cloud_detection")
	}
}

func TestIntervalTooLow(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
collection:
  interval_seconds: 3
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for interval < 10")
	}
}

func TestIntervalTooHigh(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
collection:
  interval_seconds: 500
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for interval > 300")
	}
}

func TestInvalidLogLevel(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logging:
  level: trace
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid log level")
	}
}

func TestIsCollectorDisabled(t *testing.T) {
	cfg := &Config{
		Collectors: CollectorsConfig{
			Disabled: []string{"entropy", "conntrack"},
		},
	}
	if !cfg.IsCollectorDisabled("entropy") {
		t.Error("entropy should be disabled")
	}
	if cfg.IsCollectorDisabled("cpu") {
		t.Error("cpu should not be disabled")
	}
}

func TestRedactedAPIKey(t *testing.T) {
	cfg := &Config{APIKey: "obl_live_v2_abcdef123456789"}
	redacted := cfg.RedactedAPIKey()
	if redacted != "obl_live_v2_***" {
		t.Errorf("redacted = %q", redacted)
	}
	cfg.APIKey = "short"
	if cfg.RedactedAPIKey() != "***" {
		t.Errorf("short key should be fully redacted")
	}
}

func TestFileNotFound(t *testing.T) {
	_, err := Load("/nonexistent/path.yaml")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestInvalidYAML(t *testing.T) {
	path := writeTestConfig(t, `{{{invalid yaml`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid yaml")
	}
}

func TestEnvVarExpansion(t *testing.T) {
	t.Setenv("NEOGUARD_TEST_KEY", "obl_live_v2_from_env1234")
	t.Setenv("NEOGUARD_TEST_ENDPOINT", "https://ingest.example.com")

	path := writeTestConfig(t, `
api_key: ${NEOGUARD_TEST_KEY}
endpoint: ${NEOGUARD_TEST_ENDPOINT}
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIKey != "obl_live_v2_from_env1234" {
		t.Errorf("api_key = %q, want from_env value", cfg.APIKey)
	}
	if cfg.Endpoint != "https://ingest.example.com" {
		t.Errorf("endpoint = %q", cfg.Endpoint)
	}
}

func TestEnvVarDefault(t *testing.T) {
	path := writeTestConfig(t, `
api_key: ${NEOGUARD_MISSING_KEY:-obl_live_v2_default12345}
endpoint: ${NEOGUARD_MISSING_EP:-http://localhost:8000}
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIKey != "obl_live_v2_default12345" {
		t.Errorf("api_key = %q, want default value", cfg.APIKey)
	}
	if cfg.Endpoint != "http://localhost:8000" {
		t.Errorf("endpoint = %q", cfg.Endpoint)
	}
}

func TestEnvVarSetOverridesDefault(t *testing.T) {
	t.Setenv("NEOGUARD_API", "obl_live_v2_override12345")
	path := writeTestConfig(t, `
api_key: ${NEOGUARD_API:-obl_live_v2_default12345}
endpoint: http://localhost:8000
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIKey != "obl_live_v2_override12345" {
		t.Errorf("api_key = %q, want override", cfg.APIKey)
	}
}

func TestExpandEnvVarsFunction(t *testing.T) {
	t.Setenv("A", "hello")
	tests := []struct {
		input string
		want  string
	}{
		{"${A}", "hello"},
		{"${UNSET:-fallback}", "fallback"},
		{"${UNSET}", ""},
		{"prefix-${A}-suffix", "prefix-hello-suffix"},
		{"no vars here", "no vars here"},
	}
	for _, tc := range tests {
		got := expandEnvVars(tc.input)
		if got != tc.want {
			t.Errorf("expandEnvVars(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestHealthBindDefault(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Health.Bind != "127.0.0.1:8282" {
		t.Errorf("health.bind = %q, want 127.0.0.1:8282", cfg.Health.Bind)
	}
}

func TestHealthBindOnly(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
health:
  enabled: true
  bind: "0.0.0.0:9090"
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Health.Bind != "0.0.0.0:9090" {
		t.Errorf("health.bind = %q, want 0.0.0.0:9090", cfg.Health.Bind)
	}
}

func TestHealthPortOnlyDeprecated(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
health:
  enabled: true
  port: 9999
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Health.Bind != "127.0.0.1:9999" {
		t.Errorf("health.bind = %q, want 127.0.0.1:9999", cfg.Health.Bind)
	}
	if !cfg.HealthBindDeprecated() {
		t.Error("HealthBindDeprecated() should return true when port is set")
	}
}

func TestHealthBindAndPortMutuallyExclusive(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
health:
  enabled: true
  bind: "0.0.0.0:8282"
  port: 8282
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error when both bind and port are set")
	}
}

func TestHealthBindMalformed(t *testing.T) {
	cases := []struct {
		name string
		bind string
	}{
		{"no_port", "localhost"},
		{"triple_colon", "not:a:valid:address"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
health:
  enabled: true
  bind: "`+tc.bind+`"
`)
			_, err := Load(path)
			if err == nil {
				t.Fatalf("expected error for malformed bind %q", tc.bind)
			}
		})
	}
}

func TestHealthBindPortOnly(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
health:
  enabled: true
  bind: ":8282"
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("port-only bind should be valid: %v", err)
	}
	if cfg.Health.Bind != ":8282" {
		t.Errorf("health.bind = %q, want :8282", cfg.Health.Bind)
	}
}

// AGENT-003: Process config validation tests

func TestProcessIgnorePatternInvalidRegex(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  ignore_patterns:
    - "^kworker"
    - "["
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid ignore pattern regex")
	}
}

func TestProcessAllowRegexInvalidRegex(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  allow_regex:
    - "^python"
    - "("
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid allow_regex")
	}
}

func TestProcessDenyRegexInvalidRegex(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  deny_regex:
    - "^System"
    - "*invalid"
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid deny_regex")
	}
}

func TestProcessAggregationInvalidPattern(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: "python"
      - pattern: "["
        aggregate_as: "broken"
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid aggregation pattern regex")
	}
}

func TestProcessAggregationEmptyAggregateAs(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: ""
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for empty aggregate_as")
	}
}

func TestProcessAggregationAggregateAsTooLong(t *testing.T) {
	longName := strings.Repeat("a", 65)
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: "`+longName+`"
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for aggregate_as exceeding 64 chars")
	}
	if !strings.Contains(err.Error(), "exceeds 64 chars") {
		t.Errorf("expected aggregate_as length error, got: %v", err)
	}
}

func TestProcessAggregationAggregateAsInvalidChars(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: "python@group"
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for aggregate_as with invalid characters")
	}
}

func TestProcessAggregationTooManyRules(t *testing.T) {
	rules := ""
	for i := 0; i < 51; i++ {
		rules += "      - pattern: \"^proc" + string(rune('a'+i%26)) + "\"\n"
		rules += "        aggregate_as: \"group" + string(rune('a'+i%26)) + "\"\n"
	}
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  aggregation:
    enabled: true
    rules:
`+rules)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for > 50 aggregation rules")
	}
}

func TestProcessAggregationEnabledWithoutRules(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  aggregation:
    enabled: true
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for aggregation enabled with no rules")
	}
}

func TestProcessAggregationValidConfig(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
process:
  ignore_patterns:
    - "^kworker"
    - "^migration/"
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: "python"
      - pattern: "^node"
        aggregate_as: "node-group"
      - pattern: "^java.*"
        aggregate_as: "jvm.apps"
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("valid aggregation config should load: %v", err)
	}
	if len(cfg.Process.IgnorePatterns) != 2 {
		t.Errorf("ignore_patterns = %d, want 2", len(cfg.Process.IgnorePatterns))
	}
	if !cfg.Process.Aggregation.Enabled {
		t.Error("aggregation should be enabled")
	}
	if len(cfg.Process.Aggregation.Rules) != 3 {
		t.Errorf("aggregation rules = %d, want 3", len(cfg.Process.Aggregation.Rules))
	}
}

func TestConfigStrictClockCheckDefault(t *testing.T) {
	path := writeTestConfig(t, `
api_key: test_key
endpoint: http://localhost:8000
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Clock.StrictClockCheck != false {
		t.Errorf("expected strict_clock_check default=false, got %v", cfg.Clock.StrictClockCheck)
	}
}

func TestConfigStrictClockCheckTrue(t *testing.T) {
	path := writeTestConfig(t, `
api_key: test_key
endpoint: http://localhost:8000
clock:
  strict_clock_check: true
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Clock.StrictClockCheck != true {
		t.Errorf("expected strict_clock_check=true, got %v", cfg.Clock.StrictClockCheck)
	}
}

func TestConfigStrictClockCheckFalse(t *testing.T) {
	path := writeTestConfig(t, `
api_key: test_key
endpoint: http://localhost:8000
clock:
  strict_clock_check: false
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Clock.StrictClockCheck != false {
		t.Errorf("expected strict_clock_check=false, got %v", cfg.Clock.StrictClockCheck)
	}
}

func testAbsLogPath() string {
	if runtime.GOOS == "windows" {
		return "C:/var/log/app.log"
	}
	return "/var/log/app.log"
}

func TestMultilineInvalidRegexRejectedDuringValidation(t *testing.T) {
	logPath := testAbsLogPath()
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: "`+logPath+`"
      service: app
      parser:
        mode: raw
      multiline:
        enabled: true
        mode: start
        pattern: "["
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid multiline regex pattern")
	}
	if !strings.Contains(err.Error(), "invalid regex") {
		t.Errorf("expected 'invalid regex' in error, got: %v", err)
	}
}

func TestMultilineValidRegexAccepted(t *testing.T) {
	logPath := testAbsLogPath()
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: "`+logPath+`"
      service: app
      parser:
        mode: raw
      multiline:
        enabled: true
        mode: start
        pattern: "^\\d{4}-\\d{2}-\\d{2}"
`)
	_, err := Load(path)
	if err != nil {
		t.Fatalf("valid multiline regex should pass validation: %v", err)
	}
}

func TestMultilineDisabledSkipsRegexValidation(t *testing.T) {
	logPath := testAbsLogPath()
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: "`+logPath+`"
      service: app
      parser:
        mode: raw
      multiline:
        enabled: false
        pattern: "["
`)
	_, err := Load(path)
	if err != nil {
		t.Fatalf("disabled multiline should not validate regex: %v", err)
	}
}
