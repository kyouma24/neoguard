package identity

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
)

var machineIDPaths = []string{
	"/etc/machine-id",
	"/var/lib/dbus/machine-id",
}

type MachineIDProvider struct{}

func NewMachineIDProvider() *MachineIDProvider {
	return &MachineIDProvider{}
}

func (m *MachineIDProvider) Name() CloudProvider {
	return ProviderOnPrem
}

func (m *MachineIDProvider) Detect(ctx context.Context) (*Identity, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("machine-id: not available on windows")
	}

	machineID, err := readMachineID()
	if err != nil {
		return nil, err
	}

	return &Identity{
		CloudProvider: ProviderOnPrem,
		InstanceID:    "host-" + machineID,
	}, nil
}

func readMachineID() (string, error) {
	for _, path := range machineIDPaths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		id := strings.TrimSpace(string(data))
		if id == "" {
			continue
		}
		return id, nil
	}
	return "", fmt.Errorf("machine-id: no valid file found at %v", machineIDPaths)
}
