package healthz

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type mockStats struct {
	collMs    int64
	collected int64
	bufSize   int64
	bufDrop   int64
	sent      int64
	errors    int64
}

func (m *mockStats) GetCollectionMs() int64   { return m.collMs }
func (m *mockStats) GetPointsCollected() int64 { return m.collected }
func (m *mockStats) GetBufferSize() int64      { return m.bufSize }
func (m *mockStats) GetBufferDropped() int64   { return m.bufDrop }
func (m *mockStats) GetPointsSent() int64      { return m.sent }
func (m *mockStats) GetSendErrors() int64      { return m.errors }

func newTestServer() *Server {
	return New(0, &mockStats{}, "test-version")
}

func TestHealthEndpoint(t *testing.T) {
	s := newTestServer()
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	s.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "alive" {
		t.Errorf("status = %q", resp["status"])
	}
}

func TestReadyNotReady(t *testing.T) {
	s := newTestServer()
	req := httptest.NewRequest("GET", "/ready", nil)
	w := httptest.NewRecorder()
	s.handleReady(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", w.Code)
	}
}

func TestReadyWhenReady(t *testing.T) {
	s := newTestServer()
	s.SetReady(true)
	req := httptest.NewRequest("GET", "/ready", nil)
	w := httptest.NewRecorder()
	s.handleReady(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

func TestStatusEndpoint(t *testing.T) {
	stats := &mockStats{collected: 1234, errors: 2}
	s := New(0, stats, "test-version")

	req := httptest.NewRequest("GET", "/status", nil)
	w := httptest.NewRecorder()
	s.handleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp statusResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Version != "test-version" {
		t.Errorf("version = %q", resp.Version)
	}
	if resp.PointsCollected != 1234 {
		t.Errorf("points_collected = %d", resp.PointsCollected)
	}
	if resp.SendErrors != 2 {
		t.Errorf("send_errors = %d", resp.SendErrors)
	}
	if resp.Goroutines <= 0 {
		t.Errorf("goroutines = %d", resp.Goroutines)
	}
}

func TestStartAndShutdown(t *testing.T) {
	s := New(0, &mockStats{}, "v1")
	if err := s.Start(); err != nil {
		t.Fatal(err)
	}
	if err := s.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
}
