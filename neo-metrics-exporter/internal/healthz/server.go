package healthz

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"runtime"
	"sync/atomic"
	"time"
)

type StatsProvider interface {
	GetCollectionMs() int64
	GetPointsCollected() int64
	GetBufferSize() int64
	GetBufferDropped() int64
	GetPointsSent() int64
	GetSendErrors() int64
}

type CollectorHealthProvider interface {
	HealthyPercent() float64
	TotalCollectors() int
	HealthyCollectors() int
	DegradedCollectors() int
	DisabledCollectors() int
}

type Server struct {
	addr             string
	stats            StatsProvider
	version          string
	ready            atomic.Bool
	srv              *http.Server
	uptimeStart      time.Time
	metricStore      *MetricStore
	collectorHealth  CollectorHealthProvider
}

func New(bind string, stats StatsProvider, version string) *Server {
	s := &Server{
		addr:        bind,
		stats:       stats,
		version:     version,
		uptimeStart: time.Now(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ready", s.handleReady)
	mux.HandleFunc("/status", s.handleStatus)

	s.srv = &http.Server{
		Addr:              s.addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    4096,
	}

	return s
}

func (s *Server) SetReady(ready bool) {
	s.ready.Store(ready)
}

func (s *Server) SetCollectorHealth(provider CollectorHealthProvider) {
	s.collectorHealth = provider
}

func (s *Server) Start() error {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("health server listen: %w", err)
	}
	slog.Info("health server started", "addr", s.addr)
	go func() {
		if err := s.srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			slog.Error("health server error", "error", err)
		}
	}()
	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.srv.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"alive"}`))
}

func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if s.ready.Load() {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`))
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"not_ready"}`))
	}
}

type collectorHealthResponse struct {
	HealthyPct float64 `json:"healthy_pct"`
	Total      int     `json:"total"`
	Healthy    int     `json:"healthy"`
	Degraded   int     `json:"degraded"`
	Disabled   int     `json:"disabled"`
}

type statusResponse struct {
	Version              string                   `json:"version"`
	Platform             string                   `json:"platform"`
	UptimeSeconds        float64                  `json:"uptime_seconds"`
	CollectionDurationMs int64                    `json:"collection_duration_ms"`
	PointsCollected      int64                    `json:"points_collected"`
	BufferSize           int64                    `json:"buffer_size"`
	BufferDropped        int64                    `json:"buffer_dropped"`
	PointsSent           int64                    `json:"points_sent"`
	SendErrors           int64                    `json:"send_errors"`
	Goroutines           int                      `json:"goroutines"`
	HeapAllocBytes       uint64                   `json:"heap_alloc_bytes"`
	CollectorHealth      *collectorHealthResponse `json:"collector_health,omitempty"`
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	resp := statusResponse{
		Version:              s.version,
		Platform:             runtime.GOOS + "/" + runtime.GOARCH,
		UptimeSeconds:        time.Since(s.uptimeStart).Seconds(),
		CollectionDurationMs: s.stats.GetCollectionMs(),
		PointsCollected:      s.stats.GetPointsCollected(),
		BufferSize:           s.stats.GetBufferSize(),
		BufferDropped:        s.stats.GetBufferDropped(),
		PointsSent:           s.stats.GetPointsSent(),
		SendErrors:           s.stats.GetSendErrors(),
		Goroutines:           runtime.NumGoroutine(),
		HeapAllocBytes:       mem.HeapAlloc,
	}

	if s.collectorHealth != nil {
		resp.CollectorHealth = &collectorHealthResponse{
			HealthyPct: s.collectorHealth.HealthyPercent(),
			Total:      s.collectorHealth.TotalCollectors(),
			Healthy:    s.collectorHealth.HealthyCollectors(),
			Degraded:   s.collectorHealth.DegradedCollectors(),
			Disabled:   s.collectorHealth.DisabledCollectors(),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
