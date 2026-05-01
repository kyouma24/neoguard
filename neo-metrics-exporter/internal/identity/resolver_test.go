package identity

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"testing"
)

type mockProvider struct {
	name CloudProvider
	id   *Identity
	err  error
}

func (m *mockProvider) Name() CloudProvider { return m.name }
func (m *mockProvider) Detect(ctx context.Context) (*Identity, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.id, nil
}

func TestResolverSkipCloud(t *testing.T) {
	r := NewResolver(true)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.CloudProvider != ProviderUnknown {
		t.Errorf("provider = %q, want unknown", id.CloudProvider)
	}
	hostname, _ := os.Hostname()
	if id.Hostname != hostname {
		t.Errorf("hostname = %q, want %q", id.Hostname, hostname)
	}
	if id.OS != runtime.GOOS {
		t.Errorf("os = %q, want %q", id.OS, runtime.GOOS)
	}
	if id.InstanceID != hostname {
		t.Errorf("instance_id = %q, want %q (hostname fallback)", id.InstanceID, hostname)
	}
}

func TestResolverAWSFirst(t *testing.T) {
	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-abc123",
			Region:        "us-east-1",
		},
	}
	azure := &mockProvider{
		name: ProviderAzure,
		err:  fmt.Errorf("not azure"),
	}

	r := NewResolverWithProviders([]Provider{aws, azure}, false)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.CloudProvider != ProviderAWS {
		t.Errorf("provider = %q", id.CloudProvider)
	}
	if id.InstanceID != "i-abc123" {
		t.Errorf("instance_id = %q", id.InstanceID)
	}
}

func TestResolverFallsToAzure(t *testing.T) {
	aws := &mockProvider{name: ProviderAWS, err: fmt.Errorf("not aws")}
	azure := &mockProvider{
		name: ProviderAzure,
		id: &Identity{
			CloudProvider: ProviderAzure,
			InstanceID:    "vm-xyz",
			Region:        "eastus",
		},
	}

	r := NewResolverWithProviders([]Provider{aws, azure}, false)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.CloudProvider != ProviderAzure {
		t.Errorf("provider = %q", id.CloudProvider)
	}
}

func TestResolverAllFailFallsBackToHostname(t *testing.T) {
	aws := &mockProvider{name: ProviderAWS, err: fmt.Errorf("fail")}
	azure := &mockProvider{name: ProviderAzure, err: fmt.Errorf("fail")}

	r := NewResolverWithProviders([]Provider{aws, azure}, false)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal("expected fallback, got error:", err)
	}
	if id.CloudProvider != ProviderUnknown {
		t.Errorf("provider = %q, want unknown", id.CloudProvider)
	}
	if id.Hostname == "" {
		t.Error("hostname should be set from fallback")
	}
}

func TestResolverCaching(t *testing.T) {
	callCount := 0
	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-cached",
		},
	}
	original := aws.id
	_ = original

	r := NewResolverWithProviders([]Provider{aws}, false)

	id1, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	_ = callCount

	id2, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if id1.InstanceID != id2.InstanceID {
		t.Errorf("cached identity mismatch: %q vs %q", id1.InstanceID, id2.InstanceID)
	}
}

func TestResolverInvalidateCache(t *testing.T) {
	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-first",
		},
	}

	r := NewResolverWithProviders([]Provider{aws}, false)
	_, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	r.InvalidateCache()
	aws.id = &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-second",
	}

	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.InstanceID != "i-second" {
		t.Errorf("instance_id = %q after invalidation, want i-second", id.InstanceID)
	}
}

func TestResolverFillsHostInfo(t *testing.T) {
	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-test",
		},
	}

	r := NewResolverWithProviders([]Provider{aws}, false)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if id.Hostname == "" {
		t.Error("hostname should be filled")
	}
	if id.OS == "" {
		t.Error("os should be filled")
	}
}

func TestIdentityTags(t *testing.T) {
	id := &Identity{
		CloudProvider:    ProviderAWS,
		InstanceID:       "i-test",
		Region:           "us-east-1",
		AvailabilityZone: "us-east-1a",
		AccountID:        "123456789012",
		InstanceType:     "t3.large",
		Hostname:         "my-host",
		OS:               "linux",
		OSVersion:        "Ubuntu 22.04",
	}

	tags := id.Tags()
	expected := map[string]string{
		"cloud_provider":    "aws",
		"resource_id":       "i-test",
		"region":            "us-east-1",
		"availability_zone": "us-east-1a",
		"account_id":        "123456789012",
		"instance_type":     "t3.large",
		"hostname":          "my-host",
		"os":                "linux",
		"os_version":        "Ubuntu 22.04",
	}

	for k, v := range expected {
		if tags[k] != v {
			t.Errorf("tag %q = %q, want %q", k, tags[k], v)
		}
	}
}

func TestIdentityTagsMinimal(t *testing.T) {
	id := &Identity{
		CloudProvider: ProviderUnknown,
		Hostname:      "localhost",
		OS:            "windows",
	}

	tags := id.Tags()
	if _, ok := tags["cloud_provider"]; ok {
		t.Error("unknown provider should not appear in tags")
	}
	if _, ok := tags["resource_id"]; ok {
		t.Error("empty instance_id should not appear in tags")
	}
	if tags["hostname"] != "localhost" {
		t.Errorf("hostname = %q", tags["hostname"])
	}
}
