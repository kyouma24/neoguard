package config

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

var envVarPattern = regexp.MustCompile(`\$\{([a-zA-Z_][a-zA-Z0-9_]*)(?::-([^}]*))?\}`)

type Config struct {
	APIKey         string            `yaml:"api_key"`
	Endpoint       string            `yaml:"endpoint"`
	CloudDetection string            `yaml:"cloud_detection"`
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
}

type HealthConfig struct {
	Enabled bool `yaml:"enabled"`
	Port    int  `yaml:"port"`
}

type SaturationConfig struct {
	WindowSize int `yaml:"window_size"`
}

type FileWatchConfig struct {
	Paths    []string `yaml:"paths"`
	MaxFiles int      `yaml:"max_files"`
}

type ProcessConfig struct {
	TopN       int      `yaml:"top_n"`
	AllowRegex []string `yaml:"allow_regex"`
	DenyRegex  []string `yaml:"deny_regex"`
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
	BatchMaxSize           int `yaml:"batch_max_size"`
	BatchMaxIntervalSeconds int `yaml:"batch_max_interval_seconds"`
	RequestTimeoutSeconds  int `yaml:"request_timeout_seconds"`
}

type BufferConfig struct {
	MemoryMaxItems int    `yaml:"memory_max_items"`
	WALDir         string `yaml:"wal_dir"`
}

type CollectorsConfig struct {
	Disabled []string `yaml:"disabled"`
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
	if cfg.ExtraTags == nil {
		cfg.ExtraTags = make(map[string]string)
	}
	if cfg.Health.Port == 0 {
		cfg.Health.Port = 8282
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
	validLevels := map[string]bool{"debug": true, "info": true, "warn": true, "error": true}
	if !validLevels[cfg.Logging.Level] {
		return fmt.Errorf("config: logging.level must be debug|info|warn|error, got %q", cfg.Logging.Level)
	}
	validFormats := map[string]bool{"json": true, "text": true}
	if !validFormats[cfg.Logging.Format] {
		return fmt.Errorf("config: logging.format must be json|text, got %q", cfg.Logging.Format)
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

func (cfg *Config) RedactedAPIKey() string {
	if len(cfg.APIKey) <= 12 {
		return "***"
	}
	return cfg.APIKey[:12] + "***"
}
