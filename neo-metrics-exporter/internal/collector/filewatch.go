package collector

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type FileWatchCollector struct {
	patterns []string
	maxFiles int
	rate     *RateComputer
}

func NewFileWatchCollector(cfg config.FileWatchConfig) *FileWatchCollector {
	maxFiles := cfg.MaxFiles
	if maxFiles <= 0 {
		maxFiles = 50
	}
	return &FileWatchCollector{
		patterns: cfg.Paths,
		maxFiles: maxFiles,
		rate:     NewRateComputer(),
	}
}

func (c *FileWatchCollector) Name() string { return "filewatch" }

func (c *FileWatchCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	paths := c.resolvePaths()
	if len(paths) == 0 {
		return nil, nil
	}

	var points []model.MetricPoint
	now := time.Now()

	for _, path := range paths {
		tags := model.MergeTags(baseTags, map[string]string{
			"path":     path,
			"filename": filepath.Base(path),
		})

		info, err := os.Stat(path)
		if err != nil {
			points = append(points, model.NewGauge("system.file.exists", 0, tags))
			continue
		}

		points = append(points,
			model.NewGauge("system.file.exists", 1, tags),
			model.NewGauge("system.file.size_bytes", float64(info.Size()), tags),
			model.NewGauge("system.file.age_seconds", now.Sub(info.ModTime()).Seconds(), tags),
		)

		if rate, ok := c.rate.Compute("filewatch:"+path, float64(info.Size())); ok {
			points = append(points, model.NewGauge("system.file.growth_bytes_per_sec", rate, tags))
		}
	}

	return points, nil
}

func (c *FileWatchCollector) resolvePaths() []string {
	seen := make(map[string]bool)
	var result []string

	for _, pattern := range c.patterns {
		if isGlob(pattern) {
			matches, err := filepath.Glob(pattern)
			if err != nil {
				continue
			}
			for _, m := range matches {
				if !seen[m] {
					seen[m] = true
					result = append(result, m)
				}
			}
		} else {
			if !seen[pattern] {
				seen[pattern] = true
				result = append(result, pattern)
			}
		}
	}

	sort.Strings(result)
	if len(result) > c.maxFiles {
		result = result[:c.maxFiles]
	}
	return result
}

func isGlob(s string) bool {
	return strings.ContainsAny(s, "*?[")
}
