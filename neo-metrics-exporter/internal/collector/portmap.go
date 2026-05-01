package collector

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	net "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type PortMapCollector struct{}

func NewPortMapCollector() *PortMapCollector {
	return &PortMapCollector{}
}

func (c *PortMapCollector) Name() string { return "portmap" }

func (c *PortMapCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	conns, err := net.ConnectionsWithContext(ctx, "all")
	if err != nil {
		return nil, err
	}

	pidNames := make(map[int32]string)
	seen := make(map[string]bool)
	var points []model.MetricPoint

	for _, conn := range conns {
		if !isListening(conn) {
			continue
		}

		port := conn.Laddr.Port
		if port == 0 {
			continue
		}

		protocol := connProtocol(conn)
		bindAddr := conn.Laddr.IP
		pid := conn.Pid

		key := fmt.Sprintf("%s:%s:%d:%d", protocol, bindAddr, port, pid)
		if seen[key] {
			continue
		}
		seen[key] = true

		name, ok := pidNames[pid]
		if !ok {
			name = lookupProcessName(ctx, pid)
			pidNames[pid] = name
		}

		tags := model.MergeTags(baseTags, map[string]string{
			"process_name": name,
			"process_pid":  strconv.Itoa(int(pid)),
			"port":         strconv.FormatUint(uint64(port), 10),
			"protocol":     protocol,
			"bind_address": bindAddr,
		})

		points = append(points, model.NewGauge("system.service.port", 1, tags))
	}

	slog.Debug("portmap collector", "listening_ports", len(points))
	return points, nil
}

func isListening(conn net.ConnectionStat) bool {
	if conn.Status == "LISTEN" {
		return true
	}
	if conn.Type == 2 && conn.Laddr.Port > 0 && (conn.Raddr.IP == "" || conn.Raddr.Port == 0) {
		return true
	}
	return false
}

func connProtocol(conn net.ConnectionStat) string {
	switch conn.Type {
	case 1:
		return "tcp"
	case 2:
		return "udp"
	default:
		return "unknown"
	}
}

func lookupProcessName(ctx context.Context, pid int32) string {
	if pid <= 0 {
		return ""
	}
	p, err := process.NewProcess(pid)
	if err != nil {
		return ""
	}
	name, err := p.NameWithContext(ctx)
	if err != nil {
		return ""
	}
	return name
}
