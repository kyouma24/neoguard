package identity

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSaveAndLoadIdentity(t *testing.T) {
	dir := t.TempDir()
	id := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-abc123",
		ResolvedVia:   "aws-imds",
	}

	if err := savePersistedIdentity(dir, id); err != nil {
		t.Fatal(err)
	}

	loaded, err := loadPersistedIdentity(dir)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ResourceID != "i-abc123" {
		t.Errorf("resource_id = %q", loaded.ResourceID)
	}
	if loaded.CloudProvider != "aws" {
		t.Errorf("cloud_provider = %q", loaded.CloudProvider)
	}
	if loaded.ResolvedVia != "aws-imds" {
		t.Errorf("resolved_via = %q", loaded.ResolvedVia)
	}
	if loaded.ResolvedAt == "" {
		t.Error("resolved_at should be set")
	}
}

func TestLoadIdentityMissingFile(t *testing.T) {
	dir := t.TempDir()
	_, err := loadPersistedIdentity(dir)
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestLoadIdentityCorruptJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "identity.json")
	if err := os.WriteFile(path, []byte("not json{{{"), 0600); err != nil {
		t.Fatal(err)
	}

	_, err := loadPersistedIdentity(dir)
	if err == nil {
		t.Fatal("expected error for corrupt JSON")
	}
}

func TestLoadIdentityMissingFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "identity.json")
	if err := os.WriteFile(path, []byte(`{"resource_id":"","cloud_provider":"aws"}`), 0600); err != nil {
		t.Fatal(err)
	}

	_, err := loadPersistedIdentity(dir)
	if err == nil {
		t.Fatal("expected error for missing resource_id")
	}
}

func TestSaveAndLoadAgentID(t *testing.T) {
	dir := t.TempDir()
	testID := "f47ac10b-58cc-4372-a567-0e02b2c3d479"

	if err := saveAgentID(dir, testID); err != nil {
		t.Fatal(err)
	}

	loaded, err := loadAgentID(dir)
	if err != nil {
		t.Fatal(err)
	}
	if loaded != testID {
		t.Errorf("agent_id = %q, want %q", loaded, testID)
	}
}

func TestLoadAgentIDMissingFile(t *testing.T) {
	dir := t.TempDir()
	_, err := loadAgentID(dir)
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestLoadAgentIDInvalidUUID(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent_id")
	if err := os.WriteFile(path, []byte("not-a-uuid\n"), 0600); err != nil {
		t.Fatal(err)
	}

	_, err := loadAgentID(dir)
	if err == nil {
		t.Fatal("expected error for invalid UUID")
	}
}

func TestDeriveAgentIDDeterministic(t *testing.T) {
	dir := t.TempDir()
	id := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-deterministic-test",
	}

	agentID1 := deriveAgentID(dir, id)
	if agentID1 == "" {
		t.Fatal("agent_id should not be empty")
	}

	// Second call with different state dir but same identity should produce same value
	dir2 := t.TempDir()
	agentID2 := deriveAgentID(dir2, id)

	if agentID1 != agentID2 {
		t.Errorf("deterministic agent_id mismatch: %q vs %q", agentID1, agentID2)
	}
}

func TestDeriveAgentIDPersistedSurvivesReload(t *testing.T) {
	dir := t.TempDir()
	id := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-persist-test",
	}

	agentID1 := deriveAgentID(dir, id)

	// Simulate restart: load from same dir
	agentID2 := deriveAgentID(dir, id)

	if agentID1 != agentID2 {
		t.Errorf("persisted agent_id changed: %q vs %q", agentID1, agentID2)
	}
}

func TestDeriveAgentIDRandomFallback(t *testing.T) {
	dir := t.TempDir()
	id := &Identity{
		CloudProvider: ProviderOnPrem,
		InstanceID:    "host-abc123",
	}

	agentID := deriveAgentID(dir, id)
	if agentID == "" {
		t.Fatal("agent_id should not be empty")
	}

	// Random: different state dir should produce different value
	dir2 := t.TempDir()
	agentID2 := deriveAgentID(dir2, id)
	if agentID == agentID2 {
		t.Error("random agent_id should differ across state dirs")
	}
}

func TestDeriveAgentIDKeepsExistingOnIdentityChange(t *testing.T) {
	dir := t.TempDir()
	id1 := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-first",
	}

	agentID1 := deriveAgentID(dir, id1)

	// Identity changes but agent_id file persists
	id2 := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-second",
	}

	agentID2 := deriveAgentID(dir, id2)
	if agentID1 != agentID2 {
		t.Errorf("agent_id should be preserved from file: %q vs %q", agentID1, agentID2)
	}
}

func TestAgentIDFilePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("file permissions not enforced on windows")
	}

	dir := t.TempDir()
	if err := saveAgentID(dir, "f47ac10b-58cc-4372-a567-0e02b2c3d479"); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(dir, "agent_id")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("agent_id file permissions = %o, want 0600", perm)
	}
}

func TestIdentityFilePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("file permissions not enforced on windows")
	}

	dir := t.TempDir()
	id := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-perm-test",
		ResolvedVia:   "aws-imds",
	}
	if err := savePersistedIdentity(dir, id); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(dir, "identity.json")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("identity.json permissions = %o, want 0600", perm)
	}
}

func TestCheckIdentityChangeDetects(t *testing.T) {
	dir := t.TempDir()
	oldID := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-old",
		ResolvedVia:   "aws-imds",
	}
	if err := savePersistedIdentity(dir, oldID); err != nil {
		t.Fatal(err)
	}

	newID := &Identity{
		CloudProvider: ProviderAzure,
		InstanceID:    "vm-new",
	}

	// Should not panic; logs the change
	checkIdentityChange(dir, newID)
}

func TestCheckIdentityChangeNoOp(t *testing.T) {
	dir := t.TempDir()
	id := &Identity{
		CloudProvider: ProviderAWS,
		InstanceID:    "i-same",
		ResolvedVia:   "aws-imds",
	}
	if err := savePersistedIdentity(dir, id); err != nil {
		t.Fatal(err)
	}

	// Same identity — should not log
	checkIdentityChange(dir, id)
}

func TestDeterministicAgentIDSameAcrossInstances(t *testing.T) {
	id1 := DeterministicAgentID(ProviderAWS, "i-test-determinism")
	id2 := DeterministicAgentID(ProviderAWS, "i-test-determinism")

	if id1 != id2 {
		t.Errorf("deterministic IDs differ: %q vs %q", id1, id2)
	}

	// Different input → different output
	id3 := DeterministicAgentID(ProviderAzure, "vm-different")
	if id1 == id3 {
		t.Error("different inputs should produce different agent_id")
	}
}
