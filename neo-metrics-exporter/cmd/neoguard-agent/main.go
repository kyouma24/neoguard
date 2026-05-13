package main

import (
	"context"
	"fmt"
	"os"
	"runtime"

	"github.com/neoguard/neo-metrics-exporter/internal/agent"
	"github.com/neoguard/neo-metrics-exporter/internal/config"
	"github.com/neoguard/neo-metrics-exporter/internal/svchost"
)

var (
	version   = "dev"
	buildTime = "unknown"
	gitCommit = "unknown"
)

func main() {
	if svchost.IsWindowsService() {
		err := svchost.RunAsService(func(ctx context.Context) error {
			a := loadAgent()
			return a.Run(ctx)
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "service error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "version":
		printVersion()
	case "run":
		runAgent()
	case "diagnose":
		runDiagnose()
	case "test-connection":
		runTestConnection()
	case "service":
		runServiceCommand()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `Usage: neoguard-agent <command> [options]

Commands:
  run               Run the agent (requires --config)
  version           Print version information
  diagnose          Print diagnostic information
  test-connection   Test connectivity to the ingest endpoint
  service           Windows service management (install/uninstall)

Options:
  --config <path>   Path to config file (required for run, diagnose, test-connection)
`)
}

func printVersion() {
	fmt.Printf("neoguard-agent %s\n", version)
	fmt.Printf("  build:    %s\n", buildTime)
	fmt.Printf("  commit:   %s\n", gitCommit)
	fmt.Printf("  go:       %s\n", runtime.Version())
	fmt.Printf("  platform: %s/%s\n", runtime.GOOS, runtime.GOARCH)
}

func getConfigPath() string {
	for i, arg := range os.Args {
		if arg == "--config" && i+1 < len(os.Args) {
			return os.Args[i+1]
		}
	}
	return ""
}

func loadAgent() *agent.Agent {
	cfgPath := getConfigPath()
	if cfgPath == "" {
		fmt.Fprintln(os.Stderr, "error: --config is required")
		os.Exit(1)
	}
	cfg, err := config.Load(cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	return agent.New(cfg, version, cfgPath)
}

func runAgent() {
	a := loadAgent()
	if err := a.Run(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func runDiagnose() {
	a := loadAgent()
	a.Diagnose()
}

func runTestConnection() {
	a := loadAgent()
	if err := a.TestConnection(); err != nil {
		fmt.Fprintf(os.Stderr, "connection test failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Connection test passed.")
}

func runServiceCommand() {
	if len(os.Args) < 3 {
		fmt.Fprintf(os.Stderr, "Usage: neoguard-agent service <install|uninstall> [--config <path>]\n")
		os.Exit(1)
	}

	switch os.Args[2] {
	case "install":
		cfgPath := getConfigPath()
		if cfgPath == "" {
			fmt.Fprintln(os.Stderr, "error: --config is required for service install")
			os.Exit(1)
		}
		exePath := svchost.GetExePath()
		if err := svchost.Install(exePath, cfgPath); err != nil {
			fmt.Fprintf(os.Stderr, "install failed: %v\n", err)
			os.Exit(1)
		}
	case "uninstall":
		if err := svchost.Uninstall(); err != nil {
			fmt.Fprintf(os.Stderr, "uninstall failed: %v\n", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown service command: %s\n", os.Args[2])
		os.Exit(1)
	}
}
