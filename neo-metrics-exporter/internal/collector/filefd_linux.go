//go:build linux

package collector

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type FileFDCollector struct{}

func NewFileFDCollector() *FileFDCollector {
	return &FileFDCollector{}
}

func (c *FileFDCollector) Name() string { return "filefd" }

func (c *FileFDCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	content, err := procfs.ReadFileString("/proc/sys/fs/file-nr")
	if err != nil {
		return nil, err
	}

	fields := strings.Fields(content)
	if len(fields) < 3 {
		return nil, fmt.Errorf("unexpected file-nr format: %q", content)
	}

	allocated, err := strconv.ParseUint(fields[0], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parse allocated: %w", err)
	}

	maximum, err := strconv.ParseUint(fields[2], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parse maximum: %w", err)
	}

	points := []model.MetricPoint{
		model.NewGauge("system.filefd.allocated", float64(allocated), baseTags),
		model.NewGauge("system.filefd.maximum", float64(maximum), baseTags),
	}

	if maximum > 0 {
		pct := float64(allocated) / float64(maximum) * 100
		points = append(points, model.NewGauge("system.filefd.used_pct", pct, baseTags))
	}

	return points, nil
}
