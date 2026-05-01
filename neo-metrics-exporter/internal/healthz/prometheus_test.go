package healthz

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestMetricStoreUpdateAndSnapshot(t *testing.T) {
	store := NewMetricStore()
	points := []model.MetricPoint{
		model.NewGauge("test.metric", 42, map[string]string{"host": "a"}),
	}
	store.Update(points)
	snap := store.Snapshot()
	if len(snap) != 1 {
		t.Fatalf("snap len = %d", len(snap))
	}
	if snap[0].Name != "test.metric" {
		t.Errorf("name = %q", snap[0].Name)
	}
}

func TestPrometheusEndpointEmpty(t *testing.T) {
	s := newTestServer()
	store := NewMetricStore()
	s.SetMetricStore(store)

	req := httptest.NewRequest("GET", "/metrics", nil)
	w := httptest.NewRecorder()
	s.handleMetrics(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d", w.Code)
	}
}

func TestPrometheusEndpointWithMetrics(t *testing.T) {
	s := newTestServer()
	store := NewMetricStore()
	s.SetMetricStore(store)

	store.Update([]model.MetricPoint{
		{
			Name:       "system.cpu.usage",
			Value:      42.5,
			Timestamp:  time.Unix(1700000000, 0),
			Tags:       map[string]string{"hostname": "web1"},
			MetricType: model.MetricGauge,
		},
		{
			Name:       "agent.points_sent",
			Value:      100,
			Timestamp:  time.Unix(1700000000, 0),
			Tags:       map[string]string{},
			MetricType: model.MetricCounter,
		},
	})

	req := httptest.NewRequest("GET", "/metrics", nil)
	w := httptest.NewRecorder()
	s.handleMetrics(w, req)

	body := w.Body.String()

	if !strings.Contains(body, "# TYPE agent_points_sent counter") {
		t.Error("missing counter TYPE line")
	}
	if !strings.Contains(body, "# TYPE system_cpu_usage gauge") {
		t.Error("missing gauge TYPE line")
	}
	if !strings.Contains(body, "system_cpu_usage{hostname=\"web1\"}") {
		t.Errorf("missing metric line with labels, got:\n%s", body)
	}
	if !strings.Contains(body, "42.5") {
		t.Error("missing value 42.5")
	}
}

func TestToPromName(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"system.cpu.usage", "system_cpu_usage"},
		{"a-b.c_d", "a_b_c_d"},
		{"ok_name", "ok_name"},
	}
	for _, tc := range tests {
		got := toPromName(tc.in)
		if got != tc.want {
			t.Errorf("toPromName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestFormatLabels(t *testing.T) {
	got := formatLabels(map[string]string{"a": "1", "b": "2"})
	if got != `{a="1",b="2"}` {
		t.Errorf("got %q", got)
	}
	got = formatLabels(nil)
	if got != "" {
		t.Errorf("nil labels = %q", got)
	}
}
