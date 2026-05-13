//go:build linux

package collector

import (
	"context"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	"github.com/neoguard/neo-metrics-exporter/internal/procfs"
)

type SockstatCollector struct{}

func NewSockstatCollector() *SockstatCollector {
	return &SockstatCollector{}
}

func (c *SockstatCollector) Name() string { return "sockstat" }

func (c *SockstatCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	s, err := procfs.ReadSockstat()
	if err != nil {
		return nil, err
	}

	return []model.MetricPoint{
		model.NewGauge("system.sockstat.sockets_used", float64(s.SocketsUsed), baseTags),
		model.NewGauge("system.sockstat.tcp_inuse", float64(s.TCPInUse), baseTags),
		model.NewGauge("system.sockstat.tcp_orphan", float64(s.TCPOrphan), baseTags),
		model.NewGauge("system.sockstat.tcp_time_wait", float64(s.TCPTimeWait), baseTags),
		model.NewGauge("system.sockstat.tcp_alloc", float64(s.TCPAlloc), baseTags),
		model.NewGauge("system.sockstat.tcp_mem_pages", float64(s.TCPMemPages), baseTags),
		model.NewGauge("system.sockstat.udp_inuse", float64(s.UDPInUse), baseTags),
		model.NewGauge("system.sockstat.udp_mem_pages", float64(s.UDPMemPages), baseTags),
	}, nil
}
