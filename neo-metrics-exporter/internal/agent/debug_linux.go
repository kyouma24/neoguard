//go:build linux

package agent

import (
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"runtime"
	"syscall"
)

func (a *Agent) startDebugSignalHandler() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGUSR1)
	go func() {
		for range ch {
			a.dumpDebugInfo()
		}
	}()
}

func (a *Agent) dumpDebugInfo() {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	bufStats := a.buf.Stats()

	slog.Info("=== DEBUG DUMP (SIGUSR1) ===")
	slog.Info("runtime",
		"goroutines", runtime.NumGoroutine(),
		"heap_alloc_mb", fmt.Sprintf("%.1f", float64(memStats.HeapAlloc)/1024/1024),
		"heap_sys_mb", fmt.Sprintf("%.1f", float64(memStats.HeapSys)/1024/1024),
		"stack_sys_mb", fmt.Sprintf("%.1f", float64(memStats.StackSys)/1024/1024),
		"num_gc", memStats.NumGC,
		"gc_pause_us", memStats.PauseNs[(memStats.NumGC+255)%256]/1000,
	)
	slog.Info("buffer",
		"items", bufStats.Items,
		"batches", bufStats.Batches,
		"dropped_total", bufStats.Dropped,
	)
	slog.Info("agent_stats",
		"collection_duration_ms", a.stats.CollectionDurationMs.Load(),
		"points_collected", a.stats.PointsCollected.Load(),
		"points_sent", a.stats.PointsSent.Load(),
		"send_errors", a.stats.SendErrors.Load(),
		"send_duration_ms", a.stats.SendDurationMs.Load(),
	)

	buf := make([]byte, 64*1024)
	n := runtime.Stack(buf, true)
	slog.Info("goroutine dump", "stack", string(buf[:n]))
}
