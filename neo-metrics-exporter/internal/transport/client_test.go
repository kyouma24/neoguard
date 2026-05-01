package transport

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func testPoints(n int) []model.MetricPoint {
	pts := make([]model.MetricPoint, n)
	for i := range pts {
		pts[i] = model.NewGauge("test.metric", float64(i), map[string]string{"host": "test"})
	}
	return pts
}

func TestSendSuccess(t *testing.T) {
	var receivedBatch model.MetricBatch
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.Header.Get("Content-Encoding") != "gzip" {
			t.Error("missing gzip encoding")
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Error("missing content-type")
		}
		if r.Header.Get("X-NeoGuard-Agent-Version") != "0.1.0" {
			t.Error("missing agent version header")
		}

		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(gz)
		if err != nil {
			t.Fatal(err)
		}
		json.Unmarshal(body, &receivedBatch)

		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"accepted": 5}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "test-key", 5*time.Second, "0.1.0")
	err := c.Send(context.Background(), testPoints(5))
	if err != nil {
		t.Fatal(err)
	}

	if len(receivedBatch.Metrics) != 5 {
		t.Errorf("received %d metrics, want 5", len(receivedBatch.Metrics))
	}
}

func TestSend401(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "bad-key", 5*time.Second, "0.1.0")
	err := c.Send(context.Background(), testPoints(1))

	permErr, ok := err.(*PermanentError)
	if !ok {
		t.Fatalf("expected PermanentError for 401, got %T", err)
	}
	if permErr.StatusCode != 401 {
		t.Errorf("status = %d", permErr.StatusCode)
	}
}

func TestSend401NoRetry(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "bad-key", 5*time.Second, "0.1.0")
	err := c.SendWithRetry(context.Background(), testPoints(1), 5)
	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T", err)
	}
	if attempts.Load() != 1 {
		t.Errorf("401 should not be retried, got %d attempts", attempts.Load())
	}
}

func TestSend403(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "key", 5*time.Second, "0.1.0")
	err := c.Send(context.Background(), testPoints(1))

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T", err)
	}
}

func TestSend422(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "key", 5*time.Second, "0.1.0")
	err := c.Send(context.Background(), testPoints(1))

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T", err)
	}
}

func TestSend429(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "60")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "key", 5*time.Second, "0.1.0")
	err := c.Send(context.Background(), testPoints(1))

	retryErr, ok := err.(*RetryableError)
	if !ok {
		t.Fatalf("expected RetryableError, got %T", err)
	}
	if retryErr.RetryAfter != 60*time.Second {
		t.Errorf("retry_after = %v", retryErr.RetryAfter)
	}
}

func TestSend500(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "key", 5*time.Second, "0.1.0")
	err := c.Send(context.Background(), testPoints(1))

	if _, ok := err.(*RetryableError); !ok {
		t.Fatalf("expected RetryableError, got %T", err)
	}
}

func TestSendWithRetrySuccess(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n <= 2 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "key", 5*time.Second, "0.1.0")
	err := c.SendWithRetry(context.Background(), testPoints(1), 5)
	if err != nil {
		t.Fatal(err)
	}
	if attempts.Load() != 3 {
		t.Errorf("attempts = %d, want 3", attempts.Load())
	}
}

func TestSendWithRetryPermanentError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "key", 5*time.Second, "0.1.0")
	err := c.SendWithRetry(context.Background(), testPoints(1), 5)
	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T: %v", err, err)
	}
}

func TestSendGzipCompression(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Encoding") != "gzip" {
			t.Error("not gzip encoded")
		}
		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			t.Fatal("failed to read gzip:", err)
		}
		data, _ := io.ReadAll(gz)
		if len(data) == 0 {
			t.Error("empty body after decompression")
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "key", 5*time.Second, "0.1.0")
	err := c.Send(context.Background(), testPoints(100))
	if err != nil {
		t.Fatal(err)
	}
}

func TestParseRetryAfter(t *testing.T) {
	tests := []struct {
		input    string
		expected time.Duration
	}{
		{"", 30 * time.Second},
		{"60", 60 * time.Second},
		{"120", 120 * time.Second},
		{"invalid", 30 * time.Second},
	}
	for _, tt := range tests {
		got := parseRetryAfter(tt.input)
		if got != tt.expected {
			t.Errorf("parseRetryAfter(%q) = %v, want %v", tt.input, got, tt.expected)
		}
	}
}
