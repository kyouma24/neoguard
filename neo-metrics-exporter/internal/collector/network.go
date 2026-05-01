package collector

import (
	"context"
	"path/filepath"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	net "github.com/shirou/gopsutil/v4/net"
)

type NetworkCollector struct {
	excludePatterns []string
	rate            *RateComputer
}

func NewNetworkCollector(excludeInterfaces []string) *NetworkCollector {
	return &NetworkCollector{
		excludePatterns: excludeInterfaces,
		rate:            NewRateComputer(),
	}
}

func (c *NetworkCollector) Name() string { return "network" }

func (c *NetworkCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	counters, err := net.IOCountersWithContext(ctx, true)
	if err != nil {
		return nil, err
	}

	var points []model.MetricPoint

	for _, iface := range counters {
		if c.isExcluded(iface.Name) {
			continue
		}

		tags := model.MergeTags(baseTags, map[string]string{"interface": iface.Name})
		prefix := "net." + iface.Name + "."

		if rate, ok := c.rate.Compute(prefix+"rx_bytes", float64(iface.BytesRecv)); ok {
			points = append(points, model.NewGauge("system.network.rx_bytes_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"tx_bytes", float64(iface.BytesSent)); ok {
			points = append(points, model.NewGauge("system.network.tx_bytes_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"rx_packets", float64(iface.PacketsRecv)); ok {
			points = append(points, model.NewGauge("system.network.rx_packets_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"tx_packets", float64(iface.PacketsSent)); ok {
			points = append(points, model.NewGauge("system.network.tx_packets_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"rx_errors", float64(iface.Errin)); ok {
			points = append(points, model.NewGauge("system.network.rx_errors_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"tx_errors", float64(iface.Errout)); ok {
			points = append(points, model.NewGauge("system.network.tx_errors_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"rx_dropped", float64(iface.Dropin)); ok {
			points = append(points, model.NewGauge("system.network.rx_dropped_per_sec", rate, tags))
		}
		if rate, ok := c.rate.Compute(prefix+"tx_dropped", float64(iface.Dropout)); ok {
			points = append(points, model.NewGauge("system.network.tx_dropped_per_sec", rate, tags))
		}
	}

	return points, nil
}

func (c *NetworkCollector) isExcluded(name string) bool {
	for _, pattern := range c.excludePatterns {
		if matched, _ := filepath.Match(pattern, name); matched {
			return true
		}
	}
	return false
}
