package transport

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type RetryableError struct {
	StatusCode int
	Message    string
	RetryAfter time.Duration
}

func (e *RetryableError) Error() string {
	return fmt.Sprintf("retryable error (status %d): %s", e.StatusCode, e.Message)
}

type PermanentError struct {
	StatusCode int
	Message    string
}

func (e *PermanentError) Error() string {
	return fmt.Sprintf("permanent error (status %d): %s", e.StatusCode, e.Message)
}

type Client struct {
	endpoint     string
	apiKey       string
	httpClient   *http.Client
	agentVersion string
	serializer   Serializer
}

func NewClient(endpoint, apiKey string, timeout time.Duration, agentVersion, caBundlePath string) (*Client, error) {
	return newClientWithSerializer(endpoint, apiKey, timeout, agentVersion, caBundlePath, JSONSerializer{})
}

func newClientWithSerializer(endpoint, apiKey string, timeout time.Duration, agentVersion, caBundlePath string, serializer Serializer) (*Client, error) {
	transport, err := newHTTPTransport(caBundlePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP transport: %w", err)
	}

	return &Client{
		endpoint: endpoint + "/api/v1/metrics/ingest",
		apiKey:   apiKey,
		httpClient: &http.Client{
			Timeout:   timeout,
			Transport: transport,
		},
		agentVersion: agentVersion,
		serializer:   serializer,
	}, nil
}

func (c *Client) Send(ctx context.Context, points []model.MetricPoint) error {
	batch := model.MetricBatch{Metrics: points}
	data, err := c.serializer.Marshal(batch)
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
	req.Header.Set("Content-Type", c.serializer.ContentType())
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
		return &PermanentError{StatusCode: 422, Message: "batch rejected — check metric format"}
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

func (c *Client) SendWithRetry(ctx context.Context, points []model.MetricPoint, maxRetries int) error {
	backoffs := []time.Duration{
		1 * time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second,
		16 * time.Second, 32 * time.Second, 60 * time.Second, 120 * time.Second, 300 * time.Second,
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		err := c.Send(ctx, points)
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

		slog.Warn("send failed, retrying",
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

func parseRetryAfter(val string) time.Duration {
	if val == "" {
		return 30 * time.Second
	}
	if secs, err := strconv.Atoi(val); err == nil {
		return time.Duration(secs) * time.Second
	}
	return 30 * time.Second
}
