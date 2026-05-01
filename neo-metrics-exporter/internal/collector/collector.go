package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type Collector interface {
	Name() string
	Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error)
}

type IntervalTier int

const (
	TierNormal IntervalTier = iota
	TierSlow
)

type TieredCollector struct {
	Collector Collector
	Tier      IntervalTier
}

type CompositeCollector interface {
	Name() string
	CollectComposite(ctx context.Context, baseTags map[string]string, currentPoints []model.MetricPoint) ([]model.MetricPoint, error)
}
