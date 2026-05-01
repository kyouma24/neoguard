package collector

import (
	"context"
	"strings"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
	net "github.com/shirou/gopsutil/v4/net"
)

type NetstatCollector struct {
	rate *RateComputer
}

func NewNetstatCollector() *NetstatCollector {
	return &NetstatCollector{rate: NewRateComputer()}
}

func (c *NetstatCollector) Name() string { return "netstat" }

func (c *NetstatCollector) Collect(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	var points []model.MetricPoint

	tcpPoints, err := c.collectTCPStates(ctx, baseTags)
	if err == nil {
		points = append(points, tcpPoints...)
	}

	protoPoints, err := c.collectProtoCounters(ctx, baseTags)
	if err == nil {
		points = append(points, protoPoints...)
	}

	return points, nil
}

func (c *NetstatCollector) collectTCPStates(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	conns, err := net.ConnectionsWithContext(ctx, "tcp")
	if err != nil {
		return nil, err
	}

	states := map[string]int{
		"ESTABLISHED": 0,
		"TIME_WAIT":   0,
		"CLOSE_WAIT":  0,
		"LISTEN":      0,
		"SYN_SENT":    0,
		"SYN_RECV":    0,
		"FIN_WAIT1":   0,
		"FIN_WAIT2":   0,
		"LAST_ACK":    0,
		"CLOSING":     0,
	}

	for _, conn := range conns {
		s := strings.ToUpper(conn.Status)
		if _, ok := states[s]; ok {
			states[s]++
		}
	}

	metricMap := map[string]string{
		"ESTABLISHED": "system.tcp.established",
		"TIME_WAIT":   "system.tcp.time_wait",
		"CLOSE_WAIT":  "system.tcp.close_wait",
		"LISTEN":      "system.tcp.listen",
		"SYN_SENT":    "system.tcp.syn_sent",
		"SYN_RECV":    "system.tcp.syn_recv",
		"FIN_WAIT1":   "system.tcp.fin_wait1",
		"FIN_WAIT2":   "system.tcp.fin_wait2",
		"LAST_ACK":    "system.tcp.last_ack",
		"CLOSING":     "system.tcp.closing",
	}

	var points []model.MetricPoint
	for state, metricName := range metricMap {
		points = append(points, model.NewGauge(metricName, float64(states[state]), baseTags))
	}

	return points, nil
}

func (c *NetstatCollector) collectProtoCounters(ctx context.Context, baseTags map[string]string) ([]model.MetricPoint, error) {
	counters, err := net.ProtoCountersWithContext(ctx, []string{"tcp", "udp"})
	if err != nil {
		return nil, err
	}

	var points []model.MetricPoint

	for _, proto := range counters {
		switch strings.ToLower(proto.Protocol) {
		case "tcp":
			tcpMetrics := map[string]string{
				"ActiveOpens":  "system.tcp.active_opens_per_sec",
				"PassiveOpens": "system.tcp.passive_opens_per_sec",
				"RetransSegs":  "system.tcp.retransmits_per_sec",
				"InSegs":       "system.tcp.in_segs_per_sec",
				"OutSegs":      "system.tcp.out_segs_per_sec",
				"InErrs":       "system.tcp.in_errors_per_sec",
				"EstabResets":  "system.tcp.reset_per_sec",
			}
			for statKey, metricName := range tcpMetrics {
				if val, ok := proto.Stats[statKey]; ok {
					if rate, computed := c.rate.Compute("tcp."+statKey, float64(val)); computed {
						points = append(points, model.NewGauge(metricName, rate, baseTags))
					}
				}
			}
		case "udp":
			udpMetrics := map[string]string{
				"InDatagrams":  "system.udp.in_datagrams_per_sec",
				"OutDatagrams": "system.udp.out_datagrams_per_sec",
				"InErrors":     "system.udp.in_errors_per_sec",
				"NoPorts":      "system.udp.no_port_per_sec",
			}
			for statKey, metricName := range udpMetrics {
				if val, ok := proto.Stats[statKey]; ok {
					if rate, computed := c.rate.Compute("udp."+statKey, float64(val)); computed {
						points = append(points, model.NewGauge(metricName, rate, baseTags))
					}
				}
			}
		}
	}

	return points, nil
}
