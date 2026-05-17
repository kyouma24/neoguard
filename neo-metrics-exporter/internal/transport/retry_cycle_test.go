package transport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// Test 1: 503 then recovery → re-enqueue works, no dead-letter.
// Tests Client.SendWithRetry directly (the per-cycle retry logic).
func TestSendWithRetryRecovery(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n <= 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "key", 5*time.Second, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}
	pts := testPoints(100)

	err = c.SendWithRetry(context.Background(), pts, 5)
	if err != nil {
		t.Fatalf("expected success after recovery, got: %v", err)
	}
	if attempts.Load() != 4 {
		t.Errorf("attempts = %d, want 4 (3 failures + 1 success)", attempts.Load())
	}
}

// Test 1b: All retries exhausted returns error (one cycle).
func TestSendWithRetryExhaustion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "key", 5*time.Second, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}

	// Use maxRetries=0 to make it fast (1 attempt only)
	err = c.SendWithRetry(context.Background(), testPoints(10), 0)
	if err == nil {
		t.Fatal("expected error on exhaustion")
	}
}

// Test 7: Permanent error (401) returns immediately, not retried.
func TestPermanentErrorNotRetried(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "bad-key", 5*time.Second, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}
	err = c.SendWithRetry(context.Background(), testPoints(50), 5)

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T: %v", err, err)
	}
	if attempts.Load() != 1 {
		t.Errorf("permanent error should not retry, got %d attempts", attempts.Load())
	}
}

// Test: RetryableError is classified correctly for 503.
func TestRetryableError503(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "key", 5*time.Second, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}
	err = c.Send(context.Background(), testPoints(1))

	if _, ok := err.(*RetryableError); !ok {
		t.Fatalf("503 should be RetryableError, got %T", err)
	}
}

// Test: Mixed batch sizes through SendWithRetry.
func TestSendWithRetryLargeBatch(t *testing.T) {
	var received atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, "key", 5*time.Second, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}

	// Simulate a large batch (5000 points)
	pts := make([]model.MetricPoint, 5000)
	for i := range pts {
		pts[i] = model.NewGauge("test.large", float64(i), map[string]string{"host": "test"})
	}

	err = c.SendWithRetry(context.Background(), pts, 3)
	if err != nil {
		t.Fatal(err)
	}
	if received.Load() != 1 {
		t.Errorf("expected 1 request, got %d", received.Load())
	}
}
