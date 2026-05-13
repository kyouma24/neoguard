package agent

import (
	"context"
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
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/healthz"
	"github.com/neoguard/neo-metrics-exporter/internal/identity"
	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/transport"
)

type Agent struct {
	cfg         *config.Config
	cfgPath     string
	resolver    *identity.Resolver
	buf         *buffer.DiskBuffer
	client      *transport.Client
	version     string
	stats       *collector.AgentStats
	health      *healthz.Server
	metricStore *healthz.MetricStore
}

func New(cfg *config.Config, version, cfgPath string) *Agent {
	skipCloud := cfg.CloudDetection == "skip"
	stats := &collector.AgentStats{}
	a := &Agent{
		cfg:      cfg,
		cfgPath:  cfgPath,
		resolver: identity.NewResolver(skipCloud),
		buf:      buffer.NewDiskBuffer(cfg.Buffer.MemoryMaxItems, cfg.Buffer.WALDir),
		client:   transport.NewClient(cfg.Endpoint, cfg.APIKey, time.Duration(cfg.Transport.RequestTimeoutSeconds)*time.Second, version),
		version:  version,
		stats:    stats,
	}
	if cfg.Health.Enabled {
		a.health = healthz.New(cfg.Health.Port, stats, version)
		a.metricStore = healthz.NewMetricStore()
		a.health.SetMetricStore(a.metricStore)
	}
	return a
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

	a.startDebugSignalHandler()
	a.startReloadHandler()

	if a.health != nil {
		if err := a.health.Start(); err != nil {
			slog.Warn("health server failed to start", "error", err)
		}
	}

	collectors := a.buildCollectors()
	composites := a.buildCompositeCollectors()
	slowCollectors := a.buildSlowCollectors()

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
		a.runTransmitter(ctx)
	}()

	if a.health != nil {
		a.health.SetReady(true)
	}

	<-ctx.Done()
	slog.Info("shutting down, waiting for in-flight collections")

	if a.health != nil {
		a.health.SetReady(false)
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		a.health.Shutdown(shutCtx)
		shutCancel()
	}

	collectWg.Wait()
	transmitWg.Wait()

	slog.Info("flushing remaining buffer")
	a.flushRemaining()
	a.buf.Close()

	slog.Info("agent stopped")
	return nil
}

func (a *Agent) buildCollectors() []collector.Collector {
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
		cs = append(cs, collector.NewProcessCollector(collector.ProcessConfig{
			TopN:       a.cfg.Process.TopN,
			AllowRegex: a.cfg.Process.AllowRegex,
			DenyRegex:  a.cfg.Process.DenyRegex,
		}))
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

	cs = append(cs, collector.NewAgentSelfCollector(a.stats))

	return cs
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

const collectorTimeout = 30 * time.Second

func (a *Agent) collectOnce(ctx context.Context, collectors []collector.Collector, composites []collector.CompositeCollector, baseTags map[string]string) {
	start := time.Now()
	var allPoints []model.MetricPoint

	for _, c := range collectors {
		cCtx, cCancel := context.WithTimeout(ctx, collectorTimeout)
		points, err := c.Collect(cCtx, baseTags)
		cCancel()
		if err != nil {
			slog.Error("collector failed", "collector", c.Name(), "error", err)
			continue
		}
		allPoints = append(allPoints, points...)
	}

	for _, cc := range composites {
		cCtx, cCancel := context.WithTimeout(ctx, collectorTimeout)
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

	if len(allPoints) > 0 {
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

func (a *Agent) runTransmitter(ctx context.Context) {
	interval := time.Duration(a.cfg.Transport.BatchMaxIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.transmitBatch(ctx)
		}
	}
}

const maxServerBatchSize = 10000

func (a *Agent) transmitBatch(ctx context.Context) {
	drainSize := a.cfg.Transport.BatchMaxSize
	if drainSize > maxServerBatchSize {
		drainSize = maxServerBatchSize
	}

	points := a.buf.Drain(drainSize)
	if len(points) == 0 {
		return
	}

	slog.Info("sending batch", "points", len(points))

	start := time.Now()
	if err := a.client.SendWithRetry(ctx, points, 3); err != nil {
		a.stats.SendErrors.Add(1)
		slog.Error("send failed", "error", err, "points_lost", len(points))
	} else {
		a.stats.PointsSent.Add(int64(len(points)))
		slog.Info("batch sent", "points", len(points))
	}
	a.stats.SendDurationMs.Store(time.Since(start).Milliseconds())
}

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
		for attempt := 0; attempt < 3; attempt++ {
			if ctx.Err() != nil {
				slog.Error("flush timeout", "points_lost", len(points))
				return
			}
			if err := a.client.Send(ctx, points); err != nil {
				slog.Warn("flush attempt failed", "attempt", attempt+1, "error", err)
				wait := time.Duration(1<<uint(attempt)) * time.Second
				select {
				case <-ctx.Done():
					slog.Error("flush timeout during backoff", "points_lost", len(points))
					return
				case <-time.After(wait):
				}
				continue
			}
			sent = true
			break
		}
		if !sent {
			slog.Error("flush failed after 3 attempts", "points_lost", len(points))
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

	collectors := a.buildCollectors()
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
