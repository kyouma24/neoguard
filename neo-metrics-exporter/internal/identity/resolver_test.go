package identity

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
)

type mockProvider struct {
	name  CloudProvider
	id    *Identity
	err   error
	delay time.Duration
}

func (m *mockProvider) Name() CloudProvider { return m.name }
func (m *mockProvider) Detect(ctx context.Context) (*Identity, error) {
	if m.delay > 0 {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(m.delay):
		}
	}
	if m.err != nil {
		return nil, m.err
	}
	return m.id, nil
}

func TestResolverSkipCloud(t *testing.T) {
	r := NewResolverFull(nil, true, "")
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
	if !strings.HasPrefix(id.InstanceID, "host-") {
		t.Errorf("instance_id = %q, want host- prefix", id.InstanceID)
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
	if id.ResolvedVia != "hostname-fallback" {
		t.Errorf("resolved_via = %q, want hostname-fallback", id.ResolvedVia)
	}
}

func TestResolverCaching(t *testing.T) {
	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-cached",
		},
	}

	r := NewResolverWithProviders([]Provider{aws}, false)

	id1, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}

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
		AgentID:          "f47ac10b-58cc-4372-a567-0e02b2c3d479",
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
		"agent_id":          "f47ac10b-58cc-4372-a567-0e02b2c3d479",
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
	if tags["cloud_provider"] != "unknown" {
		t.Errorf("cloud_provider = %q, want \"unknown\"", tags["cloud_provider"])
	}
	if _, ok := tags["resource_id"]; ok {
		t.Error("empty instance_id should not appear in tags")
	}
	if _, ok := tags["agent_id"]; ok {
		t.Error("empty agent_id should not appear in tags")
	}
	if tags["hostname"] != "localhost" {
		t.Errorf("hostname = %q", tags["hostname"])
	}
}

func TestIdentityTagsCloudProviderAlwaysPresent(t *testing.T) {
	cases := []struct {
		name     string
		provider CloudProvider
		want     string
	}{
		{"aws", ProviderAWS, "aws"},
		{"azure", ProviderAzure, "azure"},
		{"on-prem", ProviderOnPrem, "on-prem"},
		{"unknown", ProviderUnknown, "unknown"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id := &Identity{
				CloudProvider: tc.provider,
				Hostname:      "test-host",
				OS:            "linux",
			}
			tags := id.Tags()
			if tags["cloud_provider"] != tc.want {
				t.Errorf("cloud_provider = %q, want %q", tags["cloud_provider"], tc.want)
			}
		})
	}
}

func TestResolverTotalTimeout(t *testing.T) {
	slow1 := &mockProvider{name: ProviderAWS, err: fmt.Errorf("timeout"), delay: 5 * time.Second}
	slow2 := &mockProvider{name: ProviderAzure, err: fmt.Errorf("timeout"), delay: 5 * time.Second}

	r := NewResolverWithProviders([]Provider{slow1, slow2}, false)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	start := time.Now()
	id, err := r.Resolve(ctx)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatal(err)
	}
	if id.CloudProvider != ProviderUnknown {
		t.Errorf("provider = %q, want unknown (fallback)", id.CloudProvider)
	}
	if elapsed > 4*time.Second {
		t.Errorf("resolution took %v, should respect context timeout", elapsed)
	}
}

func TestResolverMachineIDInChain(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("machine-id not available on windows")
	}

	aws := &mockProvider{name: ProviderAWS, err: fmt.Errorf("not aws")}
	azure := &mockProvider{name: ProviderAzure, err: fmt.Errorf("not azure")}
	machineID := &mockProvider{
		name: ProviderOnPrem,
		id: &Identity{
			CloudProvider: ProviderOnPrem,
			InstanceID:    "host-abc123machine",
		},
	}

	r := NewResolverWithProviders([]Provider{aws, azure, machineID}, false)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.CloudProvider != ProviderOnPrem {
		t.Errorf("provider = %q, want on-prem", id.CloudProvider)
	}
	if id.InstanceID != "host-abc123machine" {
		t.Errorf("instance_id = %q", id.InstanceID)
	}
}

func TestResolverWithPersistence(t *testing.T) {
	dir := t.TempDir()
	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-persist",
			Region:        "us-west-2",
		},
	}

	r := NewResolverFull([]Provider{aws}, false, dir)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if id.AgentID == "" {
		t.Error("agent_id should be derived")
	}
	if id.ResolvedVia == "" {
		t.Error("resolved_via should be set")
	}

	// Verify persistence file exists
	if _, err := loadPersistedIdentity(dir); err != nil {
		t.Errorf("identity.json not persisted: %v", err)
	}
	if _, err := loadAgentID(dir); err != nil {
		t.Errorf("agent_id not persisted: %v", err)
	}
}

func TestResolverAgentIDDeterministic(t *testing.T) {
	dir1 := t.TempDir()
	dir2 := t.TempDir()

	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-determinism-check",
		},
	}

	r1 := NewResolverFull([]Provider{aws}, false, dir1)
	id1, err := r1.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	r2 := NewResolverFull([]Provider{aws}, false, dir2)
	id2, err := r2.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if id1.AgentID != id2.AgentID {
		t.Errorf("deterministic agent_id mismatch across resolvers: %q vs %q", id1.AgentID, id2.AgentID)
	}
}

func TestResolverResolvedViaSet(t *testing.T) {
	aws := &mockProvider{
		name: ProviderAWS,
		id: &Identity{
			CloudProvider: ProviderAWS,
			InstanceID:    "i-via",
		},
	}

	r := NewResolverWithProviders([]Provider{aws}, false)
	id, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.ResolvedVia != "aws-imds" {
		t.Errorf("resolved_via = %q, want aws-imds", id.ResolvedVia)
	}
}
