package identity

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	azureIMDSURL = "http://169.254.169.254/metadata/instance"
	azureAPIVer  = "2021-02-01"
)

type AzureProvider struct {
	client  *http.Client
	baseURL string
}

func NewAzureProvider() *AzureProvider {
	return &AzureProvider{
		client:  &http.Client{Timeout: 2 * time.Second},
		baseURL: azureIMDSURL,
	}
}

func NewAzureProviderWithBase(baseURL string) *AzureProvider {
	return &AzureProvider{
		client:  &http.Client{Timeout: 2 * time.Second},
		baseURL: baseURL,
	}
}

func (a *AzureProvider) Name() CloudProvider {
	return ProviderAzure
}

type azureInstanceMetadata struct {
	Compute struct {
		VMID              string `json:"vmId"`
		Location          string `json:"location"`
		Name              string `json:"name"`
		ResourceGroupName string `json:"resourceGroupName"`
		SubscriptionID    string `json:"subscriptionId"`
		VMSize            string `json:"vmSize"`
		OSType            string `json:"osType"`
		Zone              string `json:"zone"`
	} `json:"compute"`
}

func (a *AzureProvider) Detect(ctx context.Context) (*Identity, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Metadata", "true")
	q := req.URL.Query()
	q.Set("api-version", azureAPIVer)
	req.URL.RawQuery = q.Encode()

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("azure imds: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("azure imds: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 65536))
	if err != nil {
		return nil, fmt.Errorf("azure imds read: %w", err)
	}

	var meta azureInstanceMetadata
	if err := json.Unmarshal(body, &meta); err != nil {
		return nil, fmt.Errorf("azure imds parse: %w", err)
	}

	if meta.Compute.VMID == "" {
		return nil, fmt.Errorf("azure imds: empty vmId")
	}

	return &Identity{
		CloudProvider:    ProviderAzure,
		InstanceID:       meta.Compute.VMID,
		Region:           meta.Compute.Location,
		AvailabilityZone: meta.Compute.Zone,
		AccountID:        meta.Compute.SubscriptionID,
		InstanceType:     meta.Compute.VMSize,
	}, nil
}
