package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"os"
	"os/signal"
	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/buffer"
	"github.com/neoguard/neo-metrics-exporter/internal/collector"
	"github.com/neoguard/neo-metrics-exporter/internal/collector/logtail"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/healthz"
	"github.com/neoguard/neo-metrics-exporter/internal/identity"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/transport"
)

// ErrStrictClockSkew is returned when strict clock check fails.
// The agent must exit with code 78 (EX_CONFIG) when this error is returned.
var ErrStrictClockSkew = errors.New("clock skew exceeds strict threshold")

type Agent struct {
	cfg         *config.Config
	cfgPath     string
	resolver    *identity.Resolver
	buf         *buffer.DiskBuffer
	client      *transport.Client
	lifecycle   *transport.LifecycleClient
	deadLetter  *transport.DeadLetterWriter
	version     string
	stats       *collector.AgentStats
	health      *healthz.Server
	metricStore *healthz.MetricStore
	clockGuard  *ClockGuard
	supervisor  *SupervisorRegistry
	memGuard    *MemoryGuard
	transmitter *Transmitter
	tailers     []*logtail.Tailer

	// Log pipeline (Option A1) — initialized only when cfg.Logs.Enabled
	logStats     *collector.LogStats
	logRing      *buffer.LogRing
	logSpool     *buffer.LogSpool
	logDeadLetter *buffer.LogDeadLetterWriter
	logClient    *transport.LogClient
	logCollector *collector.LogCollector
	logShipper   *collector.LogShipper
}

func New(cfg *config.Config, version, cfgPath string) (*Agent, error) {
	skipCloud := cfg.CloudDetection == "skip"
	stats := &collector.AgentStats{}
	collector.SetDefaultMaxElapsed(cfg.RateMaxElapsed())
	buf := buffer.NewDiskBuffer(cfg.Buffer.MemoryMaxItems, cfg.Buffer.WALDir)
	replayBatches := buf.Stats().Batches
	if replayBatches > 0 {
		buf.SetReplayCount(replayBatches)
	}

	timeout := time.Duration(cfg.Transport.RequestTimeoutSeconds) * time.Second

	client, err := transport.NewClient(cfg.Endpoint, cfg.APIKey, timeout, version, cfg.CABundlePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create transport client: %w", err)
	}

	lifecycle, err := transport.NewLifecycleClient(cfg.Endpoint, cfg.APIKey, timeout, cfg.CABundlePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create lifecycle client: %w", err)
	}

	a := &Agent{
		cfg:        cfg,
		cfgPath:    cfgPath,
		resolver:   identity.NewResolverWithStateDir(skipCloud, cfg.StateDir),
		buf:        buf,
		client:     client,
		lifecycle:  lifecycle,
		deadLetter: transport.NewDeadLetterWriter(cfg.Transport.DeadLetter, "", version),
		version:    version,
		stats:      stats,
		clockGuard: NewClockGuard(),
		supervisor: NewSupervisorRegistry(time.Now),
	}
	a.memGuard = NewMemoryGuard(MemoryGuardConfig{
		SoftLimitBytes: uint64(cfg.Memory.SoftLimitMB) * 1024 * 1024,
		HardLimitBytes: uint64(cfg.Memory.HardLimitMB) * 1024 * 1024,
		CheckInterval:  time.Duration(cfg.Memory.CheckIntervalSeconds) * time.Second,
	}, time.Now)
	a.memGuard.SetWALFlusher(a.buf.FlushWAL)
	a.memGuard.SetBufferDropper(a.buf.DropHalf)

	a.transmitter = NewTransmitter(TransmitterConfig{
		BatchMaxSize:            cfg.Transport.BatchMaxSize,
		BatchMaxIntervalSeconds: cfg.Transport.BatchMaxIntervalSeconds,
		ReplayRateBPS:           cfg.Transport.ReplayRateBPS,
		StartupJitterSeconds:    cfg.Transport.StartupJitterSeconds,
		MaxReenqueueCycles:      maxReenqueueCycles,
		Backpressure: BackpressureConfig{
			Enabled:       cfg.Transport.Backpressure.Enabled,
			WindowSeconds: cfg.Transport.Backpressure.WindowSeconds,
			MinSendRate:   cfg.Transport.Backpressure.MinSendRate,
			MaxReplayBPS:  cfg.Transport.Backpressure.MaxReplayBPS,
		},
	}, a.buf, a.client, a.deadLetter, stats, time.Now)

	if cfg.Health.Enabled {
		if cfg.HealthBindDeprecated() {
			slog.Warn("health.port is deprecated, use health.bind instead — port will be removed in v2")
		}
		a.health = healthz.New(cfg.Health.Bind, stats, version)
		a.metricStore = healthz.NewMetricStore()
		a.health.SetMetricStore(a.metricStore)
	}

	if cfg.Logs.Enabled && len(cfg.Logs.Sources) > 0 {
		if err := a.initLogPipeline(cfg, version); err != nil {
			return nil, fmt.Errorf("log pipeline init: %w", err)
		}
	}

	return a, nil
}

func setupLogging(cfg *config.Config) {
	var level slog.Level
	switch cfg.Logging.Level {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{Level: level}
	var handler slog.Handler
	if cfg.Logging.Format == "json" {
		handler = slog.NewJSONHandler(os.Stderr, opts)
	} else {
		handler = slog.NewTextHandler(os.Stderr, opts)
	}
	slog.SetDefault(slog.New(handler))
}

func (a *Agent) Run(ctx context.Context) error {
	setupLogging(a.cfg)

	ctx, cancel := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	id, err := a.resolver.Resolve(ctx)
	if err != nil {
		return fmt.Errorf("identity resolution: %w", err)
	}

	baseTags := id.Tags()
	baseTags["agent_version"] = a.version
	for k, v := range a.cfg.ExtraTags {
		baseTags[k] = v
	}

	slog.Info("agent starting",
		"hostname", id.Hostname,
		"cloud_provider", id.CloudProvider,
		"instance_id", id.InstanceID,
		"interval_seconds", a.cfg.Collection.IntervalSeconds,
	)

	// Build collectors first, before registration
	rawCollectors, err := a.buildCollectors()
	if err != nil {
		return fmt.Errorf("failed to build collectors: %w", err)
	}
	rawComposites := a.buildCompositeCollectors()
	rawSlowCollectors := a.buildSlowCollectors()

	// Extract collector names for registration capabilities
	enabledCollectors := make([]string, 0, len(rawCollectors))
	for _, c := range rawCollectors {
		enabledCollectors = append(enabledCollectors, c.Name())
	}

	// Register with backend using collector names
	regResp, err := a.register(ctx, id, enabledCollectors)
	if err != nil {
		return fmt.Errorf("lifecycle registration failed: %w", err)
	}

	// Capture clock skew from Date header
	a.clockGuard.SetClockSkew(regResp.ClockSkew)

	// Enforce strict clock check if configured
	if err := a.clockGuard.CheckStrictSkew(a.cfg.Clock.StrictClockCheck); err != nil {
		slog.Error("strict_clock_check_failed", "error", err)
		return fmt.Errorf("%w: %v", ErrStrictClockSkew, err)
	}

	heartbeatInterval := time.Duration(regResp.HeartbeatIntervalSecs) * time.Second
	slog.Info("registered with backend",
		"heartbeat_interval", heartbeatInterval,
		"schema_version", regResp.NegotiatedSchemaVersion,
		"first_registration", regResp.FirstRegistration,
	)

	a.startDebugSignalHandler()
	a.startReloadHandler()

	if a.health != nil {
		a.health.SetCollectorHealth(a.supervisor)
		if err := a.health.Start(); err != nil {
			slog.Warn("health server failed to start", "error", err)
		}
	}

	// Wrap collectors with supervisor
	collectors := make([]collector.Collector, len(rawCollectors))
	for i, c := range rawCollectors {
		collectors[i] = a.supervisor.WrapCollector(c)
	}
	composites := make([]collector.CompositeCollector, len(rawComposites))
	for i, c := range rawComposites {
		composites[i] = a.supervisor.WrapComposite(c)
	}
	slowCollectors := make([]collector.Collector, len(rawSlowCollectors))
	for i, c := range rawSlowCollectors {
		slowCollectors[i] = a.supervisor.WrapCollector(c)
	}

	var collectWg sync.WaitGroup
	var transmitWg sync.WaitGroup

	collectWg.Add(1)
	go func() {
		defer collectWg.Done()
		a.runCollectors(ctx, collectors, composites, baseTags, time.Duration(a.cfg.Collection.IntervalSeconds)*time.Second)
	}()

	if len(slowCollectors) > 0 {
		collectWg.Add(1)
		go func() {
			defer collectWg.Done()
			a.runCollectors(ctx, slowCollectors, nil, baseTags, time.Duration(a.cfg.Collection.SlowIntervalSeconds)*time.Second)
		}()
	}

	transmitWg.Add(1)
	go func() {
		defer transmitWg.Done()
		a.transmitter.Run(ctx)
	}()

	go a.memGuard.Run(ctx)
	go a.runHeartbeat(ctx, id.AgentID, heartbeatInterval)

	var logCollectorWg sync.WaitGroup
	var logShipperWg sync.WaitGroup
	logDrainDone := make(chan struct{})
	if a.cfg.Logs.Enabled && a.logRing != nil {
		if err := a.startLogPipeline(ctx, id, &logCollectorWg, &logShipperWg, logDrainDone); err != nil {
			return fmt.Errorf("log pipeline start: %w", err)
		}
	}

	if a.health != nil {
		a.health.SetReady(true)
	}

	<-ctx.Done()
	slog.Info("shutting down, waiting for in-flight collections")

	a.sendStopping(id.AgentID, "SIGTERM")

	if a.health != nil {
		a.health.SetReady(false)
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		a.health.Shutdown(shutCtx)
		shutCancel()
	}

	collectWg.Wait()
	transmitWg.Wait()

	// Log pipeline shutdown ordering (prevents data loss):
	// 1. Stop tailers: run() exits, closes Lines() channels, saves checkpoints
	// 2. Wait for collectors: drain remaining buffered lines into ring
	// 3. Signal shipper: drainDone tells shipper all lines are in ring
	// 4. Wait for shipper: final flushRing + shutdownSend (bounded 10s)
	a.stopLogTailers()
	logCollectorWg.Wait()
	close(logDrainDone)
	logShipperWg.Wait()

	slog.Info("flushing remaining buffer")
	a.flushRemaining()
	a.buf.Close()

	slog.Info("agent stopped")
	return nil
}

func (a *Agent) buildCollectors() ([]collector.Collector, error) {
	var cs []collector.Collector

	if !a.cfg.IsCollectorDisabled("cpu") {
		cs = append(cs, collector.NewCPUCollector(a.cfg.CPU))
	}
	if !a.cfg.IsCollectorDisabled("memory") {
		cs = append(cs, collector.NewMemoryCollector())
	}
	if !a.cfg.IsCollectorDisabled("disk") {
		cs = append(cs, collector.NewDiskCollector(a.cfg.Disk.ExcludeMounts, a.cfg.Disk.ExcludeFSTypes))
	}
	if !a.cfg.IsCollectorDisabled("diskio") {
		cs = append(cs, collector.NewDiskIOCollector())
	}
	if !a.cfg.IsCollectorDisabled("network") {
		cs = append(cs, collector.NewNetworkCollector(a.cfg.Network.ExcludeInterfaces))
	}
	if !a.cfg.IsCollectorDisabled("system") {
		cs = append(cs, collector.NewSystemCollector())
	}
	if !a.cfg.IsCollectorDisabled("netstat") {
		cs = append(cs, collector.NewNetstatCollector())
	}
	if !a.cfg.IsCollectorDisabled("process") {
		// Map config types to collector types
		collectorRules := make([]struct {
			Pattern     string
			AggregateAs string
		}, len(a.cfg.Process.Aggregation.Rules))
		for i, rule := range a.cfg.Process.Aggregation.Rules {
			collectorRules[i] = struct {
				Pattern     string
				AggregateAs string
			}{
				Pattern:     rule.Pattern,
				AggregateAs: rule.AggregateAs,
			}
		}

		procCollector, err := collector.NewProcessCollectorValidated(collector.ProcessConfig{
			TopN:           a.cfg.Process.TopN,
			AllowRegex:     a.cfg.Process.AllowRegex,
			DenyRegex:      a.cfg.Process.DenyRegex,
			CollectCmdline: a.cfg.Process.CollectCmdline,
			IgnorePatterns: a.cfg.Process.IgnorePatterns,
			Aggregation: struct {
				Enabled bool
				Rules   []struct {
					Pattern     string
					AggregateAs string
				}
			}{
				Enabled: a.cfg.Process.Aggregation.Enabled,
				Rules:   collectorRules,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("process collector validation failed: %w", err)
		}
		cs = append(cs, procCollector)
	}

	if !a.cfg.IsCollectorDisabled("portmap") {
		cs = append(cs, collector.NewPortMapCollector())
	}
	if !a.cfg.IsCollectorDisabled("container") {
		cs = append(cs, collector.NewContainerCollector())
	}
	if !a.cfg.IsCollectorDisabled("filewatch") && len(a.cfg.FileWatch.Paths) > 0 {
		cs = append(cs, collector.NewFileWatchCollector(a.cfg.FileWatch))
	}

	cs = append(cs, collector.PlatformCollectors(a.cfg.IsCollectorDisabled)...)

	cs = append(cs, collector.NewAgentSelfCollector(a.stats, a.buf, a.deadLetter))

	return cs, nil
}

func (a *Agent) buildCompositeCollectors() []collector.CompositeCollector {
	var cs []collector.CompositeCollector

	if !a.cfg.IsCollectorDisabled("healthscore") {
		cs = append(cs, collector.NewHealthScoreCollector())
	}
	if !a.cfg.IsCollectorDisabled("saturation") {
		cs = append(cs, collector.NewSaturationCollector(a.cfg.Saturation.WindowSize))
	}
	if !a.cfg.IsCollectorDisabled("correlation") {
		cs = append(cs, collector.NewProcessCorrelationCollector())
	}

	return cs
}

func (a *Agent) buildSlowCollectors() []collector.Collector {
	var cs []collector.Collector

	if !a.cfg.IsCollectorDisabled("sensors") {
		cs = append(cs, collector.NewSensorsCollector())
	}

	cs = append(cs, collector.PlatformSlowCollectors(a.cfg.IsCollectorDisabled)...)

	return cs
}

func (a *Agent) runCollectors(ctx context.Context, collectors []collector.Collector, composites []collector.CompositeCollector, baseTags map[string]string, interval time.Duration) {
	jitter := time.Duration(rand.Int64N(int64(interval) / 4))
	slog.Debug("collection jitter", "delay", jitter)
	select {
	case <-ctx.Done():
		return
	case <-time.After(jitter):
	}

	a.warmUpCollectors(ctx, collectors, baseTags)

	a.collectOnce(ctx, collectors, composites, baseTags)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.collectOnce(ctx, collectors, composites, baseTags)
		}
	}
}

func (a *Agent) warmUpCollectors(ctx context.Context, collectors []collector.Collector, baseTags map[string]string) {
	a.supervisor.SetWarmUp(true)
	defer a.supervisor.SetWarmUp(false)

	warmCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	for _, c := range collectors {
		if warmCtx.Err() != nil {
			break
		}
		cCtx, cCancel := context.WithTimeout(warmCtx, 5*time.Second)
		_, _ = c.Collect(cCtx, baseTags)
		cCancel()
	}
	slog.Debug("warm-up complete", "collectors", len(collectors))
}

func (a *Agent) collectOnce(ctx context.Context, collectors []collector.Collector, composites []collector.CompositeCollector, baseTags map[string]string) {
	start := time.Now()
	timeout := a.cfg.CollectorTimeout()
	var allPoints []model.MetricPoint

	for _, c := range collectors {
		cCtx, cCancel := context.WithTimeout(ctx, timeout)
		points, err := c.Collect(cCtx, baseTags)
		cCancel()
		if err != nil {
			slog.Error("collector failed", "collector", c.Name(), "error", err)
			continue
		}
		allPoints = append(allPoints, points...)
	}

	for _, cc := range composites {
		cCtx, cCancel := context.WithTimeout(ctx, timeout)
		points, err := cc.CollectComposite(cCtx, baseTags, allPoints)
		cCancel()
		if err != nil {
			slog.Error("composite collector failed", "collector", cc.Name(), "error", err)
			continue
		}
		allPoints = append(allPoints, points...)
	}

	elapsed := time.Since(start)
	a.stats.CollectionDurationMs.Store(elapsed.Milliseconds())
	a.stats.PointsCollected.Store(int64(len(allPoints)))

	allPoints = append(allPoints, a.clockMetrics(baseTags)...)
	allPoints = append(allPoints, a.supervisor.Metrics(baseTags)...)
	allPoints = append(allPoints, a.memGuard.Metrics(baseTags)...)
	allPoints = append(allPoints, a.transmitter.Metrics(baseTags)...)
	if a.logStats != nil {
		allPoints = append(allPoints, a.logStats.Collect(baseTags)...)
	}

	if len(allPoints) > 0 {
		a.clockGuard.FloorTimestamps(allPoints)
		a.buf.Push(allPoints)
		if a.metricStore != nil {
			a.metricStore.Update(allPoints)
		}
		slog.Debug("collected metrics", "count", len(allPoints), "duration_ms", elapsed.Milliseconds())
	}

	bufStats := a.buf.Stats()
	a.stats.BufferSize.Store(int64(bufStats.Items))
	a.stats.BufferDropped.Store(bufStats.Dropped)
}

func (a *Agent) clockMetrics(baseTags map[string]string) []model.MetricPoint {
	return []model.MetricPoint{
		model.NewGauge("agent.clock_skew_seconds", a.clockGuard.ClockSkew(), baseTags),
		model.NewCounter("agent.clock.forward_jumps_total", float64(collector.GlobalForwardJumps.Load()), baseTags),
		model.NewCounter("agent.clock.backward_jumps_total", float64(a.clockGuard.BackwardJumps.Load()), baseTags),
	}
}

const (
	maxServerBatchSize = 10000
	maxReenqueueCycles = 3
)

func (a *Agent) flushRemaining() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	drainSize := a.cfg.Transport.BatchMaxSize
	if drainSize > maxServerBatchSize {
		drainSize = maxServerBatchSize
	}

	for {
		points := a.buf.Drain(drainSize)
		if len(points) == 0 {
			break
		}

		slog.Info("flushing remaining", "points", len(points))

		var sent bool
		var lastErr error
		for attempt := 0; attempt < 3; attempt++ {
			if ctx.Err() != nil {
				lastErr = ctx.Err()
				break
			}
			if err := a.client.Send(ctx, points); err != nil {
				lastErr = err
				slog.Warn("flush attempt failed", "attempt", attempt+1, "error", err)
				wait := time.Duration(1<<uint(attempt)) * time.Second
				select {
				case <-ctx.Done():
					lastErr = ctx.Err()
					break
				case <-time.After(wait):
				}
				continue
			}
			sent = true
			break
		}
		if !sent {
			slog.Error("flush failed, dead-lettering", "points", len(points))
			errMsg := "shutdown flush exhausted"
			if lastErr != nil {
				errMsg = lastErr.Error()
			}
			if dlErr := a.deadLetter.Write(points, 0, transport.ReasonShutdownUndelivered, errMsg); dlErr != nil {
				slog.Error("dead-letter write failed on shutdown, data lost",
					"error", dlErr,
					"points_lost", len(points),
				)
			}
			return
		}
	}
}

func (a *Agent) Diagnose() {
	id, err := a.resolver.Resolve(context.Background())
	if err != nil {
		fmt.Fprintf(os.Stderr, "identity: %v\n", err)
	}

	fmt.Println("=== NeoGuard Agent Diagnostics ===")
	fmt.Printf("Version:    %s\n", a.version)
	fmt.Printf("Platform:   %s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Printf("Endpoint:   %s\n", a.cfg.Endpoint)
	fmt.Printf("API Key:    %s\n", a.cfg.RedactedAPIKey())
	fmt.Printf("Cloud:      %s\n", a.cfg.CloudDetection)
	fmt.Printf("Interval:   %ds\n", a.cfg.Collection.IntervalSeconds)
	fmt.Printf("Slow Int:   %ds\n", a.cfg.Collection.SlowIntervalSeconds)

	if id != nil {
		fmt.Printf("Provider:   %s\n", id.CloudProvider)
		fmt.Printf("Instance:   %s\n", id.InstanceID)
		fmt.Printf("Region:     %s\n", id.Region)
		fmt.Printf("Hostname:   %s\n", id.Hostname)
	}

	stats := a.buf.Stats()
	fmt.Printf("Buffer:     %d items, %d batches, %d dropped\n", stats.Items, stats.Batches, stats.Dropped)

	collectors, err := a.buildCollectors()
	if err != nil {
		fmt.Printf("ERROR building collectors: %v\n", err)
		return
	}
	composites := a.buildCompositeCollectors()
	slow := a.buildSlowCollectors()
	fmt.Printf("Collectors: %d normal, %d composite, %d slow\n", len(collectors), len(composites), len(slow))
	for _, c := range collectors {
		fmt.Printf("  [normal]    %s\n", c.Name())
	}
	for _, c := range composites {
		fmt.Printf("  [composite] %s\n", c.Name())
	}
	for _, c := range slow {
		fmt.Printf("  [slow]      %s\n", c.Name())
	}

	disabled := a.cfg.Collectors.Disabled
	if len(disabled) > 0 {
		fmt.Printf("Disabled:   %v\n", disabled)
	}
}

func (a *Agent) TestConnection() error {
	testPoints := []model.MetricPoint{
		model.NewGauge("agent.test_connection", 1, map[string]string{
			"hostname":      "test",
			"agent_version": a.version,
		}),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	return a.client.Send(ctx, testPoints)
}

func (a *Agent) register(ctx context.Context, id *identity.Identity, enabledCollectors []string) (*transport.RegisterResponse, error) {
	req := &transport.RegisterRequest{
		AgentIDExternal: id.AgentID,
		Hostname:        id.Hostname,
		ResourceID:      id.InstanceID,
		OS:              id.OS,
		Arch:            runtime.GOARCH,
		AgentVersion:    a.version,
		Capabilities: map[string]any{
			"metrics":           true,
			"logs":              a.cfg.Logs.Enabled && len(a.cfg.Logs.Sources) > 0,
			"schema_versions":   []int{1},
			"compression":       []string{"gzip"},
			"max_payload_bytes": 5242880,
			"collectors":        enabledCollectors,
		},
		ConfigHash:              a.configHash(),
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	}

	return a.lifecycle.RegisterWithRetry(ctx, req, 5)
}

func (a *Agent) runHeartbeat(ctx context.Context, agentID string, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.sendHeartbeat(ctx, agentID)
		}
	}
}

func (a *Agent) sendHeartbeat(ctx context.Context, agentID string) {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	heap := int64(memStats.HeapInuse)
	goroutines := runtime.NumGoroutine()
	collected := a.stats.PointsCollected.Load()
	sent := a.stats.PointsSent.Load()
	sendErrors := a.stats.SendErrors.Load()
	bufSize := a.stats.BufferSize.Load()
	healthPct := a.supervisor.HealthyPercent()

	req := &transport.HeartbeatRequest{
		AgentIDExternal:     agentID,
		Status:              a.memGuard.State().String(),
		HeapInuseBytes:      &heap,
		Goroutines:          &goroutines,
		PointsCollected:     &collected,
		PointsSent:          &sent,
		SendErrors:          &sendErrors,
		BufferSize:          &bufSize,
		CollectorHealthyPct: &healthPct,
	}

	hbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := a.lifecycle.Heartbeat(hbCtx, req); err != nil {
		slog.Warn("heartbeat failed", "error", err)
	}
}

func (a *Agent) sendStopping(agentID, reason string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := a.lifecycle.Stopping(ctx, &transport.StoppingRequest{
		AgentIDExternal: agentID,
		Reason:          reason,
	}); err != nil {
		slog.Warn("stopping notification failed (best effort)", "error", err)
	}
}

func (a *Agent) initLogPipeline(cfg *config.Config, version string) error {
	// Validate parser configs eagerly — fail fast on invalid regex patterns
	for _, src := range cfg.Logs.Sources {
		if _, err := logtail.NewParser(src.Parser.Mode, src.Parser.Pattern, ""); err != nil {
			return fmt.Errorf("log source %q parser: %w", src.Path, err)
		}
	}

	spoolDir := cfg.StateDir + "/logs-spool"
	dlDir := cfg.StateDir + "/logs-dead-letter"
	cursorsDir := cfg.StateDir + "/log_cursors"

	for _, dir := range []string{spoolDir, dlDir, cursorsDir} {
		if err := os.MkdirAll(dir, 0750); err != nil {
			return fmt.Errorf("create %s: %w", dir, err)
		}
	}

	a.logStats = collector.NewLogStats()
	a.logRing = buffer.NewLogRing(10000, 1000, 1024*1024)

	var err error
	a.logSpool, err = buffer.NewLogSpool(spoolDir, cfg.Logs.Spool)
	if err != nil {
		return fmt.Errorf("log spool: %w", err)
	}

	a.logDeadLetter, err = buffer.NewLogDeadLetterWriter(dlDir)
	if err != nil {
		return fmt.Errorf("log dead-letter: %w", err)
	}

	a.logClient, err = transport.NewLogClient(cfg.Endpoint, cfg.APIKey, version, cfg.CABundlePath)
	if err != nil {
		return fmt.Errorf("log client: %w", err)
	}

	return nil
}

func (a *Agent) startLogPipeline(ctx context.Context, id *identity.Identity, collectorWg, shipperWg *sync.WaitGroup, drainDone <-chan struct{}) error {
	var err error
	redactionEnabled := a.cfg.Logs.Redaction.Enabled == nil || *a.cfg.Logs.Redaction.Enabled
	a.logCollector, err = collector.NewLogCollector(id, a.version, a.logRing, a.cfg.Logs.Sources, redactionEnabled, a.logStats)
	if err != nil {
		return fmt.Errorf("log collector: %w", err)
	}
	a.logShipper = collector.NewLogShipper(id, a.version, a.logRing, a.logSpool, a.logDeadLetter, a.logClient, a.logStats)

	for _, source := range a.cfg.Logs.Sources {
		t := logtail.NewTailer(source.Path, &logtail.TailerOptions{
			StateDir:        a.cfg.StateDir + "/log_cursors",
			StartPosition:   source.StartPosition,
			Service:         source.Service,
			PressureChecker: a.logSpool,
		})
		t.Start()
		a.tailers = append(a.tailers, t)
		slog.Info("log tailer started", "path", source.Path, "service", source.Service)
	}

	a.logCollector.Run(ctx, a.tailers, collectorWg)

	shipperWg.Add(1)
	go func() {
		defer shipperWg.Done()
		a.logShipper.Run(ctx, drainDone)
	}()

	slog.Info("log pipeline started", "sources", len(a.cfg.Logs.Sources))
	return nil
}

func (a *Agent) stopLogTailers() {
	for _, t := range a.tailers {
		t.Stop()
	}
	if len(a.tailers) > 0 {
		slog.Info("log tailers stopped", "count", len(a.tailers))
	}
	a.tailers = nil
}

func (a *Agent) configHash() string {
	data, err := os.ReadFile(a.cfgPath)
	if err != nil {
		return ""
	}
	h := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(h[:])
}
