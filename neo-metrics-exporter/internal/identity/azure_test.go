package identity

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newMockAzureIMDS(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Metadata") != "true" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"compute": {
				"vmId": "vm-abc-123-def",
				"location": "eastus",
				"name": "my-vm",
				"resourceGroupName": "rg-prod",
				"subscriptionId": "sub-1234-5678",
				"vmSize": "Standard_D2s_v3",
				"osType": "Linux",
				"zone": "1"
			}
		}`))
	}))
}

func TestAzureDetect(t *testing.T) {
	srv := newMockAzureIMDS(t)
	defer srv.Close()

	p := NewAzureProviderWithBase(srv.URL)
	id, err := p.Detect(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if id.CloudProvider != ProviderAzure {
		t.Errorf("provider = %q", id.CloudProvider)
	}
	if id.InstanceID != "vm-abc-123-def" {
		t.Errorf("instance_id = %q", id.InstanceID)
	}
	if id.Region != "eastus" {
		t.Errorf("region = %q", id.Region)
	}
	if id.AvailabilityZone != "1" {
		t.Errorf("az = %q", id.AvailabilityZone)
	}
	if id.AccountID != "sub-1234-5678" {
		t.Errorf("account_id = %q", id.AccountID)
	}
	if id.InstanceType != "Standard_D2s_v3" {
		t.Errorf("instance_type = %q", id.InstanceType)
	}
}

func TestAzureDetectRequiresMetadataHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Metadata") != "true" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Write([]byte(`{"compute":{"vmId":"vm-1"}}`))
	}))
	defer srv.Close()

	p := NewAzureProviderWithBase(srv.URL)
	id, err := p.Detect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.InstanceID != "vm-1" {
		t.Errorf("instance_id = %q", id.InstanceID)
	}
}

func TestAzureDetectFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	p := NewAzureProviderWithBase(srv.URL)
	_, err := p.Detect(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestAzureDetectEmptyVMID(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"compute":{"vmId":"","location":"eastus"}}`))
	}))
	defer srv.Close()

	p := NewAzureProviderWithBase(srv.URL)
	_, err := p.Detect(context.Background())
	if err == nil {
		t.Fatal("expected error for empty vmId")
	}
}

func TestAzureName(t *testing.T) {
	p := NewAzureProvider()
	if p.Name() != ProviderAzure {
		t.Errorf("name = %q", p.Name())
	}
}
