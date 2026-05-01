package healthz

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type MetricStore struct {
	mu     sync.RWMutex
	points []model.MetricPoint
}

func NewMetricStore() *MetricStore {
	return &MetricStore{}
}

func (s *MetricStore) Update(points []model.MetricPoint) {
	s.mu.Lock()
	s.points = points
	s.mu.Unlock()
}

func (s *MetricStore) Snapshot() []model.MetricPoint {
	s.mu.RLock()
	out := make([]model.MetricPoint, len(s.points))
	copy(out, s.points)
	s.mu.RUnlock()
	return out
}

func (s *Server) SetMetricStore(store *MetricStore) {
	s.metricStore = store
	s.srv.Handler.(*http.ServeMux).HandleFunc("/metrics", s.handleMetrics)
}

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	if s.metricStore == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	points := s.metricStore.Snapshot()
	if len(points) == 0 {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		return
	}

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

	sort.Slice(points, func(i, j int) bool {
		return points[i].Name < points[j].Name
	})

	var b strings.Builder
	prevName := ""
	for _, p := range points {
		promName := toPromName(p.Name)
		if promName != prevName {
			promType := "gauge"
			if p.MetricType == model.MetricCounter {
				promType = "counter"
			}
			fmt.Fprintf(&b, "# TYPE %s %s\n", promName, promType)
			prevName = promName
		}
		labels := formatLabels(p.Tags)
		fmt.Fprintf(&b, "%s%s %g %d\n", promName, labels, p.Value, p.Timestamp.UnixMilli())
	}

	w.Write([]byte(b.String()))
}

func toPromName(name string) string {
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
}

func formatLabels(tags map[string]string) string {
	if len(tags) == 0 {
		return ""
	}
	keys := make([]string, 0, len(tags))
	for k := range tags {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	b.WriteByte('{')
	first := true
	for _, k := range keys {
		if !first {
			b.WriteByte(',')
		}
		first = false
		fmt.Fprintf(&b, "%s=%q", toPromName(k), tags[k])
	}
	b.WriteByte('}')
	return b.String()
}
