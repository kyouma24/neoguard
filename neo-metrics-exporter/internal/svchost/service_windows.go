//go:build windows

package svchost

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"
)

const serviceName = "NeoGuardAgent"
const serviceDesc = "NeoGuard Metrics Collection Agent"

type RunFunc func(ctx context.Context) error

type neoguardService struct {
	run RunFunc
}

func (s *neoguardService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	changes <- svc.Status{State: svc.StartPending}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- s.run(ctx)
	}()

	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}

	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				cancel()
				select {
				case <-errCh:
				case <-time.After(30 * time.Second):
					slog.Error("shutdown timed out")
				}
				return
			}
		case err := <-errCh:
			if err != nil {
				slog.Error("agent exited with error", "error", err)
				return false, 1
			}
			return
		}
	}
}

func RunAsService(run RunFunc) error {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return fmt.Errorf("detect service mode: %w", err)
	}
	if !isService {
		return fmt.Errorf("not running as a Windows service")
	}
	return svc.Run(serviceName, &neoguardService{run: run})
}

func IsWindowsService() bool {
	is, _ := svc.IsWindowsService()
	return is
}

func Install(exePath, configPath string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connect to service manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err == nil {
		s.Close()
		return fmt.Errorf("service %s already exists", serviceName)
	}

	s, err = m.CreateService(serviceName, exePath, mgr.Config{
		DisplayName: serviceDesc,
		StartType:   mgr.StartAutomatic,
		Description: "Collects host metrics and sends them to NeoGuard",
	}, "run", "--config", configPath)
	if err != nil {
		return fmt.Errorf("create service: %w", err)
	}
	defer s.Close()

	err = eventlog.InstallAsEventCreate(serviceName, eventlog.Error|eventlog.Warning|eventlog.Info)
	if err != nil {
		s.Delete()
		return fmt.Errorf("install event log: %w", err)
	}

	fmt.Printf("Service %s installed successfully\n", serviceName)
	return nil
}

func Uninstall() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connect to service manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return fmt.Errorf("open service: %w", err)
	}
	defer s.Close()

	err = s.Delete()
	if err != nil {
		return fmt.Errorf("delete service: %w", err)
	}

	_ = eventlog.Remove(serviceName)

	fmt.Printf("Service %s removed successfully\n", serviceName)
	return nil
}

func GetExePath() string {
	p, _ := os.Executable()
	return p
}
