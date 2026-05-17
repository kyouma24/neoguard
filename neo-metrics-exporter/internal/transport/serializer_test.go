package transport

import (
	"encoding/json"
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestJSONSerializerMarshal(t *testing.T) {
	s := JSONSerializer{}
	batch := model.MetricBatch{
		Metrics: []model.MetricPoint{
			model.NewGauge("test.metric", 42.0, map[string]string{"host": "test"}),
		},
	}

	data, err := s.Marshal(batch)
	if err != nil {
		t.Fatalf("Marshal() error: %v", err)
	}

	// Verify it's valid JSON
	var decoded model.MetricBatch
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("produced invalid JSON: %v", err)
	}

	if len(decoded.Metrics) != 1 {
		t.Errorf("decoded %d metrics, want 1", len(decoded.Metrics))
	}
	if decoded.Metrics[0].Name != "test.metric" {
		t.Errorf("metric name = %q, want %q", decoded.Metrics[0].Name, "test.metric")
	}
	if decoded.Metrics[0].Value != 42.0 {
		t.Errorf("metric value = %f, want 42.0", decoded.Metrics[0].Value)
	}
}

func TestJSONSerializerContentType(t *testing.T) {
	s := JSONSerializer{}
	ct := s.ContentType()
	if ct != "application/json" {
		t.Errorf("ContentType() = %q, want %q", ct, "application/json")
	}
}
