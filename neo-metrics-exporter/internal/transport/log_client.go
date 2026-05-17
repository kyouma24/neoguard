package transport

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// LogClient handles HTTP transmission of log batches.
// Separate from metrics Client per Option A (preserves AGENT-012 decision).
// Endpoint: /api/v1/logs/ingest per contract §7.4.
// Timeout: 60s per contract §2.2.
type LogClient struct {
	endpoint     string
	apiKey       string
	httpClient   *http.Client
	agentVersion string
}

func NewLogClient(endpoint, apiKey string, agentVersion, caBundlePath string) (*LogClient, error) {
	transport, err := newHTTPTransport(caBundlePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP transport: %w", err)
	}

	return &LogClient{
		endpoint: endpoint + "/api/v1/logs/ingest",
		apiKey:   apiKey,
		httpClient: &http.Client{
			Timeout:   60 * time.Second, // Contract §2.2: logs use 60s timeout
			Transport: transport,
		},
		agentVersion: agentVersion,
	}, nil
}

func (c *LogClient) Send(ctx context.Context, envelope model.LogEnvelope) error {
	data, err := json.Marshal(envelope)
	if err != nil {
		return &PermanentError{Message: fmt.Sprintf("marshal: %v", err)}
	}

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(data); err != nil {
		return &PermanentError{Message: fmt.Sprintf("gzip: %v", err)}
	}
	if err := gz.Close(); err != nil {
		return &PermanentError{Message: fmt.Sprintf("gzip close: %v", err)}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, &buf)
	if err != nil {
		return &PermanentError{Message: fmt.Sprintf("request: %v", err)}
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("X-NeoGuard-Agent-Version", c.agentVersion)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return &RetryableError{Message: fmt.Sprintf("network: %v", err)}
	}
	defer resp.Body.Close()
	io.ReadAll(io.LimitReader(resp.Body, 4096))

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return nil
	case resp.StatusCode == 401:
		return &PermanentError{StatusCode: 401, Message: "unauthorized — check api_key in config"}
	case resp.StatusCode == 403:
		return &PermanentError{StatusCode: 403, Message: "forbidden — wrong API key scope"}
	case resp.StatusCode == 422:
		return &PermanentError{StatusCode: 422, Message: "batch rejected — check log format"}
	case resp.StatusCode == 429:
		retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"))
		return &RetryableError{
			StatusCode: 429,
			Message:    "rate limited",
			RetryAfter: retryAfter,
		}
	default:
		return &RetryableError{
			StatusCode: resp.StatusCode,
			Message:    fmt.Sprintf("server error: %d", resp.StatusCode),
		}
	}
}

func (c *LogClient) SendWithRetry(ctx context.Context, envelope model.LogEnvelope, maxRetries int) error {
	backoffs := []time.Duration{
		1 * time.Second, 2 * time.Second, 4 * time.Second,
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		err := c.Send(ctx, envelope)
		if err == nil {
			return nil
		}

		if _, ok := err.(*PermanentError); ok {
			return err
		}

		retryErr, ok := err.(*RetryableError)
		if !ok {
			return err
		}

		lastErr = err

		if attempt == maxRetries {
			break
		}

		wait := retryErr.RetryAfter
		if wait == 0 {
			idx := attempt
			if idx >= len(backoffs) {
				idx = len(backoffs) - 1
			}
			wait = backoffs[idx]
		}

		slog.Warn("log send failed, retrying",
			"attempt", attempt+1,
			"status", retryErr.StatusCode,
			"wait", wait,
		)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}

	return fmt.Errorf("max retries exceeded: %w", lastErr)
}
