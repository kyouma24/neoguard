package collector

import (
	"context"
	"runtime"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/mem"
)

type MemoryCollector struct{}

func NewMemoryCollector() *MemoryCollector {
	return &MemoryCollector{}
}

func (c *MemoryCollector) Name() string { return "memory" }

func (c *MemoryCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	vm, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return nil, err
	}

	points = append(points,
		model.NewGauge("system.memory.total_bytes", float64(vm.Total), baseTags),
		model.NewGauge("system.memory.used_bytes", float64(vm.Used), baseTags),
		model.NewGauge("system.memory.available_bytes", float64(vm.Available), baseTags),
		model.NewGauge("system.memory.used_pct", vm.UsedPercent, baseTags),
		model.NewGauge("system.memory.free_bytes", float64(vm.Free), baseTags),
	)

	if runtime.GOOS == "linux" {
		points = append(points,
			model.NewGauge("system.memory.buffers_bytes", float64(vm.Buffers), baseTags),
			model.NewGauge("system.memory.cached_bytes", float64(vm.Cached), baseTags),
			model.NewGauge("system.memory.slab_bytes", float64(vm.Slab), baseTags),
			model.NewGauge("system.memory.dirty_bytes", float64(vm.Dirty), baseTags),
			model.NewGauge("system.memory.writeback_bytes", float64(vm.WriteBack), baseTags),
			model.NewGauge("system.memory.mapped_bytes", float64(vm.Mapped), baseTags),
			model.NewGauge("system.memory.page_tables_bytes", float64(vm.PageTables), baseTags),
			model.NewGauge("system.memory.hugepages.total", float64(vm.HugePagesTotal), baseTags),
			model.NewGauge("system.memory.hugepages.free", float64(vm.HugePagesFree), baseTags),
			model.NewGauge("system.memory.hugepages.size_bytes", float64(vm.HugePageSize), baseTags),
		)
	}

	if runtime.GOOS == "windows" {
		points = append(points,
			model.NewGauge("system.memory.committed_bytes", float64(vm.CommittedAS), baseTags),
		)
	}

	swap, err := mem.SwapMemoryWithContext(ctx)
	if err == nil {
		points = append(points,
			model.NewGauge("system.memory.swap.total_bytes", float64(swap.Total), baseTags),
			model.NewGauge("system.memory.swap.used_bytes", float64(swap.Used), baseTags),
			model.NewGauge("system.memory.swap.used_pct", swap.UsedPercent, baseTags),
		)
	}

	return points, nil
}
