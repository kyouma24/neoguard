package identity

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	imdsBase     = "http://169.254.169.254"
	imdsTokenURL = imdsBase + "/latest/api/token"
	imdsTokenTTL = "21600"
)

type AWSProvider struct {
	client  *http.Client
	baseURL string
}

func NewAWSProvider() *AWSProvider {
	return &AWSProvider{
		client: &http.Client{Timeout: 2 * time.Second},
		baseURL: imdsBase,
	}
}

func NewAWSProviderWithBase(baseURL string) *AWSProvider {
	return &AWSProvider{
		client:  &http.Client{Timeout: 2 * time.Second},
		baseURL: baseURL,
	}
}

func (a *AWSProvider) Name() CloudProvider {
	return ProviderAWS
}

func (a *AWSProvider) Detect(ctx context.Context) (*Identity, error) {
	token, err := a.getToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("aws imds token: %w", err)
	}

	instanceID, err := a.getMeta(ctx, token, "/latest/meta-data/instance-id")
	if err != nil {
		return nil, fmt.Errorf("aws instance-id: %w", err)
	}

	region, _ := a.getMeta(ctx, token, "/latest/meta-data/placement/region")
	az, _ := a.getMeta(ctx, token, "/latest/meta-data/placement/availability-zone")
	instanceType, _ := a.getMeta(ctx, token, "/latest/meta-data/instance-type")
	accountID, _ := a.getAccountID(ctx, token)

	return &Identity{
		CloudProvider:    ProviderAWS,
		InstanceID:       instanceID,
		Region:           region,
		AvailabilityZone: az,
		AccountID:        accountID,
		InstanceType:     instanceType,
	}, nil
}

func (a *AWSProvider) getToken(ctx context.Context) (string, error) {
	tokenURL := a.baseURL + "/latest/api/token"
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, tokenURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", imdsTokenTTL)

	resp, err := a.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("imds token: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(body)), nil
}

func (a *AWSProvider) getMeta(ctx context.Context, token, path string) (string, error) {
	url := a.baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-aws-ec2-metadata-token", token)

	resp, err := a.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("imds %s: status %d", path, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(body)), nil
}

func (a *AWSProvider) getAccountID(ctx context.Context, token string) (string, error) {
	doc, err := a.getMeta(ctx, token, "/latest/dynamic/instance-identity/document")
	if err != nil {
		return "", err
	}
	var identity struct {
		AccountID string `json:"accountId"`
	}
	if err := json.Unmarshal([]byte(doc), &identity); err != nil {
		return "", fmt.Errorf("parse identity document: %w", err)
	}
	return identity.AccountID, nil
}
