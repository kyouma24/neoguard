package collector

import (
	"context"
	"runtime"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/host"
)

type SystemCollector struct{}

func NewSystemCollector() *SystemCollector {
	return &SystemCollector{}
}

func (c *SystemCollector) Name() string { return "system" }

func (c *SystemCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	uptime, err := host.UptimeWithContext(ctx)
	if err == nil {
		points = append(points, model.NewGauge("system.uptime_seconds", float64(uptime), baseTags))
	}

	bootTime, err := host.BootTimeWithContext(ctx)
	if err == nil {
		points = append(points, model.NewGauge("system.boot_time", float64(bootTime), baseTags))
	}

	info, err := host.InfoWithContext(ctx)
	if err == nil {
		infoTags := model.MergeTags(baseTags, map[string]string{
			"os_name":        info.Platform,
			"os_version":     info.PlatformVersion,
			"kernel_version": info.KernelVersion,
			"arch":           runtime.GOARCH,
		})
		points = append(points, model.NewGauge("system.os.info", 1, infoTags))
	}

	users, err := host.UsersWithContext(ctx)
	if err == nil {
		points = append(points, model.NewGauge("system.users.logged_in", float64(len(users)), baseTags))
	}

	return points, nil
}
