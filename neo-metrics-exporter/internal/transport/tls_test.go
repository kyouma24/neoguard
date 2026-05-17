package transport

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

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

// Test: buildTLSConfig with empty path returns RootCAs==nil and TLS1.2 minimum
func TestBuildTLSConfigEmpty(t *testing.T) {
	cfg, err := buildTLSConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RootCAs != nil {
		t.Errorf("RootCAs = %v, want nil for empty path", cfg.RootCAs)
	}
	if cfg.MinVersion != tls.VersionTLS12 {
		t.Errorf("MinVersion = %x, want %x (TLS 1.2)", cfg.MinVersion, tls.VersionTLS12)
	}
}

// Test: buildTLSConfig with valid CA path returns non-nil RootCAs and TLS1.2
func TestBuildTLSConfigValid(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.pem")
	caPEM := generateTestCACert(t)
	if err := os.WriteFile(caPath, []byte(caPEM), 0600); err != nil {
		t.Fatal(err)
	}

	cfg, err := buildTLSConfig(caPath)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RootCAs == nil {
		t.Error("RootCAs = nil, want non-nil for custom CA path")
	}
	if cfg.MinVersion != tls.VersionTLS12 {
		t.Errorf("MinVersion = %x, want %x (TLS 1.2)", cfg.MinVersion, tls.VersionTLS12)
	}
}

// Test: buildTLSConfig with non-existent file returns error
func TestBuildTLSConfigNotFound(t *testing.T) {
	_, err := buildTLSConfig("/nonexistent/ca.pem")
	if err == nil {
		t.Fatal("expected error for non-existent file")
	}
}

// Test: buildTLSConfig with invalid PEM returns error
func TestBuildTLSConfigInvalidPEM(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "invalid.pem")
	if err := os.WriteFile(caPath, []byte("not a certificate"), 0600); err != nil {
		t.Fatal(err)
	}

	_, err := buildTLSConfig(caPath)
	if err == nil {
		t.Fatal("expected error for invalid PEM")
	}
}

// Test: buildTLSConfig handles SystemCertPool failure gracefully
func TestBuildTLSConfigSystemPoolFailure(t *testing.T) {
	// Save original function
	origFunc := loadSystemCertPool
	defer func() { loadSystemCertPool = origFunc }()

	// Inject failure
	loadSystemCertPool = func() (*x509.CertPool, error) {
		return nil, errors.New("simulated system pool failure")
	}

	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.pem")
	caPEM := generateTestCACert(t)
	if err := os.WriteFile(caPath, []byte(caPEM), 0600); err != nil {
		t.Fatal(err)
	}

	// Should still succeed with empty pool + custom CA
	cfg, err := buildTLSConfig(caPath)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RootCAs == nil {
		t.Error("RootCAs = nil, want non-nil even after system pool failure")
	}
}

// Test: newHTTPTransport creates transport with correct TLS config
func TestNewHTTPTransport(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.pem")
	caPEM := generateTestCACert(t)
	if err := os.WriteFile(caPath, []byte(caPEM), 0600); err != nil {
		t.Fatal(err)
	}

	tr, err := newHTTPTransport(caPath)
	if err != nil {
		t.Fatal(err)
	}
	if tr.TLSClientConfig == nil {
		t.Fatal("TLSClientConfig = nil")
	}
	if tr.TLSClientConfig.RootCAs == nil {
		t.Error("TLSClientConfig.RootCAs = nil, want non-nil")
	}
	if tr.TLSClientConfig.MinVersion != tls.VersionTLS12 {
		t.Errorf("MinVersion = %x, want %x", tr.TLSClientConfig.MinVersion, tls.VersionTLS12)
	}
	if tr.DisableCompression != true {
		t.Error("DisableCompression = false, want true")
	}
}

// Test: newHTTPTransport with empty path preserves default behavior
func TestNewHTTPTransportEmptyPath(t *testing.T) {
	tr, err := newHTTPTransport("")
	if err != nil {
		t.Fatal(err)
	}
	if tr.TLSClientConfig == nil {
		t.Fatal("TLSClientConfig = nil")
	}
	if tr.TLSClientConfig.RootCAs != nil {
		t.Errorf("RootCAs = %v, want nil for empty path", tr.TLSClientConfig.RootCAs)
	}
	if tr.TLSClientConfig.MinVersion != tls.VersionTLS12 {
		t.Errorf("MinVersion = %x, want %x", tr.TLSClientConfig.MinVersion, tls.VersionTLS12)
	}
}
