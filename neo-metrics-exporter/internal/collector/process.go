package collector

import (
	"context"
	"log/slog"
	"regexp"
	"sort"
	"strconv"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/process"
)

type ProcessCollector struct {
	topN       int
	allowRegex []*regexp.Regexp
	denyRegex  []*regexp.Regexp
}

type ProcessConfig struct {
	TopN       int
	AllowRegex []string
	DenyRegex  []string
}

func NewProcessCollector(cfg ProcessConfig) *ProcessCollector {
	if cfg.TopN <= 0 {
		cfg.TopN = 20
	}

	var allow []*regexp.Regexp
	for _, pattern := range cfg.AllowRegex {
		if r, err := regexp.Compile(pattern); err == nil {
			allow = append(allow, r)
		}
	}

	var deny []*regexp.Regexp
	for _, pattern := range cfg.DenyRegex {
		if r, err := regexp.Compile(pattern); err == nil {
			deny = append(deny, r)
		}
	}

	return &ProcessCollector{
		topN:       cfg.TopN,
		allowRegex: allow,
		denyRegex:  deny,
	}
}

func (c *ProcessCollector) Name() string { return "process" }

type procSortKey struct {
	proc   *process.Process
	name   string
	cpuPct float64
	memRSS uint64
}

type procInfo struct {
	pid      int32
	name     string
	user     string
	cmdline  string
	cpuPct   float64
	memRSS   uint64
	memPct   float32
	threads  int32
	fds      int32
	ioReadB  uint64
	ioWriteB uint64
}

func (c *ProcessCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil, err
	}

	// Pass 1: cheap fields only — name + CPU% + memory RSS for sorting
	candidates := make([]procSortKey, 0, len(procs)/2)
	for _, p := range procs {
		if ctx.Err() != nil {
			break
		}

		name, err := p.NameWithContext(ctx)
		if err != nil || name == "" {
			continue
		}

		if !c.isAllowed(name) {
			continue
		}

		cpuPct, _ := p.CPUPercentWithContext(ctx)

		var memRSS uint64
		memInfo, err := p.MemoryInfoWithContext(ctx)
		if err == nil && memInfo != nil {
			memRSS = memInfo.RSS
		}

		candidates = append(candidates, procSortKey{
			proc:   p,
			name:   name,
			cpuPct: cpuPct,
			memRSS: memRSS,
		})
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].cpuPct != candidates[j].cpuPct {
			return candidates[i].cpuPct > candidates[j].cpuPct
		}
		return candidates[i].memRSS > candidates[j].memRSS
	})

	if len(candidates) > c.topN {
		candidates = candidates[:c.topN]
	}

	// Pass 2: enrich only top-N with expensive syscalls
	var points []model.MetricPoint
	for _, sk := range candidates {
		if ctx.Err() != nil {
			break
		}

		info := procInfo{
			pid:    sk.proc.Pid,
			name:   sk.name,
			cpuPct: sk.cpuPct,
			memRSS: sk.memRSS,
		}

		info.memPct, _ = sk.proc.MemoryPercentWithContext(ctx)
		info.threads, _ = sk.proc.NumThreadsWithContext(ctx)

		if fds, err := sk.proc.NumFDsWithContext(ctx); err == nil {
			info.fds = fds
		}

		info.user, _ = sk.proc.UsernameWithContext(ctx)

		if ioCounters, err := sk.proc.IOCountersWithContext(ctx); err == nil && ioCounters != nil {
			info.ioReadB = ioCounters.ReadBytes
			info.ioWriteB = ioCounters.WriteBytes
		}

		info.cmdline, _ = sk.proc.CmdlineWithContext(ctx)
		if len(info.cmdline) > 200 {
			info.cmdline = info.cmdline[:200]
		}

		tags := model.MergeTags(baseTags, map[string]string{
			"process_name":    info.name,
			"process_pid":     strconv.Itoa(int(info.pid)),
			"process_user":    info.user,
			"process_cmdline": info.cmdline,
		})

		points = append(points,
			model.NewGauge("process.cpu_pct", info.cpuPct, tags),
			model.NewGauge("process.memory_bytes", float64(info.memRSS), tags),
			model.NewGauge("process.memory_pct", float64(info.memPct), tags),
			model.NewGauge("process.threads", float64(info.threads), tags),
			model.NewGauge("process.open_fds", float64(info.fds), tags),
			model.NewGauge("process.io_read_bytes", float64(info.ioReadB), tags),
			model.NewGauge("process.io_write_bytes", float64(info.ioWriteB), tags),
		)
	}

	slog.Debug("process collector", "processes_scanned", len(procs), "candidates", len(candidates), "reported", len(candidates))

	points = append(points,
		model.NewGauge("system.processes.total", float64(len(procs)), baseTags),
	)

	return points, nil
}

func (c *ProcessCollector) isAllowed(name string) bool {
	for _, r := range c.denyRegex {
		if r.MatchString(name) {
			return false
		}
	}

	if len(c.allowRegex) == 0 {
		return true
	}

	for _, r := range c.allowRegex {
		if r.MatchString(name) {
			return true
		}
	}
	return false
}
