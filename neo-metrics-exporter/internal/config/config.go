package config

import (
	"crypto/x509"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

var envVarPattern = regexp.MustCompile(`\$\{([a-zA-Z_][a-zA-Z0-9_]*)(?::-([^}]*))?\}`)

type Config struct {
	APIKey         string            `yaml:"api_key"`
	Endpoint       string            `yaml:"endpoint"`
	CABundlePath   string            `yaml:"ca_bundle_path"`
	CloudDetection string            `yaml:"cloud_detection"`
	StateDir       string            `yaml:"state_dir"`
	ExtraTags      map[string]string `yaml:"extra_tags"`
	CPU            CPUConfig         `yaml:"cpu"`
	Collection     CollectionConfig  `yaml:"collection"`
	Transport      TransportConfig   `yaml:"transport"`
	Buffer         BufferConfig      `yaml:"buffer"`
	Collectors     CollectorsConfig  `yaml:"collectors"`
	Disk           DiskConfig        `yaml:"disk"`
	Network        NetworkConfig     `yaml:"network"`
	Process        ProcessConfig     `yaml:"process"`
	Saturation     SaturationConfig  `yaml:"saturation"`
	FileWatch      FileWatchConfig   `yaml:"file_watch"`
	Services       ServicesConfig    `yaml:"services"`
	Logging        LoggingConfig     `yaml:"logging"`
	Health         HealthConfig      `yaml:"health"`
	Clock          ClockConfig       `yaml:"clock"`
	Memory         MemoryConfig      `yaml:"memory"`
	Logs           LogsConfig        `yaml:"logs"`
}

type HealthConfig struct {
	Enabled bool   `yaml:"enabled"`
	Bind    string `yaml:"bind"`
	Port    int    `yaml:"port"` // Deprecated: use Bind. Removed in v2.
}

type SaturationConfig struct {
	WindowSize int `yaml:"window_size"`
}

type FileWatchConfig struct {
	Paths    []string `yaml:"paths"`
	MaxFiles int      `yaml:"max_files"`
}

type ProcessConfig struct {
	TopN           int                      `yaml:"top_n"`
	AllowRegex     []string                 `yaml:"allow_regex"`
	DenyRegex      []string                 `yaml:"deny_regex"`
	CollectCmdline bool                     `yaml:"collect_cmdline"`
	IgnorePatterns []string                 `yaml:"ignore_patterns"`
	Aggregation    ProcessAggregationConfig `yaml:"aggregation"`
}

type ProcessAggregationConfig struct {
	Enabled bool                     `yaml:"enabled"`
	Rules   []ProcessAggregationRule `yaml:"rules"`
}

type ProcessAggregationRule struct {
	Pattern     string `yaml:"pattern"`
	AggregateAs string `yaml:"aggregate_as"`
}

type CPUConfig struct {
	PerCore          bool `yaml:"per_core"`
	PerCoreFrequency bool `yaml:"per_core_frequency"`
}

type CollectionConfig struct {
	IntervalSeconds        int `yaml:"interval_seconds"`
	ProcessIntervalSeconds int `yaml:"process_interval_seconds"`
	SlowIntervalSeconds    int `yaml:"slow_interval_seconds"`
}

type TransportConfig struct {
	BatchMaxSize            int                `yaml:"batch_max_size"`
	BatchMaxIntervalSeconds int                `yaml:"batch_max_interval_seconds"`
	RequestTimeoutSeconds   int                `yaml:"request_timeout_seconds"`
	ReplayRateBPS           int                `yaml:"replay_rate_bps"`
	StartupJitterSeconds    int                `yaml:"startup_jitter_seconds"`
	DeadLetter              DeadLetterConfig   `yaml:"dead_letter"`
	Backpressure            BackpressureConfig `yaml:"backpressure"`
}

type BackpressureConfig struct {
	Enabled       bool `yaml:"enabled"`
	WindowSeconds int  `yaml:"window_seconds"`
	MinSendRate   int  `yaml:"min_send_rate"`
	MaxReplayBPS  int  `yaml:"max_replay_bps"`
}

type DeadLetterConfig struct {
	Enabled    bool   `yaml:"enabled"`
	Dir        string `yaml:"dir"`
	MaxFiles   int    `yaml:"max_files"`
	MaxTotalMB int    `yaml:"max_total_mb"`
	DropPolicy string `yaml:"drop_policy"`
}

type BufferConfig struct {
	MemoryMaxItems int    `yaml:"memory_max_items"`
	WALDir         string `yaml:"wal_dir"`
}

type CollectorsConfig struct {
	Disabled              []string `yaml:"disabled"`
	RateMaxElapsedSeconds int      `yaml:"rate_max_elapsed_seconds"`
	TimeoutSeconds        int      `yaml:"timeout_seconds"`
}

type ClockConfig struct {
	StrictClockCheck bool `yaml:"strict_clock_check"`
}

type MemoryConfig struct {
	SoftLimitMB          int `yaml:"soft_limit_mb"`
	HardLimitMB          int `yaml:"hard_limit_mb"`
	CheckIntervalSeconds int `yaml:"check_interval_seconds"`
}

type DiskConfig struct {
	ExcludeMounts  []string `yaml:"exclude_mounts"`
	ExcludeFSTypes []string `yaml:"exclude_fstypes"`
}

type NetworkConfig struct {
	ExcludeInterfaces []string `yaml:"exclude_interfaces"`
}

type ServicesConfig struct {
	Filter []string `yaml:"filter"`
}

type LoggingConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
}

type LogsConfig struct {
	Enabled   bool           `yaml:"enabled"`
	Sources   []LogSource    `yaml:"sources"`
	Redaction RedactionConfig `yaml:"redaction"`
	Spool     SpoolConfig    `yaml:"spool"`
}

type LogSource struct {
	Path          string            `yaml:"path"`
	Service       string            `yaml:"service"`
	StartPosition string            `yaml:"start_position"`
	Parser        ParserConfig      `yaml:"parser"`
	Multiline     MultilineConfig   `yaml:"multiline"`
}

type ParserConfig struct {
	Mode    string `yaml:"mode"`
	Pattern string `yaml:"pattern"`
}

type MultilineConfig struct {
	Enabled      bool          `yaml:"enabled"`
	Mode         string        `yaml:"mode"`
	Pattern      string        `yaml:"pattern"`
	MaxBytes     int           `yaml:"max_bytes"`
	FlushTimeout time.Duration `yaml:"flush_timeout"`
}

type RedactionConfig struct {
	Enabled *bool `yaml:"enabled"`
}

type SpoolConfig struct {
	MaxSizeMB           int `yaml:"max_size_mb"`
	HighWatermarkPct    int `yaml:"high_watermark_pct"`
	CriticalWatermarkPct int `yaml:"critical_watermark_pct"`
}

func Load(path string) (*Config, error) {
	if err := checkFilePermissions(path); err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	expanded := expandEnvVars(string(data))

	cfg := &Config{}
	if err := yaml.Unmarshal([]byte(expanded), cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	if cfg.Health.Bind != "" && cfg.Health.Port != 0 {
		return nil, fmt.Errorf("config: health.bind and health.port are mutually exclusive — use bind only (port is deprecated)")
	}
	applyDefaults(cfg)
	if err := validate(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func expandEnvVars(input string) string {
	return envVarPattern.ReplaceAllStringFunc(input, func(match string) string {
		parts := envVarPattern.FindStringSubmatch(match)
		if parts == nil {
			return match
		}
		varName := parts[1]
		defaultVal := parts[2]

		if val, ok := os.LookupEnv(varName); ok {
			return val
		}
		return defaultVal
	})
}

func applyDefaults(cfg *Config) {
	if cfg.CloudDetection == "" {
		cfg.CloudDetection = "auto"
	}
	if cfg.Collection.IntervalSeconds == 0 {
		cfg.Collection.IntervalSeconds = 60
	}
	if cfg.Collection.ProcessIntervalSeconds == 0 {
		cfg.Collection.ProcessIntervalSeconds = 30
	}
	if cfg.Collection.SlowIntervalSeconds == 0 {
		cfg.Collection.SlowIntervalSeconds = 120
	}
	if cfg.Transport.BatchMaxSize == 0 {
		cfg.Transport.BatchMaxSize = 5000
	}
	if cfg.Transport.BatchMaxIntervalSeconds == 0 {
		cfg.Transport.BatchMaxIntervalSeconds = 10
	}
	if cfg.Transport.RequestTimeoutSeconds == 0 {
		cfg.Transport.RequestTimeoutSeconds = 30
	}
	if cfg.Buffer.MemoryMaxItems == 0 {
		cfg.Buffer.MemoryMaxItems = 100000
	}
	if len(cfg.Disk.ExcludeMounts) == 0 {
		cfg.Disk.ExcludeMounts = []string{"/proc", "/sys", "/dev", "/run", "/snap"}
	}
	if len(cfg.Disk.ExcludeFSTypes) == 0 {
		cfg.Disk.ExcludeFSTypes = []string{"tmpfs", "devtmpfs", "squashfs", "overlay"}
	}
	if len(cfg.Network.ExcludeInterfaces) == 0 {
		cfg.Network.ExcludeInterfaces = []string{"lo", "docker*", "veth*", "br-*"}
	}
	if cfg.Saturation.WindowSize == 0 {
		cfg.Saturation.WindowSize = 30
	}
	if cfg.FileWatch.MaxFiles == 0 {
		cfg.FileWatch.MaxFiles = 50
	}
	if cfg.Logging.Level == "" {
		cfg.Logging.Level = "info"
	}
	if cfg.Logging.Format == "" {
		cfg.Logging.Format = "json"
	}
	if cfg.StateDir == "" {
		if runtime.GOOS == "windows" {
			cfg.StateDir = `C:\ProgramData\NeoGuard`
		} else {
			cfg.StateDir = "/var/lib/neoguard"
		}
	}
	if cfg.ExtraTags == nil {
		cfg.ExtraTags = make(map[string]string)
	}
	if cfg.Memory.SoftLimitMB == 0 {
		cfg.Memory.SoftLimitMB = 256
	}
	if cfg.Memory.HardLimitMB == 0 {
		cfg.Memory.HardLimitMB = 384
	}
	if cfg.Memory.CheckIntervalSeconds == 0 {
		cfg.Memory.CheckIntervalSeconds = 5
	}
	if cfg.Collectors.TimeoutSeconds == 0 {
		cfg.Collectors.TimeoutSeconds = 30
	}
	if cfg.Health.Bind == "" && cfg.Health.Port == 0 {
		cfg.Health.Bind = "127.0.0.1:8282"
	} else if cfg.Health.Bind == "" && cfg.Health.Port != 0 {
		cfg.Health.Bind = fmt.Sprintf("127.0.0.1:%d", cfg.Health.Port)
	}
	if !cfg.Transport.DeadLetter.Enabled && cfg.Transport.DeadLetter.Dir == "" {
		cfg.Transport.DeadLetter.Enabled = true
	}
	if cfg.Transport.ReplayRateBPS == 0 {
		cfg.Transport.ReplayRateBPS = 1000
	}
	if cfg.Transport.StartupJitterSeconds == 0 {
		cfg.Transport.StartupJitterSeconds = 5
	}
	if cfg.Transport.Backpressure.WindowSeconds == 0 {
		cfg.Transport.Backpressure.WindowSeconds = 60
	}
	if cfg.Transport.Backpressure.MinSendRate == 0 {
		cfg.Transport.Backpressure.MinSendRate = 100
	}
	if cfg.Transport.Backpressure.MaxReplayBPS == 0 {
		cfg.Transport.Backpressure.MaxReplayBPS = 5000
	}
	if cfg.Transport.DeadLetter.Dir == "" && cfg.Buffer.WALDir != "" {
		cfg.Transport.DeadLetter.Dir = cfg.Buffer.WALDir + "/../dead-letter/metrics"
	}
	if cfg.Transport.DeadLetter.MaxFiles == 0 {
		cfg.Transport.DeadLetter.MaxFiles = 100
	}
	if cfg.Transport.DeadLetter.MaxTotalMB == 0 {
		cfg.Transport.DeadLetter.MaxTotalMB = 200
	}
	if cfg.Transport.DeadLetter.DropPolicy == "" {
		cfg.Transport.DeadLetter.DropPolicy = "oldest_first"
	}
	// Logs defaults
	if cfg.Logs.Redaction.Enabled == nil && len(cfg.Logs.Sources) > 0 {
		trueVal := true
		cfg.Logs.Redaction.Enabled = &trueVal
	}
	if cfg.Logs.Spool.MaxSizeMB == 0 {
		cfg.Logs.Spool.MaxSizeMB = 2048
	}
	if cfg.Logs.Spool.HighWatermarkPct == 0 {
		cfg.Logs.Spool.HighWatermarkPct = 80
	}
	if cfg.Logs.Spool.CriticalWatermarkPct == 0 {
		cfg.Logs.Spool.CriticalWatermarkPct = 95
	}
	for i := range cfg.Logs.Sources {
		if cfg.Logs.Sources[i].StartPosition == "" {
			cfg.Logs.Sources[i].StartPosition = "end"
		}
		if cfg.Logs.Sources[i].Multiline.MaxBytes == 0 {
			cfg.Logs.Sources[i].Multiline.MaxBytes = 32768
		}
		if cfg.Logs.Sources[i].Multiline.FlushTimeout == 0 {
			cfg.Logs.Sources[i].Multiline.FlushTimeout = 5 * time.Second
		}
	}
}

func validate(cfg *Config) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("config: api_key is required")
	}
	if cfg.Endpoint == "" {
		return fmt.Errorf("config: endpoint is required")
	}
	if !strings.HasPrefix(cfg.Endpoint, "http://") && !strings.HasPrefix(cfg.Endpoint, "https://") {
		return fmt.Errorf("config: endpoint must start with http:// or https://")
	}
	if cfg.CloudDetection != "auto" && cfg.CloudDetection != "skip" {
		return fmt.Errorf("config: cloud_detection must be 'auto' or 'skip', got %q", cfg.CloudDetection)
	}
	if cfg.Collection.IntervalSeconds < 10 || cfg.Collection.IntervalSeconds > 300 {
		return fmt.Errorf("config: collection.interval_seconds must be 10-300, got %d", cfg.Collection.IntervalSeconds)
	}
	if cfg.Collection.ProcessIntervalSeconds < 10 || cfg.Collection.ProcessIntervalSeconds > 300 {
		return fmt.Errorf("config: collection.process_interval_seconds must be 10-300, got %d", cfg.Collection.ProcessIntervalSeconds)
	}
	if cfg.Collection.SlowIntervalSeconds < 30 || cfg.Collection.SlowIntervalSeconds > 600 {
		return fmt.Errorf("config: collection.slow_interval_seconds must be 30-600, got %d", cfg.Collection.SlowIntervalSeconds)
	}
	if cfg.Transport.BatchMaxSize < 100 || cfg.Transport.BatchMaxSize > 10000 {
		return fmt.Errorf("config: transport.batch_max_size must be 100-10000, got %d", cfg.Transport.BatchMaxSize)
	}
	if cfg.Transport.RequestTimeoutSeconds < 5 || cfg.Transport.RequestTimeoutSeconds > 120 {
		return fmt.Errorf("config: transport.request_timeout_seconds must be 5-120, got %d", cfg.Transport.RequestTimeoutSeconds)
	}
	if cfg.Buffer.MemoryMaxItems < 1000 || cfg.Buffer.MemoryMaxItems > 1000000 {
		return fmt.Errorf("config: buffer.memory_max_items must be 1000-1000000, got %d", cfg.Buffer.MemoryMaxItems)
	}
	if cfg.Memory.SoftLimitMB < 64 {
		return fmt.Errorf("config: memory.soft_limit_mb must be >= 64, got %d", cfg.Memory.SoftLimitMB)
	}
	if cfg.Memory.HardLimitMB <= cfg.Memory.SoftLimitMB {
		return fmt.Errorf("config: memory.hard_limit_mb (%d) must be greater than soft_limit_mb (%d)", cfg.Memory.HardLimitMB, cfg.Memory.SoftLimitMB)
	}
	if cfg.Memory.CheckIntervalSeconds < 1 {
		return fmt.Errorf("config: memory.check_interval_seconds must be >= 1, got %d", cfg.Memory.CheckIntervalSeconds)
	}
	if cfg.Health.Bind != "" {
		if _, _, err := net.SplitHostPort(cfg.Health.Bind); err != nil {
			return fmt.Errorf("config: health.bind %q is not a valid address: %w", cfg.Health.Bind, err)
		}
	}
	if cfg.Transport.Backpressure.WindowSeconds < 10 {
		return fmt.Errorf("config: transport.backpressure.window_seconds must be >= 10, got %d", cfg.Transport.Backpressure.WindowSeconds)
	}
	if cfg.Transport.Backpressure.MinSendRate <= 0 {
		return fmt.Errorf("config: transport.backpressure.min_send_rate must be > 0, got %d", cfg.Transport.Backpressure.MinSendRate)
	}
	if cfg.Transport.Backpressure.MaxReplayBPS <= 0 {
		return fmt.Errorf("config: transport.backpressure.max_replay_bps must be > 0, got %d", cfg.Transport.Backpressure.MaxReplayBPS)
	}
	if cfg.Transport.StartupJitterSeconds < 0 {
		return fmt.Errorf("config: transport.startup_jitter_seconds must be >= 0, got %d", cfg.Transport.StartupJitterSeconds)
	}
	validLevels := map[string]bool{"debug": true, "info": true, "warn": true, "error": true}
	if !validLevels[cfg.Logging.Level] {
		return fmt.Errorf("config: logging.level must be debug|info|warn|error, got %q", cfg.Logging.Level)
	}
	validFormats := map[string]bool{"json": true, "text": true}
	if !validFormats[cfg.Logging.Format] {
		return fmt.Errorf("config: logging.format must be json|text, got %q", cfg.Logging.Format)
	}

	// Validate process ignore patterns
	for i, pattern := range cfg.Process.IgnorePatterns {
		if _, err := regexp.Compile(pattern); err != nil {
			return fmt.Errorf("config: process.ignore_patterns[%d] %q is invalid regex: %w", i, pattern, err)
		}
	}

	// Validate process allow/deny patterns
	for i, pattern := range cfg.Process.AllowRegex {
		if _, err := regexp.Compile(pattern); err != nil {
			return fmt.Errorf("config: process.allow_regex[%d] %q is invalid regex: %w", i, pattern, err)
		}
	}
	for i, pattern := range cfg.Process.DenyRegex {
		if _, err := regexp.Compile(pattern); err != nil {
			return fmt.Errorf("config: process.deny_regex[%d] %q is invalid regex: %w", i, pattern, err)
		}
	}

	// Validate aggregation rules
	if cfg.Process.Aggregation.Enabled {
		if len(cfg.Process.Aggregation.Rules) == 0 {
			return fmt.Errorf("config: process.aggregation.enabled=true but no rules defined")
		}
		if len(cfg.Process.Aggregation.Rules) > 50 {
			return fmt.Errorf("config: process.aggregation.rules count %d exceeds maximum 50", len(cfg.Process.Aggregation.Rules))
		}

		aggNamePattern := regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)
		for i, rule := range cfg.Process.Aggregation.Rules {
			// Validate pattern
			if _, err := regexp.Compile(rule.Pattern); err != nil {
				return fmt.Errorf("config: process.aggregation.rules[%d].pattern %q is invalid regex: %w", i, rule.Pattern, err)
			}

			// Validate aggregate_as
			if rule.AggregateAs == "" {
				return fmt.Errorf("config: process.aggregation.rules[%d].aggregate_as is required", i)
			}
			if len(rule.AggregateAs) > 64 {
				return fmt.Errorf("config: process.aggregation.rules[%d].aggregate_as %q exceeds 64 chars", i, rule.AggregateAs)
			}
			if !aggNamePattern.MatchString(rule.AggregateAs) {
				return fmt.Errorf("config: process.aggregation.rules[%d].aggregate_as %q contains invalid characters (only alphanumeric, dash, underscore, dot allowed)", i, rule.AggregateAs)
			}
		}
	}

	// Validate CA bundle path if set
	if cfg.CABundlePath != "" {
		// Enforce absolute path
		if !filepath.IsAbs(cfg.CABundlePath) {
			return fmt.Errorf("ca_bundle_path must be absolute, got: %s", cfg.CABundlePath)
		}

		// Check file exists and is readable
		fileInfo, err := os.Stat(cfg.CABundlePath)
		if os.IsNotExist(err) {
			return fmt.Errorf("ca_bundle_path: file not found: %s", cfg.CABundlePath)
		} else if os.IsPermission(err) {
			return fmt.Errorf("ca_bundle_path: permission denied: %s", cfg.CABundlePath)
		} else if err != nil {
			return fmt.Errorf("ca_bundle_path: error accessing file: %w", err)
		}

		// Check it's a file, not directory
		if fileInfo.IsDir() {
			return fmt.Errorf("ca_bundle_path: must be a file, got directory: %s", cfg.CABundlePath)
		}

		// Validate PEM content
		if err := validateCABundle(cfg.CABundlePath); err != nil {
			return fmt.Errorf("ca_bundle_path: %w", err)
		}
	}

	// Validate logs config
	if cfg.Logs.Enabled {
		if len(cfg.Logs.Sources) == 0 {
			return fmt.Errorf("config: logs.enabled=true but no sources defined")
		}
		for i, source := range cfg.Logs.Sources {
			// Validate path is absolute
			if !filepath.IsAbs(source.Path) {
				return fmt.Errorf("config: logs.sources[%d].path must be absolute, got: %s", i, source.Path)
			}
			// Validate service is required
			if source.Service == "" {
				return fmt.Errorf("config: logs.sources[%d].service is required", i)
			}
			// Validate start_position
			if source.StartPosition != "start" && source.StartPosition != "end" {
				return fmt.Errorf("config: logs.sources[%d].start_position must be 'start' or 'end', got: %s", i, source.StartPosition)
			}
			// Validate parser mode
			if source.Parser.Mode != "" && source.Parser.Mode != "raw" && source.Parser.Mode != "json" && source.Parser.Mode != "regex" {
				return fmt.Errorf("config: logs.sources[%d].parser.mode must be 'raw', 'json', or 'regex', got: %s", i, source.Parser.Mode)
			}
			// Validate regex pattern if mode is regex
			if source.Parser.Mode == "regex" && source.Parser.Pattern == "" {
				return fmt.Errorf("config: logs.sources[%d].parser.pattern is required when mode is 'regex'", i)
			}
			// Validate multiline mode
			if source.Multiline.Enabled {
				if source.Multiline.Mode != "start" && source.Multiline.Mode != "continue" {
					return fmt.Errorf("config: logs.sources[%d].multiline.mode must be 'start' or 'continue', got: %s", i, source.Multiline.Mode)
				}
				if source.Multiline.Pattern == "" {
					return fmt.Errorf("config: logs.sources[%d].multiline.pattern is required when multiline.enabled=true", i)
				}
				if _, err := regexp.Compile(source.Multiline.Pattern); err != nil {
					return fmt.Errorf("config: logs.sources[%d].multiline.pattern %q is invalid regex: %w", i, source.Multiline.Pattern, err)
				}
			}
		}
		// Validate spool config
		if cfg.Logs.Spool.MaxSizeMB < 100 || cfg.Logs.Spool.MaxSizeMB > 10000 {
			return fmt.Errorf("config: logs.spool.max_size_mb must be 100-10000, got %d", cfg.Logs.Spool.MaxSizeMB)
		}
		if cfg.Logs.Spool.HighWatermarkPct < 50 || cfg.Logs.Spool.HighWatermarkPct > 95 {
			return fmt.Errorf("config: logs.spool.high_watermark_pct must be 50-95, got %d", cfg.Logs.Spool.HighWatermarkPct)
		}
		if cfg.Logs.Spool.CriticalWatermarkPct <= cfg.Logs.Spool.HighWatermarkPct || cfg.Logs.Spool.CriticalWatermarkPct > 99 {
			return fmt.Errorf("config: logs.spool.critical_watermark_pct must be > high_watermark_pct and <= 99, got %d", cfg.Logs.Spool.CriticalWatermarkPct)
		}
	}

	return nil
}

func validateCABundle(path string) error {
	pemData, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	// Create empty pool and try to append certs
	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(pemData) {
		return fmt.Errorf("file contains no valid PEM certificates")
	}

	return nil
}

func (cfg *Config) IsCollectorDisabled(name string) bool {
	for _, d := range cfg.Collectors.Disabled {
		if d == name {
			return true
		}
	}
	return false
}

func (cfg *Config) RateMaxElapsed() time.Duration {
	if cfg.Collectors.RateMaxElapsedSeconds > 0 {
		return time.Duration(cfg.Collectors.RateMaxElapsedSeconds) * time.Second
	}
	scaled := time.Duration(cfg.Collection.IntervalSeconds) * 10 * time.Second
	if scaled < 10*time.Minute {
		scaled = 10 * time.Minute
	}
	return scaled
}

func (cfg *Config) CollectorTimeout() time.Duration {
	return time.Duration(cfg.Collectors.TimeoutSeconds) * time.Second
}

func (cfg *Config) HealthBindDeprecated() bool {
	return cfg.Health.Port != 0
}

func (cfg *Config) RedactedAPIKey() string {
	if len(cfg.APIKey) <= 12 {
		return "***"
	}
	return cfg.APIKey[:12] + "***"
}
