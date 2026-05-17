package identity

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/google/uuid"
)

type persistedIdentity struct {
	ResourceID    string `json:"resource_id"`
	CloudProvider string `json:"cloud_provider"`
	ResolvedVia   string `json:"resolved_via"`
	ResolvedAt    string `json:"resolved_at"`
}

func loadPersistedIdentity(stateDir string) (*persistedIdentity, error) {
	path := filepath.Join(stateDir, "identity.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var p persistedIdentity
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("identity.json corrupt: %w", err)
	}
	if p.ResourceID == "" || p.CloudProvider == "" {
		return nil, fmt.Errorf("identity.json: missing required fields")
	}
	return &p, nil
}

func savePersistedIdentity(stateDir string, id *Identity) error {
	if err := ensureStateDir(stateDir); err != nil {
		return err
	}

	p := persistedIdentity{
		ResourceID:    id.InstanceID,
		CloudProvider: string(id.CloudProvider),
		ResolvedVia:   id.ResolvedVia,
		ResolvedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}

	path := filepath.Join(stateDir, "identity.json")
	return os.WriteFile(path, data, 0600)
}

func loadAgentID(stateDir string) (string, error) {
	path := filepath.Join(stateDir, "agent_id")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	id := strings.TrimSpace(string(data))
	if _, err := uuid.Parse(id); err != nil {
		return "", fmt.Errorf("agent_id file invalid UUID: %w", err)
	}
	return id, nil
}

func saveAgentID(stateDir, agentID string) error {
	if err := ensureStateDir(stateDir); err != nil {
		return err
	}
	path := filepath.Join(stateDir, "agent_id")
	return os.WriteFile(path, []byte(agentID+"\n"), 0600)
}

func deriveAgentID(stateDir string, id *Identity) string {
	existing, err := loadAgentID(stateDir)
	if err == nil {
		return existing
	}

	var agentID string
	if id.CloudProvider == ProviderAWS || id.CloudProvider == ProviderAzure {
		agentID = DeterministicAgentID(id.CloudProvider, id.InstanceID)
		slog.Info("agent_id derived deterministically", "agent_id", agentID, "provider", id.CloudProvider)
	} else {
		agentID = uuid.New().String()
		slog.Warn("agent_id_random: not deterministic, reinstalls will create new identity", "agent_id", agentID)
	}

	if err := saveAgentID(stateDir, agentID); err != nil {
		slog.Error("failed to persist agent_id", "error", err)
	}
	return agentID
}

func checkIdentityChange(stateDir string, newID *Identity) {
	prev, err := loadPersistedIdentity(stateDir)
	if err != nil {
		return
	}

	if prev.ResourceID == newID.InstanceID && prev.CloudProvider == string(newID.CloudProvider) {
		return
	}

	slog.Warn("identity_changed",
		"was_resource_id", prev.ResourceID,
		"was_cloud_provider", prev.CloudProvider,
		"now_resource_id", newID.InstanceID,
		"now_cloud_provider", string(newID.CloudProvider),
	)
}

func ensureStateDir(stateDir string) error {
	if runtime.GOOS == "windows" {
		return os.MkdirAll(stateDir, 0750)
	}
	return os.MkdirAll(stateDir, 0750)
}
