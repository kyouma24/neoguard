package identity

import "context"

type CloudProvider string

const (
	ProviderAWS     CloudProvider = "aws"
	ProviderAzure   CloudProvider = "azure"
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
}

func (id *Identity) Tags() map[string]string {
	tags := map[string]string{
		"hostname": id.Hostname,
		"os":       id.OS,
	}
	if id.CloudProvider != ProviderUnknown {
		tags["cloud_provider"] = string(id.CloudProvider)
	}
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
	return tags
}

type Provider interface {
	Name() CloudProvider
	Detect(ctx context.Context) (*Identity, error)
}
