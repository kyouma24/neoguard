//go:build linux

package agent

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/neoguard/neo-metrics-exporter/internal/config"
)

func (a *Agent) startReloadHandler() {
	if a.cfgPath == "" {
		return
	}

	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGHUP)

	go func() {
		for range ch {
			slog.Info("SIGHUP received, reloading config", "path", a.cfgPath)
			a.reloadConfig()
		}
	}()
}

func (a *Agent) reloadConfig() {
	newCfg, err := config.Load(a.cfgPath)
	if err != nil {
		slog.Error("config reload failed", "error", err)
		return
	}

	if newCfg.APIKey != a.cfg.APIKey {
		slog.Warn("api_key change requires restart — ignored")
	}
	if newCfg.Endpoint != a.cfg.Endpoint {
		slog.Warn("endpoint change requires restart — ignored")
	}

	if newCfg.Logging.Level != a.cfg.Logging.Level || newCfg.Logging.Format != a.cfg.Logging.Format {
		setupLogging(newCfg)
		slog.Info("log config reloaded", "level", newCfg.Logging.Level, "format", newCfg.Logging.Format)
	}

	a.cfg.ExtraTags = newCfg.ExtraTags
	a.cfg.FileWatch = newCfg.FileWatch
	a.cfg.Process = newCfg.Process
	a.cfg.Collectors.Disabled = newCfg.Collectors.Disabled
	a.cfg.Logging = newCfg.Logging

	slog.Info("config reloaded successfully")
}
