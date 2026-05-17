package identity

import (
	"context"

	"github.com/google/uuid"
)

// DO NOT CHANGE — changing this invalidates all deterministic agent_id values across the fleet.
var namespaceNeoGuard = uuid.MustParse("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")

type CloudProvider string

const (
	ProviderAWS     CloudProvider = "aws"
	ProviderAzure   CloudProvider = "azure"
	ProviderOnPrem  CloudProvider = "on-prem"
	ProviderUnknown CloudProvider = "unknown"
)

type Identity struct {
	CloudProvider    CloudProvider
	InstanceID       string
	Region           string
	AvailabilityZone string
	AccountID        string
	InstanceType     string
	Hostname         string
	OS               string
	OSVersion        string
	AgentID          string
	ResolvedVia      string
}

func (id *Identity) Tags() map[string]string {
	tags := map[string]string{
		"hostname": id.Hostname,
		"os":       id.OS,
	}
	tags["cloud_provider"] = string(id.CloudProvider)
	if id.InstanceID != "" {
		tags["resource_id"] = id.InstanceID
	}
	if id.Region != "" {
		tags["region"] = id.Region
	}
	if id.AvailabilityZone != "" {
		tags["availability_zone"] = id.AvailabilityZone
	}
	if id.AccountID != "" {
		tags["account_id"] = id.AccountID
	}
	if id.InstanceType != "" {
		tags["instance_type"] = id.InstanceType
	}
	if id.OSVersion != "" {
		tags["os_version"] = id.OSVersion
	}
	if id.AgentID != "" {
		tags["agent_id"] = id.AgentID
	}
	return tags
}

// DeterministicAgentID produces a UUIDv5 from the NeoGuard namespace and identity string.
func DeterministicAgentID(provider CloudProvider, resourceID string) string {
	return uuid.NewSHA1(namespaceNeoGuard, []byte(string(provider)+":"+resourceID)).String()
}

type Provider interface {
	Name() CloudProvider
	Detect(ctx context.Context) (*Identity, error)
}
