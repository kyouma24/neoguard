package collector

import (
	"context"
	"math"
	"runtime"
	"strconv"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/load"
)

type CPUCollector struct {
	cfg config.CPUConfig
}

func NewCPUCollector(cfg config.CPUConfig) *CPUCollector {
	return &CPUCollector{cfg: cfg}
}

func (c *CPUCollector) Name() string { return "cpu" }

func (c *CPUCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	totalPct, err := cpu.PercentWithContext(ctx, 0, false)
	if err == nil && len(totalPct) > 0 {
		points = append(points, model.NewGauge("system.cpu.usage_total_pct", totalPct[0], baseTags))
	}

	times, err := cpu.TimesWithContext(ctx, true)
	if err == nil && len(times) > 0 {
		points = append(points, model.NewGauge("system.cpu.core_count", float64(len(times)), baseTags))

		points = append(points, c.collectAggregateModes(times, baseTags)...)

		if c.cfg.PerCore {
			points = append(points, c.collectPerCoreModes(times, baseTags)...)
		}
	}

	infos, err := cpu.InfoWithContext(ctx)
	if err == nil && len(infos) > 0 {
		points = append(points, c.collectFrequency(infos, baseTags)...)
	}

	if runtime.GOOS == "linux" {
		avg, err := load.AvgWithContext(ctx)
		if err == nil {
			points = append(points,
				model.NewGauge("system.cpu.load.1m", avg.Load1, baseTags),
				model.NewGauge("system.cpu.load.5m", avg.Load5, baseTags),
				model.NewGauge("system.cpu.load.15m", avg.Load15, baseTags),
			)
		}
	}

	return points, nil
}

func (c *CPUCollector) collectAggregateModes(times []cpu.TimesStat, baseTags map[string]string) []model.MetricPoint {
	var totalUser, totalSystem, totalIdle, totalNice, totalIowait float64
	var totalIrq, totalSoftirq, totalSteal, totalGuest float64
	var totalAll float64

	for _, t := range times {
		total := t.User + t.System + t.Idle + t.Nice + t.Iowait + t.Irq + t.Softirq + t.Steal + t.Guest + t.GuestNice
		totalUser += t.User
		totalSystem += t.System
		totalIdle += t.Idle
		totalNice += t.Nice
		totalIowait += t.Iowait
		totalIrq += t.Irq
		totalSoftirq += t.Softirq
		totalSteal += t.Steal
		totalGuest += t.Guest
		totalAll += total
	}

	if totalAll == 0 {
		return nil
	}

	pct := func(v float64) float64 { return (v / totalAll) * 100 }

	points := []model.MetricPoint{
		model.NewGauge("system.cpu.user_pct", pct(totalUser), baseTags),
		model.NewGauge("system.cpu.system_pct", pct(totalSystem), baseTags),
		model.NewGauge("system.cpu.idle_pct", pct(totalIdle), baseTags),
	}

	if runtime.GOOS == "linux" {
		points = append(points,
			model.NewGauge("system.cpu.nice_pct", pct(totalNice), baseTags),
			model.NewGauge("system.cpu.iowait_pct", pct(totalIowait), baseTags),
			model.NewGauge("system.cpu.irq_pct", pct(totalIrq), baseTags),
			model.NewGauge("system.cpu.softirq_pct", pct(totalSoftirq), baseTags),
			model.NewGauge("system.cpu.steal_pct", pct(totalSteal), baseTags),
			model.NewGauge("system.cpu.guest_pct", pct(totalGuest), baseTags),
		)
	} else if runtime.GOOS == "windows" {
		points = append(points,
			model.NewGauge("system.cpu.interrupt_pct", pct(totalIrq), baseTags),
			model.NewGauge("system.cpu.dpc_pct", pct(totalSoftirq), baseTags),
		)
	}

	return points
}

func (c *CPUCollector) collectPerCoreModes(times []cpu.TimesStat, baseTags map[string]string) []model.MetricPoint {
	var points []model.MetricPoint

	for i, t := range times {
		core := strconv.Itoa(i)
		total := t.User + t.System + t.Idle + t.Nice + t.Iowait + t.Irq + t.Softirq + t.Steal + t.Guest + t.GuestNice
		if total == 0 {
			continue
		}

		modes := map[string]float64{
			"user":   t.User,
			"system": t.System,
			"idle":   t.Idle,
		}
		if runtime.GOOS == "linux" {
			modes["nice"] = t.Nice
			modes["iowait"] = t.Iowait
			modes["irq"] = t.Irq
			modes["softirq"] = t.Softirq
			modes["steal"] = t.Steal
		} else if runtime.GOOS == "windows" {
			modes["interrupt"] = t.Irq
			modes["dpc"] = t.Softirq
		}

		for mode, value := range modes {
			pct := (value / total) * 100
			tags := model.MergeTags(baseTags, map[string]string{"core": core, "mode": mode})
			points = append(points, model.NewGauge("system.cpu.usage_pct", pct, tags))
		}
	}

	return points
}

func (c *CPUCollector) collectFrequency(infos []cpu.InfoStat, baseTags map[string]string) []model.MetricPoint {
	var points []model.MetricPoint
	var minMhz, maxMhz, sumMhz float64
	count := 0

	minMhz = math.MaxFloat64
	for _, info := range infos {
		if info.Mhz <= 0 {
			continue
		}
		count++
		sumMhz += info.Mhz
		if info.Mhz < minMhz {
			minMhz = info.Mhz
		}
		if info.Mhz > maxMhz {
			maxMhz = info.Mhz
		}
	}

	if count > 0 {
		points = append(points,
			model.NewGauge("system.cpu.frequency_mhz.avg", sumMhz/float64(count), baseTags),
			model.NewGauge("system.cpu.frequency_mhz.min", minMhz, baseTags),
			model.NewGauge("system.cpu.frequency_mhz.max", maxMhz, baseTags),
		)
	}

	if c.cfg.PerCoreFrequency {
		for i, info := range infos {
			if info.Mhz > 0 {
				tags := model.MergeTags(baseTags, map[string]string{"core": strconv.Itoa(i)})
				points = append(points, model.NewGauge("system.cpu.frequency_mhz", info.Mhz, tags))
			}
		}
	}

	return points
}
