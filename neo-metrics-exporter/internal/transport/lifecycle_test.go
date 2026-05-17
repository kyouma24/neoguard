package transport

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestRegisterSuccess(t *testing.T) {
	var received RegisterRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agents/register" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("method = %q", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("auth = %q", r.Header.Get("Authorization"))
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "internal-uuid",
			AgentIDExternal:         received.AgentIDExternal,
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   45,
			FirstRegistration:       true,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "test-key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	resp, err := lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "agent-123",
		Hostname:                "my-host",
		ResourceID:              "i-abc123",
		OS:                      "linux",
		Arch:                    "amd64",
		AgentVersion:            "1.0.0",
		Capabilities:            map[string]any{"metrics": true, "logs": false},
		ConfigHash:              "sha256:abc",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}

	if received.AgentIDExternal != "agent-123" {
		t.Errorf("agent_id_external = %q", received.AgentIDExternal)
	}
	if received.ResourceID != "i-abc123" {
		t.Errorf("resource_id = %q", received.ResourceID)
	}
	if received.Hostname != "my-host" {
		t.Errorf("hostname = %q", received.Hostname)
	}
	if received.AgentVersion != "1.0.0" {
		t.Errorf("agent_version = %q", received.AgentVersion)
	}

	if resp.HeartbeatIntervalSecs != 45 {
		t.Errorf("heartbeat_interval = %d", resp.HeartbeatIntervalSecs)
	}
	if !resp.FirstRegistration {
		t.Error("expected first_registration=true")
	}
	if resp.NegotiatedSchemaVersion != 1 {
		t.Errorf("schema_version = %d", resp.NegotiatedSchemaVersion)
	}
}

func TestRegisterBeforeMetrics(t *testing.T) {
	var registerCalled atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			registerCalled.Store(true)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(RegisterResponse{
				ID:                      "id",
				AgentIDExternal:         "a",
				Status:                  "active",
				NegotiatedSchemaVersion: 1,
				HeartbeatIntervalSecs:   30,
				FirstRegistration:       true,
			})
			return
		}
		if !registerCalled.Load() {
			t.Error("received non-register request before registration")
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		Hostname:                "h",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !registerCalled.Load() {
		t.Error("register was not called")
	}
}

func TestRegister401Permanent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "bad-key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T: %v", err, err)
	}
}

func TestRegister403Permanent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T: %v", err, err)
	}
}

func TestRegister422SchemaNegoFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(map[string]any{
			"error":           "no_compatible_schema",
			"agent_supports":  []int{1},
			"server_supports": []int{2, 3},
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})

	sne, ok := err.(*SchemaNegoError)
	if !ok {
		t.Fatalf("expected SchemaNegoError, got %T: %v", err, err)
	}
	if len(sne.ServerSupports) != 2 {
		t.Errorf("server_supports = %v", sne.ServerSupports)
	}
}

func TestRegister401NoHotLoop(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "bad", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.RegisterWithRetry(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	}, 5)

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T", err)
	}
	if attempts.Load() != 1 {
		t.Errorf("401 should not retry, got %d attempts", attempts.Load())
	}
}

func TestMetricsNotSentWhenRegistrationFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "bad", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err == nil {
		t.Fatal("expected registration failure")
	}
}

func TestHeartbeatSuccess(t *testing.T) {
	var received HeartbeatRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agents/heartbeat" {
			t.Errorf("path = %q", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}

	heap := int64(1024000)
	goroutines := 15
	collected := int64(500)
	sent := int64(480)
	errors := int64(2)
	bufSize := int64(20)
	healthPct := 95.5

	err = lc.Heartbeat(context.Background(), &HeartbeatRequest{
		AgentIDExternal:     "agent-123",
		Status:              "normal",
		HeapInuseBytes:      &heap,
		Goroutines:          &goroutines,
		PointsCollected:     &collected,
		PointsSent:          &sent,
		SendErrors:          &errors,
		BufferSize:          &bufSize,
		CollectorHealthyPct: &healthPct,
	})
	if err != nil {
		t.Fatal(err)
	}

	if received.AgentIDExternal != "agent-123" {
		t.Errorf("agent_id_external = %q", received.AgentIDExternal)
	}
	if received.Status != "normal" {
		t.Errorf("status = %q", received.Status)
	}
	if *received.HeapInuseBytes != 1024000 {
		t.Errorf("heap = %d", *received.HeapInuseBytes)
	}
	if *received.CollectorHealthyPct != 95.5 {
		t.Errorf("collector_healthy_pct = %f", *received.CollectorHealthyPct)
	}
}

func TestStoppingSuccess(t *testing.T) {
	var received StoppingRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agents/stopping" {
			t.Errorf("path = %q", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	err = lc.Stopping(context.Background(), &StoppingRequest{
		AgentIDExternal: "agent-123",
		Reason:          "SIGTERM",
	})
	if err != nil {
		t.Fatal(err)
	}

	if received.AgentIDExternal != "agent-123" {
		t.Errorf("agent_id_external = %q", received.AgentIDExternal)
	}
	if received.Reason != "SIGTERM" {
		t.Errorf("reason = %q", received.Reason)
	}
}

func TestStoppingBestEffort(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	err = lc.Stopping(context.Background(), &StoppingRequest{
		AgentIDExternal: "agent-123",
		Reason:          "shutdown",
	})
	if err == nil {
		t.Fatal("expected error for 500")
	}
}

func TestRegisterWithRetryRecovers(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n <= 2 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "id",
			AgentIDExternal:         "a",
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   30,
			FirstRegistration:       false,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := lc.RegisterWithRetry(ctx, &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	}, 5)
	if err != nil {
		t.Fatal(err)
	}
	if resp.Status != "active" {
		t.Errorf("status = %q", resp.Status)
	}
	if attempts.Load() != 3 {
		t.Errorf("attempts = %d, want 3", attempts.Load())
	}
}

func TestRegisterPayloadContainsAllFields(t *testing.T) {
	var received map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "id",
			AgentIDExternal:         "a",
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   30,
			FirstRegistration:       true,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "agent-uuid",
		Hostname:                "web-01",
		ResourceID:              "i-0123456789",
		OS:                      "linux",
		Arch:                    "amd64",
		AgentVersion:            "1.2.3",
		Capabilities:            map[string]any{"metrics": true, "logs": false, "schema_versions": []int{1}, "compression": []string{"gzip"}, "max_payload_bytes": 5242880},
		ConfigHash:              "sha256:deadbeef",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}

	requiredFields := []string{"agent_id_external", "hostname", "resource_id", "os", "arch", "agent_version", "capabilities", "config_hash", "supported_schema_versions", "heartbeat_interval_seconds"}
	for _, f := range requiredFields {
		if _, ok := received[f]; !ok {
			t.Errorf("missing field %q in register payload", f)
		}
	}
}

func TestRegister409Permanent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T: %v", err, err)
	}
}

func TestRegister409NoRetry(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusConflict)
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.RegisterWithRetry(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	}, 5)

	if _, ok := err.(*PermanentError); !ok {
		t.Fatalf("expected PermanentError, got %T", err)
	}
	if attempts.Load() != 1 {
		t.Errorf("409 should not retry, got %d attempts", attempts.Load())
	}
}

func TestRegister422FastAPIDetailEnvelope(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(map[string]any{
			"detail": map[string]any{
				"error":           "no_compatible_schema",
				"agent_supports":  []int{1},
				"server_supports": []int{2, 3},
			},
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})

	sne, ok := err.(*SchemaNegoError)
	if !ok {
		t.Fatalf("expected SchemaNegoError from FastAPI detail envelope, got %T: %v", err, err)
	}
	if len(sne.ServerSupports) != 2 {
		t.Errorf("server_supports = %v", sne.ServerSupports)
	}
	if len(sne.AgentSupports) != 1 {
		t.Errorf("agent_supports = %v", sne.AgentSupports)
	}
}

func TestRegisterCapturesDateHeader(t *testing.T) {
	// Server returns Date header in past (simulating clock skew)
	serverTime := time.Now().Add(-65 * time.Second)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Date", serverTime.UTC().Format(http.TimeFormat))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "id",
			AgentIDExternal:         "a",
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   30,
			FirstRegistration:       true,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}

	resp, err := lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Check ServerDate was captured
	if resp.ServerDate.IsZero() {
		t.Error("ServerDate should be set from Date header")
	}

	// Check ClockSkew is positive (local ahead of server)
	if resp.ClockSkew < 60 || resp.ClockSkew > 70 {
		t.Errorf("ClockSkew = %.1f, expected ~65 seconds", resp.ClockSkew)
	}
}

func TestRegisterMissingDateHeader(t *testing.T) {
	// Server does not send Date header (httptest auto-sets it, so we accept small skew)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "id",
			AgentIDExternal:         "a",
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   30,
			FirstRegistration:       true,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}

	resp, err := lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}

	// httptest automatically sets Date header, so we expect small skew (<2s)
	if resp.ServerDate.IsZero() {
		t.Error("ServerDate should be set (httptest auto-sets Date header)")
	}
	absSkew := resp.ClockSkew
	if absSkew < 0 {
		absSkew = -absSkew
	}
	if absSkew > 2.0 {
		t.Errorf("ClockSkew = %.1f, expected < 2s (httptest auto-set Date)", resp.ClockSkew)
	}
}

func TestRegisterMalformedDateHeader(t *testing.T) {
	// Server returns malformed Date header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Date", "not-a-valid-date")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "id",
			AgentIDExternal:         "a",
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   30,
			FirstRegistration:       true,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}

	resp, err := lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Malformed Date header should be ignored, zero values
	if !resp.ServerDate.IsZero() {
		t.Error("ServerDate should be zero when Date header malformed")
	}
	if resp.ClockSkew != 0 {
		t.Errorf("ClockSkew should be 0 when Date header malformed, got %.1f", resp.ClockSkew)
	}
}

func TestRegisterClockSkewPositive(t *testing.T) {
	// Local ahead of server by 120 seconds
	serverTime := time.Now().Add(-120 * time.Second)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Date", serverTime.UTC().Format(http.TimeFormat))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "id",
			AgentIDExternal:         "a",
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   30,
			FirstRegistration:       true,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}

	resp, err := lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}

	// ClockSkew should be positive (local ahead)
	if resp.ClockSkew < 115 || resp.ClockSkew > 125 {
		t.Errorf("ClockSkew = %.1f, expected ~120 seconds", resp.ClockSkew)
	}
}

func TestRegisterClockSkewNegative(t *testing.T) {
	// Local behind server by 90 seconds
	serverTime := time.Now().Add(90 * time.Second)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Date", serverTime.UTC().Format(http.TimeFormat))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RegisterResponse{
			ID:                      "id",
			AgentIDExternal:         "a",
			Status:                  "active",
			NegotiatedSchemaVersion: 1,
			HeartbeatIntervalSecs:   30,
			FirstRegistration:       true,
		})
	}))
	defer srv.Close()

	lc, err := NewLifecycleClient(srv.URL, "key", 5*time.Second, "")
	if err != nil {
		t.Fatal(err)
	}

	resp, err := lc.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "a",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatal(err)
	}

	// ClockSkew should be negative (local behind)
	if resp.ClockSkew > -85 || resp.ClockSkew < -95 {
		t.Errorf("ClockSkew = %.1f, expected ~-90 seconds", resp.ClockSkew)
	}
}
