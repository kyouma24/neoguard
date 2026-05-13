//go:build !windows

package svchost

import (
	"context"
	"fmt"
)

type RunFunc func(ctx context.Context) error

func RunAsService(_ RunFunc) error {
	return fmt.Errorf("Windows service mode not supported on this platform")
}

func IsWindowsService() bool {
	return false
}

func Install(_, _ string) error {
	return fmt.Errorf("Windows service install not supported on this platform")
}

func Uninstall() error {
	return fmt.Errorf("Windows service uninstall not supported on this platform")
}

func GetExePath() string {
	return ""
}
