package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// generateTestCACert creates a minimal valid self-signed CA certificate in PEM format
func generateTestCACert(t *testing.T) string {
	t.Helper()

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"Test CA"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		t.Fatal(err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	return string(certPEM)
}

// Test: ca_bundle_path empty string is valid (default behavior)
func TestCABundlePathEmpty(t *testing.T) {
	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CABundlePath != "" {
		t.Errorf("ca_bundle_path = %q, want empty", cfg.CABundlePath)
	}
}

// Test: ca_bundle_path with valid absolute path and valid PEM
func TestCABundlePathValid(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.pem")
	validPEM := generateTestCACert(t)
	if err := os.WriteFile(caPath, []byte(validPEM), 0600); err != nil {
		t.Fatal(err)
	}

	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
ca_bundle_path: `+caPath+`
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CABundlePath != caPath {
		t.Errorf("ca_bundle_path = %q, want %q", cfg.CABundlePath, caPath)
	}
}

// Test: ca_bundle_path with relative path is rejected
func TestCABundlePathRelative(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.pem")
	validPEM := generateTestCACert(t)
	if err := os.WriteFile(caPath, []byte(validPEM), 0600); err != nil {
		t.Fatal(err)
	}

	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
ca_bundle_path: ./ca.pem
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for relative path")
	}
	if !strings.Contains(err.Error(), "must be absolute") {
		t.Errorf("error = %q, want 'must be absolute'", err)
	}
}

// Test: ca_bundle_path pointing to non-existent file is rejected
func TestCABundlePathNotFound(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "nonexistent.pem")

	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
ca_bundle_path: `+caPath+`
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for non-existent file")
	}
	if !strings.Contains(err.Error(), "file not found") {
		t.Errorf("error = %q, want 'file not found'", err)
	}
}

// Test: ca_bundle_path pointing to directory is rejected
func TestCABundlePathIsDirectory(t *testing.T) {
	dir := t.TempDir()

	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
ca_bundle_path: `+dir+`
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for directory")
	}
	if !strings.Contains(err.Error(), "must be a file") {
		t.Errorf("error = %q, want 'must be a file'", err)
	}
}

// Test: ca_bundle_path with invalid PEM is rejected
func TestCABundlePathInvalidPEM(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "invalid.pem")
	if err := os.WriteFile(caPath, []byte("not a certificate"), 0600); err != nil {
		t.Fatal(err)
	}

	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
ca_bundle_path: `+caPath+`
`)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid PEM")
	}
	if !strings.Contains(err.Error(), "no valid PEM certificates") {
		t.Errorf("error = %q, want 'no valid PEM certificates'", err)
	}
}

// Test: ca_bundle_path with PEM containing multiple certificates
func TestCABundlePathMultipleCerts(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "bundle.pem")

	cert1 := generateTestCACert(t)
	cert2 := generateTestCACert(t)
	multiPEM := cert1 + cert2

	if err := os.WriteFile(caPath, []byte(multiPEM), 0600); err != nil {
		t.Fatal(err)
	}

	path := writeTestConfig(t, `
api_key: obl_live_v2_testkey123456
endpoint: http://localhost:8000
ca_bundle_path: `+caPath+`
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CABundlePath != caPath {
		t.Errorf("ca_bundle_path = %q, want %q", cfg.CABundlePath, caPath)
	}
}
