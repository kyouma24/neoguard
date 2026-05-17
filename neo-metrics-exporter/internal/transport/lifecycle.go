package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

type RegisterRequest struct {
	AgentIDExternal         string         `json:"agent_id_external"`
	Hostname                string         `json:"hostname"`
	ResourceID              string         `json:"resource_id"`
	OS                      string         `json:"os"`
	Arch                    string         `json:"arch"`
	AgentVersion            string         `json:"agent_version"`
	Capabilities            map[string]any `json:"capabilities"`
	ConfigHash              string         `json:"config_hash"`
	SupportedSchemaVersions []int          `json:"supported_schema_versions"`
	HeartbeatIntervalSecs   int            `json:"heartbeat_interval_seconds"`
}

type RegisterResponse struct {
	ID                      string    `json:"id"`
	AgentIDExternal         string    `json:"agent_id_external"`
	Status                  string    `json:"status"`
	NegotiatedSchemaVersion int       `json:"negotiated_schema_version"`
	HeartbeatIntervalSecs   int       `json:"heartbeat_interval_seconds"`
	FirstRegistration       bool      `json:"first_registration"`
	ServerDate              time.Time `json:"-"` // Captured from Date header, not from JSON body
	ClockSkew               float64   `json:"-"` // Computed: local - server (seconds)
}

type HeartbeatRequest struct {
	AgentIDExternal     string   `json:"agent_id_external"`
	Status              string   `json:"status"`
	HeapInuseBytes      *int64   `json:"heap_inuse_bytes,omitempty"`
	Goroutines          *int     `json:"goroutines,omitempty"`
	PointsCollected     *int64   `json:"points_collected,omitempty"`
	PointsSent          *int64   `json:"points_sent,omitempty"`
	SendErrors          *int64   `json:"send_errors,omitempty"`
	BufferSize          *int64   `json:"buffer_size,omitempty"`
	CollectorHealthyPct *float64 `json:"collector_healthy_pct,omitempty"`
}

type StoppingRequest struct {
	AgentIDExternal string `json:"agent_id_external"`
	Reason          string `json:"reason"`
}

type SchemaNegoError struct {
	AgentSupports  []int
	ServerSupports []int
}

func (e *SchemaNegoError) Error() string {
	return fmt.Sprintf("schema negotiation failed: agent supports %v, server supports %v", e.AgentSupports, e.ServerSupports)
}

type LifecycleClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func NewLifecycleClient(endpoint, apiKey string, timeout time.Duration, caBundlePath string) (*LifecycleClient, error) {
	transport, err := newHTTPTransport(caBundlePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP transport: %w", err)
	}

	return &LifecycleClient{
		baseURL: endpoint,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout:   timeout,
			Transport: transport,
		},
	}, nil
}

func (lc *LifecycleClient) Register(ctx context.Context, req *RegisterRequest) (*RegisterResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal register request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, lc.baseURL+"/api/v1/agents/register", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create register request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+lc.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := lc.httpClient.Do(httpReq)
	if err != nil {
		return nil, &RetryableError{Message: fmt.Sprintf("register network: %v", err)}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 65536))

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		var result RegisterResponse
		if err := json.Unmarshal(respBody, &result); err != nil {
			return nil, fmt.Errorf("decode register response: %w", err)
		}

		// Capture Date header for clock skew computation
		dateHeader := resp.Header.Get("Date")
		if dateHeader != "" {
			serverTime, err := http.ParseTime(dateHeader)
			if err == nil {
				localTime := time.Now()
				result.ServerDate = serverTime
				result.ClockSkew = localTime.Sub(serverTime).Seconds()
			}
		}

		return &result, nil
	case resp.StatusCode == 401:
		return nil, &PermanentError{StatusCode: 401, Message: "unauthorized - check api_key"}
	case resp.StatusCode == 403:
		return nil, &PermanentError{StatusCode: 403, Message: "forbidden - wrong API key scope"}
	case resp.StatusCode == 409:
		return nil, &PermanentError{StatusCode: 409, Message: "conflict - agent already registered with different identity"}
	case resp.StatusCode == 422:
		if nego := parseSchemaNegoError(respBody); nego != nil {
			return nil, nego
		}
		return nil, &PermanentError{StatusCode: 422, Message: fmt.Sprintf("registration rejected: %s", string(respBody))}
	case resp.StatusCode == 429:
		return nil, &RetryableError{StatusCode: 429, Message: "rate limited", RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After"))}
	default:
		return nil, &RetryableError{StatusCode: resp.StatusCode, Message: fmt.Sprintf("server error: %d", resp.StatusCode)}
	}
}

func (lc *LifecycleClient) Heartbeat(ctx context.Context, req *HeartbeatRequest) error {
	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal heartbeat: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, lc.baseURL+"/api/v1/agents/heartbeat", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create heartbeat request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+lc.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := lc.httpClient.Do(httpReq)
	if err != nil {
		return &RetryableError{Message: fmt.Sprintf("heartbeat network: %v", err)}
	}
	defer resp.Body.Close()
	io.ReadAll(io.LimitReader(resp.Body, 4096))

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return nil
	case resp.StatusCode == 401:
		return &PermanentError{StatusCode: 401, Message: "unauthorized"}
	case resp.StatusCode == 403:
		return &PermanentError{StatusCode: 403, Message: "forbidden"}
	case resp.StatusCode == 404:
		return &PermanentError{StatusCode: 404, Message: "agent not registered"}
	case resp.StatusCode == 409:
		return &PermanentError{StatusCode: 409, Message: "heartbeat rejected"}
	case resp.StatusCode == 429:
		return &RetryableError{StatusCode: 429, Message: "rate limited", RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After"))}
	default:
		return &RetryableError{StatusCode: resp.StatusCode, Message: fmt.Sprintf("server error: %d", resp.StatusCode)}
	}
}

func (lc *LifecycleClient) Stopping(ctx context.Context, req *StoppingRequest) error {
	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal stopping: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, lc.baseURL+"/api/v1/agents/stopping", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create stopping request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+lc.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := lc.httpClient.Do(httpReq)
	if err != nil {
		slog.Warn("stopping request failed", "error", err)
		return err
	}
	defer resp.Body.Close()
	io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	slog.Warn("stopping request non-success", "status", resp.StatusCode)
	return fmt.Errorf("stopping: status %d", resp.StatusCode)
}

func (lc *LifecycleClient) RegisterWithRetry(ctx context.Context, req *RegisterRequest, maxRetries int) (*RegisterResponse, error) {
	backoffs := []time.Duration{
		2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 30 * time.Second,
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		resp, err := lc.Register(ctx, req)
		if err == nil {
			return resp, nil
		}

		if _, ok := err.(*PermanentError); ok {
			return nil, err
		}
		if _, ok := err.(*SchemaNegoError); ok {
			return nil, err
		}

		lastErr = err
		if attempt == maxRetries {
			break
		}

		wait := backoffs[attempt]
		if attempt >= len(backoffs) {
			wait = backoffs[len(backoffs)-1]
		}

		if retryErr, ok := err.(*RetryableError); ok && retryErr.RetryAfter > 0 {
			wait = retryErr.RetryAfter
		}

		slog.Warn("registration failed, retrying", "attempt", attempt+1, "wait", wait, "error", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(wait):
		}
	}
	return nil, fmt.Errorf("registration failed after %d retries: %w", maxRetries, lastErr)
}

func parseSchemaNegoError(body []byte) *SchemaNegoError {
	type negoPayload struct {
		Error          string `json:"error"`
		AgentSupports  []int  `json:"agent_supports"`
		ServerSupports []int  `json:"server_supports"`
	}

	// Try top-level first (agent's own error format)
	var top negoPayload
	if err := json.Unmarshal(body, &top); err == nil && top.Error == "no_compatible_schema" {
		return &SchemaNegoError{AgentSupports: top.AgentSupports, ServerSupports: top.ServerSupports}
	}

	// Try FastAPI envelope: {"detail": {...}}
	var envelope struct {
		Detail negoPayload `json:"detail"`
	}
	if err := json.Unmarshal(body, &envelope); err == nil && envelope.Detail.Error == "no_compatible_schema" {
		return &SchemaNegoError{AgentSupports: envelope.Detail.AgentSupports, ServerSupports: envelope.Detail.ServerSupports}
	}

	return nil
}
