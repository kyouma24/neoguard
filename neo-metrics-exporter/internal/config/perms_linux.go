//go:build linux

package config

import (
	"fmt"
	"log/slog"
	"os"
)

func checkFilePermissions(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return nil
	}
	mode := info.Mode().Perm()
	if mode&0o004 != 0 {
		slog.Warn("config file is world-readable — contains api_key",
			"path", path,
			"mode", fmt.Sprintf("%04o", mode),
			"recommended", "0640",
		)
	}
	if mode&0o002 != 0 {
		return fmt.Errorf("config: %s is world-writable (mode %04o) — refusing to load", path, mode)
	}
	return nil
}
