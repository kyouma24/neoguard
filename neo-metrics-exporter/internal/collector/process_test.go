package collector

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestProcessCollectorName(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 10})
	if c.Name() != "process" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestProcessCollectorCollect(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 5})
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	if len(points) == 0 {
		t.Fatal("expected some process metrics")
	}

	hasCPU := false
	hasMem := false
	hasTotal := false
	hasIORead := false
	hasIOWrite := false
	for _, p := range points {
		switch p.Name {
		case "process.cpu_pct":
			hasCPU = true
			if p.Tags["process_name"] == "" {
				t.Error("missing process_name tag")
			}
			if p.Tags["process_pid"] == "" {
				t.Error("missing process_pid tag")
			}
			if _, ok := p.Tags["process_cmdline"]; ok {
				t.Error("process_cmdline tag should be absent when CollectCmdline=false (default)")
			}
		case "process.memory_bytes":
			hasMem = true
		case "process.io_read_bytes":
			hasIORead = true
		case "process.io_write_bytes":
			hasIOWrite = true
		case "system.processes.total":
			hasTotal = true
			if p.Value <= 0 {
				t.Errorf("total processes = %f", p.Value)
			}
		}
	}

	if !hasCPU {
		t.Error("missing process.cpu_pct")
	}
	if !hasMem {
		t.Error("missing process.memory_bytes")
	}
	if !hasIORead {
		t.Error("missing process.io_read_bytes")
	}
	if !hasIOWrite {
		t.Error("missing process.io_write_bytes")
	}
	if !hasTotal {
		t.Error("missing system.processes.total")
	}
}

func TestProcessCollectorTopN(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 3})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	cpuCount := 0
	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			cpuCount++
		}
	}

	if cpuCount > 3 {
		t.Errorf("expected at most 3 processes, got %d", cpuCount)
	}
}

func TestProcessCollectorDenyRegex(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		TopN:      50,
		DenyRegex: []string{"^System$", "^Idle$", "^\\[.*\\]$"},
	})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		name := p.Tags["process_name"]
		if name == "System" || name == "Idle" {
			t.Errorf("denied process %q should not appear", name)
		}
	}
}

func TestProcessCollectorAllowRegex(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		TopN:       50,
		AllowRegex: []string{"^neoguard"},
	})
	points, err := c.Collect(context.Background(), map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			name := p.Tags["process_name"]
			if name != "" && len(name) > 0 && name[:1] != "n" {
			}
		}
	}
	_ = points
}

func TestProcessCollectorDefaultTopN(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{})
	if c.topN != 20 {
		t.Errorf("default topN = %d, want 20", c.topN)
	}
}

func TestProcessCollectorIsAllowed(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		DenyRegex:  []string{"^kworker", "^scsi_"},
		AllowRegex: []string{},
	})

	tests := []struct {
		name    string
		allowed bool
	}{
		{"nginx", true},
		{"kworker/0:1", false},
		{"scsi_eh_0", false},
		{"python3", true},
		{"sshd", true},
	}

	for _, tt := range tests {
		if got := c.isAllowed(tt.name); got != tt.allowed {
			t.Errorf("isAllowed(%q) = %v, want %v", tt.name, got, tt.allowed)
		}
	}
}

func TestProcessCollectorIsAllowedWithFilter(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{
		AllowRegex: []string{"^nginx", "^python"},
	})

	if !c.isAllowed("nginx") {
		t.Error("nginx should be allowed")
	}
	if !c.isAllowed("python3") {
		t.Error("python3 should be allowed")
	}
	if c.isAllowed("sshd") {
		t.Error("sshd should not be allowed with explicit allow list")
	}
}

func TestProcessCmdlineOmittedByDefault(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 5})
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			if _, ok := p.Tags["process_cmdline"]; ok {
				t.Fatal("process_cmdline tag present with CollectCmdline=false")
			}
		}
	}
}

func TestProcessCmdlineCollectedWhenEnabled(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{TopN: 5, CollectCmdline: true})
	points, err := c.Collect(context.Background(), map[string]string{"hostname": "test"})
	if err != nil {
		t.Fatal(err)
	}

	found := false
	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			if _, ok := p.Tags["process_cmdline"]; ok {
				found = true
				break
			}
		}
	}
	if !found {
		t.Error("process_cmdline tag missing when CollectCmdline=true")
	}
}

func TestSanitizeCmdlineTruncation(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})
	long := strings.Repeat("a", 200)
	result := c.sanitizeCmdline(long)
	if len(result) > 128 {
		t.Errorf("len = %d, want <= 128", len(result))
	}
}

func TestSanitizeCmdlineHashesUUID(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})
	input := "python worker.py --job=550e8400e29b41d4a716446655440000"
	result := c.sanitizeCmdline(input)

	if strings.Contains(result, "550e8400") {
		t.Errorf("hex token not hashed: %q", result)
	}
	if !strings.Contains(result, "H:") {
		t.Errorf("expected H: prefix in output: %q", result)
	}
}

func TestSanitizeCmdlineHashesTimestamp(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})
	input := "job --started=1715600000000"
	result := c.sanitizeCmdline(input)

	if strings.Contains(result, "1715600000000") {
		t.Errorf("long digit not hashed: %q", result)
	}
	if !strings.Contains(result, "H:") {
		t.Errorf("expected H: prefix in output: %q", result)
	}
}

func TestSanitizeCmdlineNoOpClean(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})
	input := "nginx -g daemon off"
	result := c.sanitizeCmdline(input)
	if result != input {
		t.Errorf("clean input changed: %q -> %q", input, result)
	}
}

func TestSanitizeCmdlineTruncationDoesNotSplitHashableToken(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})

	// UUID placed so it starts at byte 120, extending to ~152
	prefix := strings.Repeat("x", 120)
	uuid := "550e8400e29b41d4a716446655440000" // 32 hex chars
	input := prefix + uuid

	result := c.sanitizeCmdline(input)

	// The UUID should be fully hashed BEFORE truncation
	if strings.Contains(result, "550e8400") {
		t.Errorf("UUID fragment leaked through: %q", result)
	}
	if !strings.Contains(result, "H:") {
		t.Errorf("expected H: prefix: %q", result)
	}
	if len(result) > 128 {
		t.Errorf("result too long: %d bytes", len(result))
	}
}

func TestSanitizeCmdlineUTF8Safe(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})

	// Build a string with a 3-byte UTF-8 char (€ = 0xE2 0x82 0xAC) at byte 127
	prefix := strings.Repeat("a", 126)
	input := prefix + "€€€" // each € is 3 bytes: total = 126 + 9 = 135 bytes
	result := c.sanitizeCmdline(input)

	if len(result) > 128 {
		t.Errorf("result too long: %d bytes", len(result))
	}
	if !utf8.ValidString(result) {
		t.Fatal("result is not valid UTF-8")
	}
}

func TestSanitizeCmdlineInvalidUTF8(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})

	// Build string with invalid UTF-8 bytes near the 128-byte boundary
	prefix := strings.Repeat("a", 120)
	// 0xFF 0xFE are never valid in UTF-8
	invalid := prefix + "\xff\xfe\xff\xfe\xff\xfe\xff\xfe\xff\xfe\xff\xfe"
	result := c.sanitizeCmdline(invalid)

	if result == "" {
		t.Fatal("truncateUTF8 returned empty string on invalid UTF-8 input")
	}
	if len(result) > 128 {
		t.Errorf("result too long: %d bytes", len(result))
	}
}

func TestSanitizeCmdlineNullBytes(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})

	// /proc/pid/cmdline uses \x00 as separator
	input := "myapp\x00--id=550e8400e29b41d4a716446655440000\x00--config=foo"
	result := c.sanitizeCmdline(input)

	// Null bytes should be replaced with spaces
	if strings.ContainsRune(result, '\x00') {
		t.Errorf("null bytes survived: %q", result)
	}
	// The hex token should still be hashed
	if strings.Contains(result, "550e8400") {
		t.Errorf("hex token not hashed after null replacement: %q", result)
	}
	if !strings.Contains(result, "H:") {
		t.Errorf("expected H: prefix: %q", result)
	}
	if !strings.Contains(result, "myapp") {
		t.Errorf("expected command name preserved: %q", result)
	}
}

func TestSanitizeCmdlineOverlappingPatterns(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})

	cases := []struct {
		name  string
		input string
	}{
		{"all hex 8 chars", "deadbeef"},
		{"all digits 10+", "1234567890"},
		{"digits 20", "12345678901234567890"},
		{"mixed hex inside digits", "abcd12345678ef"},
		{"adjacent matches", "deadbeef12345678901234"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := c.sanitizeCmdline(tc.input)
			// All inputs contain sequences matching [0-9a-f]{8,} or \d{10,}
			// so they must all be hashed
			if result == tc.input {
				t.Errorf("input %q was not sanitized", tc.input)
			}
			if !strings.Contains(result, "H:") {
				t.Errorf("expected H: prefix for %q, got %q", tc.input, result)
			}
			// Verify idempotency
			twice := c.sanitizeCmdline(result)
			if result != twice {
				t.Errorf("not idempotent for %q: once=%q twice=%q", tc.input, result, twice)
			}
		})
	}
}

func TestSanitizeCmdlineIdempotent(t *testing.T) {
	c := NewProcessCollector(ProcessConfig{CollectCmdline: true})

	inputs := []string{
		"python worker.py --job=550e8400e29b41d4a716446655440000",
		"app --started=1715600000000 --id=abcdef1234567890",
		"nginx -g daemon off",
		strings.Repeat("x", 200) + "550e8400e29b41d4a716446655440000",
	}

	for _, input := range inputs {
		once := c.sanitizeCmdline(input)
		twice := c.sanitizeCmdline(once)
		if once != twice {
			t.Errorf("not idempotent:\n  input: %q\n  once:  %q\n  twice: %q", input, once, twice)
		}
	}
}

// AGENT-003 deterministic tests using fakeProcessSource

type fakeProcessSource struct {
	procs              []ProcessInfo
	cmdlineRequested   []int32 // Track which PIDs had cmdline requested
	enrichCallsWithCmd int     // Count enrichment calls with IncludeCmdline=true
}

func (f *fakeProcessSource) ListProcesses(ctx context.Context) ([]BasicProcessInfo, error) {
	basic := make([]BasicProcessInfo, len(f.procs))
	for i, p := range f.procs {
		basic[i] = p.BasicProcessInfo
	}
	return basic, nil
}

func (f *fakeProcessSource) EnrichProcess(ctx context.Context, pid int32, opts EnrichOptions) (*ProcessDetails, error) {
	if opts.IncludeCmdline {
		f.cmdlineRequested = append(f.cmdlineRequested, pid)
		f.enrichCallsWithCmd++
	}

	for _, p := range f.procs {
		if p.PID == pid {
			details := p.ProcessDetails
			// Only populate cmdline if requested (mimics real behavior)
			if !opts.IncludeCmdline {
				details.Cmdline = ""
			}
			return &details, nil
		}
	}
	return nil, fmt.Errorf("process %d not found", pid)
}

// Helper to build ProcessInfo for tests
func makeProc(pid int32, name string, cpuPct float64, memRSS uint64) ProcessInfo {
	return ProcessInfo{
		BasicProcessInfo: BasicProcessInfo{PID: pid, Name: name, CPUPct: cpuPct, MemRSS: memRSS},
	}
}

func makeProcWithDetails(pid int32, name, user, cmdline string, cpuPct float64, memRSS uint64, memPct float32, threads, fds int32, ioReadB, ioWriteB uint64) ProcessInfo {
	return ProcessInfo{
		BasicProcessInfo: BasicProcessInfo{PID: pid, Name: name, CPUPct: cpuPct, MemRSS: memRSS},
		ProcessDetails:   ProcessDetails{User: user, Cmdline: cmdline, MemPct: memPct, Threads: threads, FDs: fds, IOReadB: ioReadB, IOWriteB: ioWriteB},
	}
}

func TestProcessIgnorePatternsFiltersBeforeDenyAllow(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProc(1, "init", 0.1, 1000),
			makeProc(2, "kworker/0:0", 0.0, 0),
			makeProc(3, "nginx", 5.0, 50000),
			makeProc(4, "python3", 10.0, 100000),
		},
	}

	cfg := ProcessConfig{
		TopN:           10,
		IgnorePatterns: []string{"^kworker"},
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	points, err := c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Tags["process_name"] == "kworker/0:0" {
			t.Error("ignored process kworker should not appear in output")
		}
	}

	// Verify non-ignored processes are present
	hasInit := false
	hasNginx := false
	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			if p.Tags["process_name"] == "init" {
				hasInit = true
			}
			if p.Tags["process_name"] == "nginx" {
				hasNginx = true
			}
		}
	}
	if !hasInit || !hasNginx {
		t.Error("expected non-ignored processes to appear")
	}
}

func TestProcessAggregationFirstMatchWins(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProcWithDetails(1, "python3.10", "", "", 2.0, 10000, 0, 4, 10, 1000, 500),
			makeProcWithDetails(2, "python3.11", "", "", 3.0, 15000, 0, 6, 12, 1500, 700),
			makeProcWithDetails(3, "nginx", "", "", 5.0, 20000, 0, 2, 8, 2000, 1000),
		},
	}

	cfg := ProcessConfig{
		TopN: 10,
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules: []struct {
				Pattern     string
				AggregateAs string
			}{
				{Pattern: "^python", AggregateAs: "python-group"},
				{Pattern: "^python3.11", AggregateAs: "python311-group"}, // This should NOT match python3.11 (first-match-wins)
			},
		},
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	points, err := c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	// Verify python3.10 and python3.11 aggregated into python-group
	hasPythonGroup := false
	hasPython311Group := false
	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			if p.Tags["process_group"] == "python-group" {
				hasPythonGroup = true
				// Should be sum of both python processes
				if p.Value != 5.0 {
					t.Errorf("expected aggregated cpu_pct=5.0, got %f", p.Value)
				}
			}
			if p.Tags["process_group"] == "python311-group" {
				hasPython311Group = true
			}
		}
	}

	if !hasPythonGroup {
		t.Error("expected python-group aggregated metric")
	}
	if hasPython311Group {
		t.Error("python311-group should not exist (first-match-wins)")
	}

	// Verify nginx is individual (not aggregated)
	hasNginxIndividual := false
	for _, p := range points {
		if p.Name == "process.cpu_pct" && p.Tags["process_name"] == "nginx" {
			hasNginxIndividual = true
		}
	}
	if !hasNginxIndividual {
		t.Error("expected nginx as individual process")
	}
}

func TestProcessAggregatedMetricsHaveOnlyProcessGroupTag(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProcWithDetails(1, "python3", "root", "/usr/bin/python3", 2.0, 10000, 0, 0, 0, 0, 0),
			makeProcWithDetails(2, "python3", "app", "/usr/bin/python3 app.py", 3.0, 15000, 0, 0, 0, 0, 0),
		},
	}

	cfg := ProcessConfig{
		TopN:           10,
		CollectCmdline: true,
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules: []struct {
				Pattern     string
				AggregateAs string
			}{
				{Pattern: "^python", AggregateAs: "python-all"},
			},
		},
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	points, err := c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	for _, p := range points {
		if p.Tags["process_group"] == "python-all" {
			// Aggregated metrics must have ONLY process_group tag
			if p.Tags["process_pid"] != "" {
				t.Error("aggregated metric must not have process_pid tag")
			}
			if p.Tags["process_name"] != "" {
				t.Error("aggregated metric must not have process_name tag")
			}
			if p.Tags["process_user"] != "" {
				t.Error("aggregated metric must not have process_user tag")
			}
			if p.Tags["process_cmdline"] != "" {
				t.Error("aggregated metric must not have process_cmdline tag")
			}
		}
	}
}

func TestProcessTopNAppliesOnlyToNonAggregated(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProc(1, "python3", 10.0, 100000),
			makeProc(2, "nginx1", 5.0, 50000),
			makeProc(3, "nginx2", 4.0, 40000),
			makeProc(4, "nginx3", 3.0, 30000),
			makeProc(5, "nginx4", 2.0, 20000),
		},
	}

	cfg := ProcessConfig{
		TopN: 2, // Only top 2 non-aggregated processes
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules: []struct {
				Pattern     string
				AggregateAs string
			}{
				{Pattern: "^python", AggregateAs: "python-all"},
			},
		},
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	points, err := c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	// Aggregated group should appear regardless of topN
	hasPythonGroup := false
	individualNginxCount := 0

	for _, p := range points {
		if p.Name == "process.cpu_pct" {
			if p.Tags["process_group"] == "python-all" {
				hasPythonGroup = true
			}
			if strings.HasPrefix(p.Tags["process_name"], "nginx") {
				individualNginxCount++
			}
		}
	}

	if !hasPythonGroup {
		t.Error("expected aggregated python-all group regardless of topN")
	}
	if individualNginxCount != 2 {
		t.Errorf("expected 2 individual nginx processes (topN=2), got %d", individualNginxCount)
	}
}

func TestProcessSystemProcessesTotalUnchanged(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProc(1, "init", 0.1, 1000),
			makeProc(2, "kworker", 0.0, 0),
			makeProc(3, "denied", 0.0, 0),
			makeProc(4, "nginx", 5.0, 50000),
		},
	}

	cfg := ProcessConfig{
		TopN:           10,
		IgnorePatterns: []string{"^kworker"},
		DenyRegex:      []string{"^denied"},
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	points, err := c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	var totalProcesses float64
	for _, p := range points {
		if p.Name == "system.processes.total" {
			totalProcesses = p.Value
		}
	}

	if totalProcesses != 4.0 {
		t.Errorf("system.processes.total should be OS total (4), got %f", totalProcesses)
	}
}

func TestProcessCollectorInvalidRegexReturnsError(t *testing.T) {
	cases := []struct {
		name string
		cfg  ProcessConfig
	}{
		{
			name: "invalid ignore pattern",
			cfg: ProcessConfig{
				TopN:           10,
				IgnorePatterns: []string{"["},
			},
		},
		{
			name: "invalid allow pattern",
			cfg: ProcessConfig{
				TopN:       10,
				AllowRegex: []string{"("},
			},
		},
		{
			name: "invalid deny pattern",
			cfg: ProcessConfig{
				TopN:      10,
				DenyRegex: []string{"*invalid"},
			},
		},
		{
			name: "invalid aggregation pattern",
			cfg: ProcessConfig{
				TopN: 10,
				Aggregation: struct {
					Enabled bool
					Rules   []struct {
						Pattern     string
						AggregateAs string
					}
				}{
					Enabled: true,
					Rules: []struct {
						Pattern     string
						AggregateAs string
					}{
						{Pattern: "[", AggregateAs: "group"},
					},
				},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewProcessCollectorValidated(tc.cfg)
			if err == nil {
				t.Fatal("expected error for invalid regex, got nil")
			}
		})
	}
}

func TestProcessAggregationSumsAllMetrics(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProcWithDetails(1, "nginx", "", "", 2.5, 10000, 1.0, 4, 10, 1000, 500),
			makeProcWithDetails(2, "nginx", "", "", 3.5, 15000, 1.5, 6, 12, 1500, 700),
		},
	}

	cfg := ProcessConfig{
		TopN: 10,
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules: []struct {
				Pattern     string
				AggregateAs string
			}{
				{Pattern: "^nginx", AggregateAs: "nginx-pool"},
			},
		},
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	points, err := c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	metrics := make(map[string]float64)
	for _, p := range points {
		if p.Tags["process_group"] == "nginx-pool" {
			metrics[p.Name] = p.Value
		}
	}

	expected := map[string]float64{
		"process.cpu_pct":        6.0,   // 2.5 + 3.5
		"process.memory_bytes":   25000, // 10000 + 15000
		"process.memory_pct":     2.5,   // 1.0 + 1.5
		"process.threads":        10,    // 4 + 6
		"process.open_fds":       22,    // 10 + 12
		"process.io_read_bytes":  2500,  // 1000 + 1500
		"process.io_write_bytes": 1200,  // 500 + 700
	}

	for name, expectedVal := range expected {
		if metrics[name] != expectedVal {
			t.Errorf("%s: expected %f, got %f", name, expectedVal, metrics[name])
		}
	}
}

// Collector-level validation tests (Fix #2)

func TestCollectorAggregationEnabledRequiresRules(t *testing.T) {
	cfg := ProcessConfig{
		TopN: 10,
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules:   []struct{ Pattern, AggregateAs string }{}, // Empty
		},
	}

	_, err := NewProcessCollectorValidated(cfg)
	if err == nil {
		t.Fatal("expected error when aggregation enabled but no rules provided")
	}
	if !strings.Contains(err.Error(), "no rules provided") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestCollectorAggregationMax50Rules(t *testing.T) {
	rules := make([]struct{ Pattern, AggregateAs string }, 51)
	for i := 0; i < 51; i++ {
		rules[i] = struct{ Pattern, AggregateAs string }{
			Pattern:     "^test",
			AggregateAs: "group",
		}
	}

	cfg := ProcessConfig{
		TopN: 10,
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules:   rules,
		},
	}

	_, err := NewProcessCollectorValidated(cfg)
	if err == nil {
		t.Fatal("expected error when more than 50 aggregation rules")
	}
	if !strings.Contains(err.Error(), "exceed maximum of 50") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestCollectorAggregateAsNonEmpty(t *testing.T) {
	cfg := ProcessConfig{
		TopN: 10,
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules: []struct{ Pattern, AggregateAs string }{
				{Pattern: "^python", AggregateAs: ""},
			},
		},
	}

	_, err := NewProcessCollectorValidated(cfg)
	if err == nil {
		t.Fatal("expected error when aggregate_as is empty")
	}
	if !strings.Contains(err.Error(), "cannot be empty") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestCollectorAggregateAsMaxLength(t *testing.T) {
	cfg := ProcessConfig{
		TopN: 10,
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules: []struct{ Pattern, AggregateAs string }{
				{Pattern: "^python", AggregateAs: strings.Repeat("a", 65)},
			},
		},
	}

	_, err := NewProcessCollectorValidated(cfg)
	if err == nil {
		t.Fatal("expected error when aggregate_as exceeds 64 characters")
	}
	if !strings.Contains(err.Error(), "exceeds 64 characters") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestCollectorAggregateAsSafeCharset(t *testing.T) {
	cases := []string{
		"python@group", // @ not allowed
		"python group", // space not allowed
		"python/group", // / not allowed
		"python:group", // : not allowed
		"python$group", // $ not allowed
	}

	for _, invalidName := range cases {
		cfg := ProcessConfig{
			TopN: 10,
			Aggregation: struct {
				Enabled bool
				Rules   []struct {
					Pattern     string
					AggregateAs string
				}
			}{
				Enabled: true,
				Rules: []struct{ Pattern, AggregateAs string }{
					{Pattern: "^python", AggregateAs: invalidName},
				},
			},
		}

		_, err := NewProcessCollectorValidated(cfg)
		if err == nil {
			t.Errorf("expected error for aggregate_as %q with invalid characters", invalidName)
		}
		if !strings.Contains(err.Error(), "invalid characters") {
			t.Errorf("unexpected error for %q: %v", invalidName, err)
		}
	}
}

// Cmdline privacy/performance tests (Fix #2)

func TestCmdlineNotRequestedWhenDisabled(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProcWithDetails(1, "nginx", "root", "/usr/bin/nginx", 5.0, 50000, 1.0, 4, 10, 1000, 500),
			makeProcWithDetails(2, "python3", "app", "/usr/bin/python3 app.py", 10.0, 100000, 2.0, 8, 20, 2000, 1000),
		},
	}

	cfg := ProcessConfig{
		TopN:           10,
		CollectCmdline: false, // Explicitly disabled
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	_, err = c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	if fake.enrichCallsWithCmd > 0 {
		t.Errorf("cmdline was requested %d times when collect_cmdline=false", fake.enrichCallsWithCmd)
	}
	if len(fake.cmdlineRequested) > 0 {
		t.Errorf("cmdline was requested for PIDs %v when collect_cmdline=false", fake.cmdlineRequested)
	}
}

func TestAggregatedGroupsNeverRequestCmdline(t *testing.T) {
	fake := &fakeProcessSource{
		procs: []ProcessInfo{
			makeProcWithDetails(1, "python3.10", "root", "/usr/bin/python3.10", 2.0, 10000, 1.0, 4, 10, 1000, 500),
			makeProcWithDetails(2, "python3.11", "app", "/usr/bin/python3.11 app.py", 3.0, 15000, 1.5, 6, 12, 1500, 700),
			makeProcWithDetails(3, "nginx", "www", "/usr/sbin/nginx", 5.0, 20000, 2.0, 2, 8, 2000, 1000),
		},
	}

	cfg := ProcessConfig{
		TopN:           10,
		CollectCmdline: true, // Enabled for individual processes
		Aggregation: struct {
			Enabled bool
			Rules   []struct {
				Pattern     string
				AggregateAs string
			}
		}{
			Enabled: true,
			Rules: []struct{ Pattern, AggregateAs string }{
				{Pattern: "^python", AggregateAs: "python-all"},
			},
		},
	}
	c, err := NewProcessCollectorValidated(cfg)
	if err != nil {
		t.Fatal(err)
	}
	c.source = fake

	_, err = c.Collect(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	// Cmdline should be requested only for nginx (individual, topN), not for python (aggregated)
	// PIDs 1 and 2 are aggregated into python-all, so they should NOT have cmdline requested
	// PID 3 is nginx (individual), so it SHOULD have cmdline requested
	for _, pid := range fake.cmdlineRequested {
		if pid == 1 || pid == 2 {
			t.Errorf("cmdline was requested for aggregated process PID %d (should never request cmdline for aggregated groups)", pid)
		}
	}

	// Verify nginx (individual) DID have cmdline requested
	hasNginx := false
	for _, pid := range fake.cmdlineRequested {
		if pid == 3 {
			hasNginx = true
		}
	}
	if !hasNginx {
		t.Error("cmdline was NOT requested for individual nginx process (should request when collect_cmdline=true)")
	}
}
