package config

import (
	"testing"
)

// LOGS-001 AT-1: Config validation rejects relative paths
func TestLogsConfigRejectsRelativePaths(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: relative/path/app.log
      service: web-api
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for relative log path")
	}
	if !contains(err.Error(), "must be absolute") {
		t.Errorf("error should mention 'must be absolute', got: %v", err)
	}
}

// LOGS-001 AT-2: Config validation requires service field
func TestLogsConfigRequiresServiceField(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: ""
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for missing service field")
	}
	if !contains(err.Error(), "service is required") {
		t.Errorf("error should mention 'service is required', got: %v", err)
	}
}

// LOGS-001: Validate parser mode enum
func TestLogsConfigInvalidParserMode(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
      parser:
        mode: invalid_mode
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid parser mode")
	}
	if !contains(err.Error(), "parser.mode must be") {
		t.Errorf("error should mention parser.mode validation, got: %v", err)
	}
}

// LOGS-001: Validate start_position enum
func TestLogsConfigInvalidStartPosition(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
      start_position: middle
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid start_position")
	}
	if !contains(err.Error(), "start_position must be") {
		t.Errorf("error should mention start_position validation, got: %v", err)
	}
}

// LOGS-001: Validate multiline mode enum
func TestLogsConfigInvalidMultilineMode(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
      multiline:
        enabled: true
        mode: invalid_mode
        pattern: "^\\d{4}"
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid multiline mode")
	}
	if !contains(err.Error(), "multiline.mode must be") {
		t.Errorf("error should mention multiline.mode validation, got: %v", err)
	}
}

// LOGS-001: Validate spool limits
func TestLogsConfigInvalidSpoolLimits(t *testing.T) {
	tests := []struct {
		name   string
		config string
		errMsg string
	}{
		{
			name: "negative_max_size",
			config: `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
  spool:
    max_size_mb: -100
`,
			errMsg: "logs.spool.max_size_mb must be",
		},
		{
			name: "invalid_high_watermark",
			config: `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
  spool:
    high_watermark_pct: 150
`,
			errMsg: "logs.spool.high_watermark_pct must be",
		},
		{
			name: "invalid_critical_watermark",
			config: `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
  spool:
    critical_watermark_pct: 50
`,
			errMsg: "logs.spool.critical_watermark_pct must be",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path := writeTestConfig(t, tc.config)
			_, err := Load(path)
			if err == nil {
				t.Fatal("expected error for invalid spool config")
			}
			if !contains(err.Error(), tc.errMsg) {
				t.Errorf("error should mention %q, got: %v", tc.errMsg, err)
			}
		})
	}
}

// LOGS-001: Valid logs config loads successfully
func TestLogsConfigValid(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
      start_position: end
      parser:
        mode: json
      multiline:
        enabled: false
  redaction:
    enabled: true
  spool:
    max_size_mb: 2048
    high_watermark_pct: 80
    critical_watermark_pct: 95
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("valid logs config should load: %v", err)
	}
	if !cfg.Logs.Enabled {
		t.Error("logs.enabled should be true")
	}
	if len(cfg.Logs.Sources) != 1 {
		t.Errorf("sources count = %d, want 1", len(cfg.Logs.Sources))
	}
	if cfg.Logs.Sources[0].Path != `C:\logs\app.log` {
		t.Errorf("source path = %q", cfg.Logs.Sources[0].Path)
	}
	if cfg.Logs.Sources[0].Service != "web-api" {
		t.Errorf("source service = %q", cfg.Logs.Sources[0].Service)
	}
	if cfg.Logs.Redaction.Enabled == nil || !*cfg.Logs.Redaction.Enabled {
		t.Error("redaction.enabled should be true")
	}
}

// LOGS-001: Redaction default is true
func TestLogsConfigRedactionDefaultTrue(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("config load failed: %v", err)
	}
	if cfg.Logs.Redaction.Enabled == nil {
		t.Fatal("redaction.enabled should have default value")
	}
	if !*cfg.Logs.Redaction.Enabled {
		t.Error("redaction.enabled default should be true")
	}
}

// LOGS-001: Explicit redaction: false is preserved
func TestLogsConfigRedactionExplicitFalsePreserved(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
  redaction:
    enabled: false
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("config load failed: %v", err)
	}
	if cfg.Logs.Redaction.Enabled == nil {
		t.Fatal("redaction.enabled should be set")
	}
	if *cfg.Logs.Redaction.Enabled {
		t.Error("explicit redaction.enabled=false should be preserved")
	}
}

// LOGS-001: Defaults are applied correctly
func TestLogsConfigDefaults(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
logs:
  enabled: true
  sources:
    - path: C:\logs\app.log
      service: web-api
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("config load failed: %v", err)
	}

	// Spool defaults
	if cfg.Logs.Spool.MaxSizeMB != 2048 {
		t.Errorf("spool.max_size_mb default = %d, want 2048", cfg.Logs.Spool.MaxSizeMB)
	}
	if cfg.Logs.Spool.HighWatermarkPct != 80 {
		t.Errorf("spool.high_watermark_pct default = %d, want 80", cfg.Logs.Spool.HighWatermarkPct)
	}
	if cfg.Logs.Spool.CriticalWatermarkPct != 95 {
		t.Errorf("spool.critical_watermark_pct default = %d, want 95", cfg.Logs.Spool.CriticalWatermarkPct)
	}

	// Source defaults
	if cfg.Logs.Sources[0].StartPosition != "end" {
		t.Errorf("start_position default = %q, want 'end'", cfg.Logs.Sources[0].StartPosition)
	}

	// Multiline defaults
	if cfg.Logs.Sources[0].Multiline.MaxBytes != 32768 {
		t.Errorf("multiline.max_bytes default = %d, want 32768", cfg.Logs.Sources[0].Multiline.MaxBytes)
	}
	if cfg.Logs.Sources[0].Multiline.FlushTimeout.Seconds() != 5 {
		t.Errorf("multiline.flush_timeout default = %v, want 5s", cfg.Logs.Sources[0].Multiline.FlushTimeout)
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && (s == substr || len(s) >= len(substr) && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
