package collector

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"unicode/utf8"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/shirou/gopsutil/v4/process"
)

// ProcessSource abstracts process listing for testing.
// Production implementations should fetch cheap fields first, then enrich selectively.
type ProcessSource interface {
	// ListProcesses returns basic process info (cheap syscalls: PID, name, CPU%, memory RSS)
	ListProcesses(ctx context.Context) ([]BasicProcessInfo, error)
	// EnrichProcess fetches expensive fields for a specific PID based on options
	EnrichProcess(ctx context.Context, pid int32, opts EnrichOptions) (*ProcessDetails, error)
}

// EnrichOptions controls which expensive fields to fetch during enrichment.
type EnrichOptions struct {
	IncludeCmdline bool // Fetch command line (opt-in for privacy/performance)
}

// BasicProcessInfo holds cheap fields for filtering and sorting.
type BasicProcessInfo struct {
	PID    int32
	Name   string
	CPUPct float64
	MemRSS uint64
}

// ProcessDetails holds expensive fields fetched only for selected processes.
type ProcessDetails struct {
	User     string
	Cmdline  string
	MemPct   float32
	Threads  int32
	FDs      int32
	IOReadB  uint64
	IOWriteB uint64
}

// ProcessInfo combines basic and detailed process information.
type ProcessInfo struct {
	BasicProcessInfo
	ProcessDetails
}

// gopsutilSource is the production ProcessSource using gopsutil.
type gopsutilSource struct{}

func (s gopsutilSource) ListProcesses(ctx context.Context) ([]BasicProcessInfo, error) {
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil, err
	}

	var out []BasicProcessInfo
	for _, p := range procs {
		if ctx.Err() != nil {
			break
		}

		name, err := p.NameWithContext(ctx)
		if err != nil || name == "" {
			continue
		}

		cpuPct, _ := p.CPUPercentWithContext(ctx)

		var memRSS uint64
		memInfo, err := p.MemoryInfoWithContext(ctx)
		if err == nil && memInfo != nil {
			memRSS = memInfo.RSS
		}

		out = append(out, BasicProcessInfo{
			PID:    p.Pid,
			Name:   name,
			CPUPct: cpuPct,
			MemRSS: memRSS,
		})
	}
	return out, nil
}

func (s gopsutilSource) EnrichProcess(ctx context.Context, pid int32, opts EnrichOptions) (*ProcessDetails, error) {
	p, err := process.NewProcessWithContext(ctx, pid)
	if err != nil {
		return nil, err
	}

	details := &ProcessDetails{}
	details.User, _ = p.UsernameWithContext(ctx)

	// Only fetch cmdline when explicitly requested (privacy + performance)
	if opts.IncludeCmdline {
		details.Cmdline, _ = p.CmdlineWithContext(ctx)
	}

	details.MemPct, _ = p.MemoryPercentWithContext(ctx)
	details.Threads, _ = p.NumThreadsWithContext(ctx)

	if fds, err := p.NumFDsWithContext(ctx); err == nil {
		details.FDs = fds
	}

	if ioCounters, err := p.IOCountersWithContext(ctx); err == nil && ioCounters != nil {
		details.IOReadB = ioCounters.ReadBytes
		details.IOWriteB = ioCounters.WriteBytes
	}

	return details, nil
}

// aggregationRule holds a compiled aggregation pattern.
type aggregationRule struct {
	pattern     *regexp.Regexp
	aggregateAs string
}

var (
	reHexToken  = regexp.MustCompile(`[0-9a-f]{8,}`)
	reLongDigit = regexp.MustCompile(`\d{10,}`)
)

type ProcessCollector struct {
	source         ProcessSource
	topN           int
	collectCmdline bool
	ignoreRegex    []*regexp.Regexp
	allowRegex     []*regexp.Regexp
	denyRegex      []*regexp.Regexp
	aggRules       []aggregationRule

	sanitizedHex   atomic.Int64
	sanitizedDigit atomic.Int64
	sanitizedTrunc atomic.Int64
}

type ProcessConfig struct {
	TopN           int
	AllowRegex     []string
	DenyRegex      []string
	CollectCmdline bool
	IgnorePatterns []string
	Aggregation    struct {
		Enabled bool
		Rules   []struct {
			Pattern     string
			AggregateAs string
		}
	}
}

// NewProcessCollectorValidated constructs a ProcessCollector with validated regex patterns and aggregation invariants.
// Returns an error if any pattern fails to compile or aggregation config violates invariants.
func NewProcessCollectorValidated(cfg ProcessConfig) (*ProcessCollector, error) {
	if cfg.TopN <= 0 {
		cfg.TopN = 20
	}

	var ignore []*regexp.Regexp
	for _, pattern := range cfg.IgnorePatterns {
		r, err := regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid ignore_pattern %q: %w", pattern, err)
		}
		ignore = append(ignore, r)
	}

	var allow []*regexp.Regexp
	for _, pattern := range cfg.AllowRegex {
		r, err := regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid allow_regex %q: %w", pattern, err)
		}
		allow = append(allow, r)
	}

	var deny []*regexp.Regexp
	for _, pattern := range cfg.DenyRegex {
		r, err := regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid deny_regex %q: %w", pattern, err)
		}
		deny = append(deny, r)
	}

	var aggRules []aggregationRule
	if cfg.Aggregation.Enabled {
		if len(cfg.Aggregation.Rules) == 0 {
			return nil, fmt.Errorf("aggregation enabled but no rules provided")
		}
		if len(cfg.Aggregation.Rules) > 50 {
			return nil, fmt.Errorf("aggregation rules exceed maximum of 50 (got %d)", len(cfg.Aggregation.Rules))
		}

		for i, rule := range cfg.Aggregation.Rules {
			r, err := regexp.Compile(rule.Pattern)
			if err != nil {
				return nil, fmt.Errorf("invalid aggregation pattern %q: %w", rule.Pattern, err)
			}

			// Validate aggregate_as
			if rule.AggregateAs == "" {
				return nil, fmt.Errorf("aggregation rule %d: aggregate_as cannot be empty", i)
			}
			if len(rule.AggregateAs) > 64 {
				return nil, fmt.Errorf("aggregation rule %d: aggregate_as %q exceeds 64 characters (got %d)", i, rule.AggregateAs, len(rule.AggregateAs))
			}
			// Safe charset: alphanumeric + underscore + dash + dot
			aggregateAsPattern := regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)
			if !aggregateAsPattern.MatchString(rule.AggregateAs) {
				return nil, fmt.Errorf("aggregation rule %d: aggregate_as %q contains invalid characters (only alphanumeric, underscore, dash, dot allowed)", i, rule.AggregateAs)
			}

			aggRules = append(aggRules, aggregationRule{
				pattern:     r,
				aggregateAs: rule.AggregateAs,
			})
		}
	}

	return &ProcessCollector{
		source:         gopsutilSource{},
		topN:           cfg.TopN,
		collectCmdline: cfg.CollectCmdline,
		ignoreRegex:    ignore,
		allowRegex:     allow,
		denyRegex:      deny,
		aggRules:       aggRules,
	}, nil
}

// NewProcessCollector constructs a ProcessCollector, panicking on validation errors.
// Use NewProcessCollectorValidated for production code that can return errors.
func NewProcessCollector(cfg ProcessConfig) *ProcessCollector {
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		panic(err)
	}
	return c
}

func (c *ProcessCollector) Name() string { return "process" }

type aggregatedGroup struct {
	groupName string
	cpuPct    float64
	memRSS    uint64
	memPct    float32
	threads   int32
	fds       int32
	ioReadB   uint64
	ioWriteB  uint64
	count     int
}

func (c *ProcessCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	// Step 1: Cheap scan - get only PID, name, CPU%, memory RSS
	basicProcs, err := c.source.ListProcesses(ctx)
	if err != nil {
		return nil, err
	}

	totalScanned := len(basicProcs)

	// Step 2: Filter via ignore → deny → allow (cheap, before enrichment)
	var filtered []BasicProcessInfo
	for _, p := range basicProcs {
		if ctx.Err() != nil {
			break
		}
		if c.shouldIgnore(p.Name) {
			continue
		}
		if !c.isAllowed(p.Name) {
			continue
		}
		filtered = append(filtered, p)
	}

	// Step 3: Classify into aggregation groups vs individual candidates
	type groupMember struct {
		pid       int32
		cpuPct    float64
		memRSS    uint64
		groupName string
	}
	groupMembers := make(map[string][]groupMember) // groupName -> members
	var individualCandidates []BasicProcessInfo

	for _, p := range filtered {
		if ctx.Err() != nil {
			break
		}

		matched := false
		for _, rule := range c.aggRules {
			if rule.pattern.MatchString(p.Name) {
				groupMembers[rule.aggregateAs] = append(groupMembers[rule.aggregateAs], groupMember{
					pid:       p.PID,
					cpuPct:    p.CPUPct,
					memRSS:    p.MemRSS,
					groupName: rule.aggregateAs,
				})
				matched = true
				break // first-match-wins
			}
		}
		if !matched {
			individualCandidates = append(individualCandidates, p)
		}
	}

	// Step 4: Sort individual candidates by CPU% desc, then memory RSS desc
	sort.Slice(individualCandidates, func(i, j int) bool {
		if individualCandidates[i].CPUPct != individualCandidates[j].CPUPct {
			return individualCandidates[i].CPUPct > individualCandidates[j].CPUPct
		}
		return individualCandidates[i].MemRSS > individualCandidates[j].MemRSS
	})

	// Step 5: Apply top-N to individual candidates
	topN := individualCandidates
	if len(individualCandidates) > c.topN {
		topN = individualCandidates[:c.topN]
	}

	// Step 6: Enrich aggregation group members (expensive fields only for matched processes)
	// Aggregated metrics never use cmdline, so IncludeCmdline=false always
	groups := make(map[string]*aggregatedGroup)
	for groupName, members := range groupMembers {
		if ctx.Err() != nil {
			break
		}
		if groups[groupName] == nil {
			groups[groupName] = &aggregatedGroup{groupName: groupName}
		}
		g := groups[groupName]
		for _, m := range members {
			// Cheap fields already available
			g.cpuPct += m.cpuPct
			g.memRSS += m.memRSS
			g.count++

			// Fetch expensive fields only for aggregation members
			// Never include cmdline for aggregated metrics (privacy + performance)
			details, err := c.source.EnrichProcess(ctx, m.pid, EnrichOptions{IncludeCmdline: false})
			if err != nil {
				continue // Skip processes that disappeared or failed enrichment
			}
			g.memPct += details.MemPct
			g.threads += details.Threads
			g.fds += details.FDs
			g.ioReadB += details.IOReadB
			g.ioWriteB += details.IOWriteB
		}
	}

	// Step 7: Emit aggregated groups (process_group tag only)
	var points []model.MetricPoint
	for _, g := range groups {
		if ctx.Err() != nil {
			break
		}
		tags := model.MergeTags(baseTags, map[string]string{"process_group": g.groupName})
		points = append(points,
			model.NewGauge("process.cpu_pct", g.cpuPct, tags),
			model.NewGauge("process.memory_bytes", float64(g.memRSS), tags),
			model.NewGauge("process.memory_pct", float64(g.memPct), tags),
			model.NewGauge("process.threads", float64(g.threads), tags),
			model.NewGauge("process.open_fds", float64(g.fds), tags),
			model.NewGauge("process.io_read_bytes", float64(g.ioReadB), tags),
			model.NewGauge("process.io_write_bytes", float64(g.ioWriteB), tags),
		)
	}

	// Step 8: Enrich top-N individual processes (expensive fields only for top-N)
	// Cmdline is fetched only when collect_cmdline=true
	for _, p := range topN {
		if ctx.Err() != nil {
			break
		}

		// Only include cmdline when explicitly enabled
		details, err := c.source.EnrichProcess(ctx, p.PID, EnrichOptions{IncludeCmdline: c.collectCmdline})
		if err != nil {
			continue // Skip processes that disappeared
		}

		tags := map[string]string{
			"process_name": p.Name,
			"process_pid":  strconv.Itoa(int(p.PID)),
			"process_user": details.User,
		}

		if c.collectCmdline {
			cmdline := c.sanitizeCmdline(details.Cmdline)
			tags["process_cmdline"] = cmdline
		}

		tags = model.MergeTags(baseTags, tags)

		points = append(points,
			model.NewGauge("process.cpu_pct", p.CPUPct, tags),
			model.NewGauge("process.memory_bytes", float64(p.MemRSS), tags),
			model.NewGauge("process.memory_pct", float64(details.MemPct), tags),
			model.NewGauge("process.threads", float64(details.Threads), tags),
			model.NewGauge("process.open_fds", float64(details.FDs), tags),
			model.NewGauge("process.io_read_bytes", float64(details.IOReadB), tags),
			model.NewGauge("process.io_write_bytes", float64(details.IOWriteB), tags),
		)
	}

	slog.Debug("process collector",
		"processes_scanned", totalScanned,
		"filtered", len(filtered),
		"aggregated_groups", len(groups),
		"individual_reported", len(topN))

	// Step 9: Emit system.processes.total (OS total, not filtered)
	points = append(points,
		model.NewGauge("system.processes.total", float64(totalScanned), baseTags),
	)

	// Step 10: Emit cmdline sanitization counters
	if c.collectCmdline {
		points = append(points,
			model.NewCounter("agent.process.cmdline_sanitized_total", float64(c.sanitizedHex.Load()), model.MergeTags(baseTags, map[string]string{"reason": "hex_token"})),
			model.NewCounter("agent.process.cmdline_sanitized_total", float64(c.sanitizedDigit.Load()), model.MergeTags(baseTags, map[string]string{"reason": "long_digit"})),
			model.NewCounter("agent.process.cmdline_sanitized_total", float64(c.sanitizedTrunc.Load()), model.MergeTags(baseTags, map[string]string{"reason": "truncated"})),
		)
	}

	return points, nil
}

func (c *ProcessCollector) shouldIgnore(name string) bool {
	for _, r := range c.ignoreRegex {
		if r.MatchString(name) {
			return true
		}
	}
	return false
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

func hashReplace(m string) string {
	h := sha256.Sum256([]byte(m))
	// 16 uppercase hex chars (64-bit). Uppercase prevents re-matching by
	// reHexToken which only matches lowercase [0-9a-f], guaranteeing idempotency.
	return "H:" + strings.ToUpper(hex.EncodeToString(h[:8]))
}

func (c *ProcessCollector) sanitizeCmdline(raw string) string {
	raw = stripControlChars(raw)
	if reHexToken.MatchString(raw) {
		c.sanitizedHex.Add(1)
		raw = reHexToken.ReplaceAllStringFunc(raw, hashReplace)
	}
	if reLongDigit.MatchString(raw) {
		c.sanitizedDigit.Add(1)
		raw = reLongDigit.ReplaceAllStringFunc(raw, hashReplace)
	}
	if len(raw) > 128 {
		c.sanitizedTrunc.Add(1)
		raw = truncateUTF8(raw, 128)
	}
	return raw
}

func stripControlChars(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r < 0x20 || r == 0x7F {
			b.WriteByte(' ')
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func truncateUTF8(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	// Walk back at most 4 bytes (max UTF-8 sequence length) to find a rune boundary.
	for i := maxBytes; i > maxBytes-4 && i > 0; i-- {
		if utf8.RuneStart(s[i]) {
			return s[:i]
		}
	}
	// Input is invalid UTF-8 near the boundary. Fall back to byte truncation
	// to preserve observability rather than returning empty string.
	return s[:maxBytes]
}
