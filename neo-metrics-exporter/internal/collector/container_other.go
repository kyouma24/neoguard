//go:build !linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type ContainerCollector struct{}

func NewContainerCollector() *ContainerCollector {
	return &ContainerCollector{}
}

func (c *ContainerCollector) Name() string { return "container" }

func (c *ContainerCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	tags := model.MergeTags(baseTags, map[string]string{
		"container_runtime": "baremetal",
	})
	return []model.MetricPoint{
		model.NewGauge("system.container.detected", 0, tags),
	}, nil
}
